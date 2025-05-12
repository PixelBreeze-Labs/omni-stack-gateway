// src/services/staffluent-task.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TaskAssignment, TaskStatus } from '../schemas/task-assignment.schema';
import { StaffProfile } from '../schemas/staff-profile.schema';
import { Business } from '../schemas/business.schema';
import { VenueBoostService } from './venueboost.service';
import { CronJobHistory } from '../schemas/cron-job-history.schema';

@Injectable()
export class StaffluentTaskService {
  private readonly logger = new Logger(StaffluentTaskService.name);

  constructor(
    @InjectModel(TaskAssignment.name) private taskModel: Model<TaskAssignment>,
    @InjectModel(StaffProfile.name) private staffProfileModel: Model<StaffProfile>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(CronJobHistory.name) private cronJobHistoryModel: Model<CronJobHistory>,
    private readonly venueBoostService: VenueBoostService,
  ) {}

   /**
   * Sync tasks from VenueBoost to NestJS for a specific business
   */
   async syncTasksFromVenueBoost(businessId: string): Promise<number> {
    const startTime = new Date();
    this.logger.log(`[SYNC START] Syncing tasks from VenueBoost for business: ${businessId}`);
    
    // Create a record for this job execution
    const jobRecord = await this.cronJobHistoryModel.create({
      jobName: 'syncTasksFromVenueBoost',
      startTime,
      status: 'started',
      businessId
    });
    
    try {
      // Find the business in our system
      const business = await this.businessModel.findById(businessId);
      if (!business || !business.externalIds?.venueBoostId) {
        throw new Error(`Business ${businessId} not found or not connected to VenueBoost`);
      }

      // Get tasks from VenueBoost API
      const venueBoostTasks = await this.venueBoostService.getTasks(business.externalIds.venueBoostId);
      
      const syncSummary = {
        added: 0,
        updated: 0,
        skipped: 0,
        failed: 0
      };
      
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
          syncSummary.updated++;
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
          syncSummary.added++;
        }
        
        // If task is already assigned in VenueBoost, update assignment in our system
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
      }
      
      const totalSynced = syncSummary.added + syncSummary.updated;
      
      // Update the job record on completion
      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000;
      
      await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
        endTime,
        duration,
        status: 'completed',
        syncSummary,
        targetCount: venueBoostTasks.tasks.length,
        processedCount: totalSynced,
        details: { 
          businessId,
          taskCount: venueBoostTasks.tasks.length,
          added: syncSummary.added,
          updated: syncSummary.updated
        }
      });
      
      this.logger.log(`[SYNC COMPLETE] Successfully synced ${totalSynced} tasks for business ${businessId}`);
      return totalSynced;
    } catch (error) {
      // Update the job record on failure
      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000;
      
      await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
        endTime,
        duration,
        status: 'failed',
        error: error.message
      });
      
      this.logger.error(`[SYNC FAILED] Error syncing tasks from VenueBoost: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  
  /**
   * Push task assignment from NestJS to Staffluent
   */
  async pushTaskAssignment(taskId: string, assigneeId: string): Promise<boolean> {
    const startTime = new Date();
    
    // Create a record for this job execution
    const jobRecord = await this.cronJobHistoryModel.create({
      jobName: 'pushTaskAssignment',
      startTime,
      status: 'started',
      details: { taskId, assigneeId }
    });
    
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
      
      // Update the job record on success
      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000;
      
      await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
        endTime,
        duration,
        status: 'completed',
        businessId: task.businessId,
        details: {
          taskId,
          assigneeId,
          venueBoostTaskId: task.externalIds.venueBoostTaskId,
          venueBoostStaffId: staffProfile.externalIds.venueBoostStaffId,
          taskTitle: task.title,
          successful: true
        }
      });
      
      return true;
    } catch (error) {
      // Update the job record on failure
      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000;
      
      await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
        endTime,
        duration,
        status: 'failed',
        error: error.message
      });
      
      this.logger.error(`Error pushing task assignment to Staffluent: ${error.message}`, error.stack);
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
     const startTime = new Date();
     this.logger.log(`[CRON START] Task sync job started at ${startTime.toISOString()}`);
     
     // Create a record for this job execution
     const jobRecord = await this.cronJobHistoryModel.create({
       jobName: 'scheduledTaskSync',
       startTime,
       status: 'started'
     });
     
     try {
       // Find all businesses with Staffluent connection
       const businesses = await this.businessModel.find({
         'externalIds.staffluentId': { $exists: true, $ne: null }
       });
       
       const syncSummary = {
         added: 0,
         updated: 0,
         skipped: 0,
         failed: 0
       };
       
       const businessResults = [];
       
       for (const business of businesses) {
         try {
           const count = await this.syncTasksFromVenueBoost(business.id);
           
           businessResults.push({
             businessId: business.id,
             businessName: business.name,
             tasksSynced: count,
             success: true
           });
         } catch (error) {
           this.logger.error(`Error syncing tasks for business ${business.id}: ${error.message}`);
           
           businessResults.push({
             businessId: business.id,
             businessName: business.name,
             error: error.message,
             success: false
           });
           
           syncSummary.failed++;
         }
       }
       
       // Update the job record on completion
       const endTime = new Date();
       const duration = (endTime.getTime() - startTime.getTime()) / 1000;
       
       await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
         endTime,
         duration,
         status: 'completed',
         businessIds: businesses.map(b => b.id),
         targetCount: businesses.length,
         processedCount: businesses.length - syncSummary.failed,
         failedCount: syncSummary.failed,
         syncSummary,
         details: { 
           businessResults,
           totalBusinesses: businesses.length
         }
       });
       
       this.logger.log(`[CRON COMPLETE] Task sync job completed at ${endTime.toISOString()}, duration: ${duration}s, processed ${businesses.length} businesses`);
     } catch (error) {
       // Update the job record on failure
       const endTime = new Date();
       const duration = (endTime.getTime() - startTime.getTime()) / 1000;
       
       await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
         endTime,
         duration,
         status: 'failed',
         error: error.message
       });
       
       this.logger.error(`[CRON FAILED] Error in task sync job: ${error.message}`, error.stack);
     }
   }
}