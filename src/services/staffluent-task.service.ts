// src/services/staffluent-task.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TaskAssignment, TaskStatus } from '../schemas/task-assignment.schema';
import { StaffProfile } from '../schemas/staff-profile.schema';
import { Business } from '../schemas/business.schema';
import { VenueBoostService } from './venueboost.service';

@Injectable()
export class StaffluentTaskService {
  private readonly logger = new Logger(StaffluentTaskService.name);

  constructor(
    @InjectModel(TaskAssignment.name) private taskModel: Model<TaskAssignment>,
    @InjectModel(StaffProfile.name) private staffProfileModel: Model<StaffProfile>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    private readonly venueBoostService: VenueBoostService,
  ) {}

  /**
   * Sync tasks from Staffluent to NestJS for a specific business
   */
  async syncTasksFromStaffluent(businessId: string): Promise<number> {
    try {
      this.logger.log(`Syncing tasks from Staffluent for business: ${businessId}`);
      
      // Find the business in our system
      const business = await this.businessModel.findById(businessId);
      if (!business || !business.externalIds?.venueBoostId) {
        throw new Error(`Business ${businessId} not found or not connected to VenueBoost`);
      }

      // Get tasks from Staffluent API
      const venueBoostTasks = await this.venueBoostService.getTasks(business.externalIds.venueBoostId);
      
      let syncCount = 0;
      for (const phpTask of venueBoostTasks.tasks) {
        // Map PHP task status to MongoDB TaskStatus
        const status = this.mapPhpStatusToMongoStatus(phpTask.status);
        
        // Check if task already exists in our system
        let task = await this.taskModel.findOne({
          'externalIds.venueBoostTaskId': String(phpTask.id)
        });
        
        if (task) {
          // Update existing task
          await task.updateOne({
            title: phpTask.name,
            description: phpTask.description,
            status,
            priority: phpTask.priority.toUpperCase(),
            dueDate: phpTask.due_date ? new Date(phpTask.due_date) : undefined,
            businessId,
            metadata: {
              ...task.metadata,
              requiredSkills: phpTask.required_skills || [],
              lastSyncedAt: new Date()
            }
          });
        } else {
          // Create new task
          task = await this.taskModel.create({
            title: phpTask.name,
            description: phpTask.description,
            status,
            priority: phpTask.priority.toUpperCase(),
            dueDate: phpTask.due_date ? new Date(phpTask.due_date) : undefined,
            businessId,
            externalIds: {
              venueBoostTaskId: String(phpTask.id)
            },
            metadata: {
              requiredSkills: phpTask.required_skills || [],
              projectId: phpTask.project_id ? String(phpTask.project_id) : null,
              lastSyncedAt: new Date()
            }
          });
        }
        
        // If task is already assigned in Staffluent, update assignment in our system
        if (phpTask.assignee && phpTask.assignee.id) {
          const staffProfile = await this.staffProfileModel.findOne({
            'externalIds.venueBoostStaffId': String(phpTask.assignee.id)
          });
          
          if (staffProfile) {
            await task.updateOne({
              assignedUserId: staffProfile.userId,
              assignedAt: new Date(),
              status: TaskStatus.ASSIGNED
            });
          }
        }
        
        syncCount++;
      }
      
      this.logger.log(`Successfully synced ${syncCount} tasks for business ${businessId}`);
      return syncCount;
    } catch (error) {
      this.logger.error(`Error syncing tasks from Staffluent: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Push task assignment from NestJS to Staffluent
   */
  async pushTaskAssignment(taskId: string, assigneeId: string): Promise<boolean> {
    try {
      // Find the task in our system
      const task = await this.taskModel.findById(taskId);
      if (!task || !task.externalIds?.venueBoostTaskId) {
        throw new Error(`Task ${taskId} not found or not connected to VenueBoost`);
      }
      
      // Find the staff profile for the assignee
      const staffProfile = await this.staffProfileModel.findOne({ userId: assigneeId });
      if (!staffProfile || !staffProfile.externalIds?.venueBoostStaffId) {
        throw new Error(`Staff profile for user ${assigneeId} not found or not connected to VenueBoost`);
      }
      
      // Push assignment to Staffluent
      await this.venueBoostService.assignTask(
        task.externalIds.venueBoostTaskId,
        staffProfile.externalIds.venueBoostStaffId
      );
      
      // Update task status in our system
      await task.updateOne({
        status: TaskStatus.ASSIGNED,
        assignedUserId: assigneeId,
        assignedAt: new Date(),
        'metadata.assignmentSyncedToStaffluent': true
      });
      
      return true;
    } catch (error) {
      this.logger.error(`Error pushing task assignment to Staffluent: ${error.message}`, error.stack);
      return false;
    }
  }
  
  /**
   * Update external ID mapping for a task
   */
  async updateTaskExternalId(taskId: string, venueBoostTaskId: string): Promise<boolean> {
    try {
      const task = await this.taskModel.findByIdAndUpdate(
        taskId,
        { 'externalIds.venueBoostTaskId': venueBoostTaskId },
        { new: true }
      );
      
      return !!task;
    } catch (error) {
      this.logger.error(`Error updating task external ID: ${error.message}`, error.stack);
      return false;
    }
  }
  
  /**
   * Map PHP task status to MongoDB TaskStatus enum
   */
  private mapPhpStatusToMongoStatus(phpStatus: string): TaskStatus {
    switch (phpStatus.toLowerCase()) {
      case 'todo':
        return TaskStatus.UNASSIGNED;
      case 'in_progress':
        return TaskStatus.IN_PROGRESS;
      case 'done':
        return TaskStatus.COMPLETED;
      case 'cancelled':
        return TaskStatus.CANCELLED;
      case 'assigned':
        return TaskStatus.ASSIGNED;
      default:
        return TaskStatus.UNASSIGNED;
    }
  }
  
  /**
   * Map MongoDB TaskStatus to PHP task status
   */
  private mapMongoStatusToPhpStatus(mongoStatus: TaskStatus): string {
    switch (mongoStatus) {
      case TaskStatus.UNASSIGNED:
        return 'todo';
      case TaskStatus.IN_PROGRESS:
        return 'in_progress';
      case TaskStatus.COMPLETED:
        return 'done';
      case TaskStatus.CANCELLED:
        return 'cancelled';
      case TaskStatus.ASSIGNED:
        return 'assigned';
      default:
        return 'todo';
    }
  }
  
  /**
   * Scheduled job to sync tasks from Staffluent for all businesses
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledTaskSync() {
    try {
      this.logger.log('Starting scheduled task sync for all businesses');
      
      // Find all businesses with Staffluent connection
      const businesses = await this.businessModel.find({
        'externalIds.staffluentId': { $exists: true, $ne: null }
      });
      
      let totalSynced = 0;
      for (const business of businesses) {
        try {
          const count = await this.syncTasksFromStaffluent(business.id);
          totalSynced += count;
        } catch (error) {
          this.logger.error(`Error syncing tasks for business ${business.id}: ${error.message}`);
          // Continue with next business even if one fails
        }
      }
      
      this.logger.log(`Completed task sync, updated ${totalSynced} tasks across ${businesses.length} businesses`);
    } catch (error) {
      this.logger.error(`Error in scheduled task sync: ${error.message}`, error.stack);
    }
  }
}