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
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class StaffluentTaskService {
  private readonly logger = new Logger(StaffluentTaskService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    @InjectModel(TaskAssignment.name) private taskModel: Model<TaskAssignment>,
    @InjectModel(StaffProfile.name) private staffProfileModel: Model<StaffProfile>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(CronJobHistory.name) private cronJobHistoryModel: Model<CronJobHistory>,
    private readonly venueBoostService: VenueBoostService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('venueboost.baseUrl');
    this.apiKey = this.configService.get<string>('venueboost.apiKey');
  }

  /**
   * Update Task external ID in PHP via VenueBoost API
   */
  private async updateTaskExternalId(phpTaskId: number, omnistackTaskId: string): Promise<boolean> {
    try {
      this.logger.log(`Attempting to update task ${phpTaskId} with OmniStack ID ${omnistackTaskId}`);
      this.logger.log(`Making POST request to: ${this.baseUrl}/tasks-os/${phpTaskId}/external-id`);
      
      const response$ = this.httpService.post(
        `${this.baseUrl}/tasks-os/${phpTaskId}/external-id`,
        {
          omnistack_id: omnistackTaskId
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey
          }
        }
      );

      const response = await lastValueFrom(response$);
      
      this.logger.log(`API Response Status: ${response.status}`);
      this.logger.log(`API Response Data:`, JSON.stringify(response.data, null, 2));
      
      if (response.status >= 400) {
        this.logger.error(`Failed to update task ${phpTaskId} external ID: ${response.data.error || 'Unknown error'}`);
        return false;
      }

      this.logger.log(`Successfully updated task ${phpTaskId} with OmniStack ID ${omnistackTaskId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error updating task external ID for ${phpTaskId}:`, {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Sync tasks from VenueBoost to NestJS for a specific business
   */
  async syncTasksFromVenueBoost(businessId: string): Promise<{
    totalSynced: number;
    logs: string[];
    summary: any;
  }> {
    const startTime = new Date();
    const logs: string[] = [];
    
    logs.push(`[SYNC START] Syncing tasks from VenueBoost for business: ${businessId}`);
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
      logs.push(`Looking for business with ID: ${businessId}`);
      const business = await this.businessModel.findById(businessId);
      
      if (!business) {
        throw new Error(`Business ${businessId} not found`);
      }
      
      logs.push(`Found business: ${business.name}`);
      logs.push(`Business external IDs: ${JSON.stringify(business.externalIds)}`);
      
      if (!business.externalIds?.venueBoostId) {
        throw new Error(`Business ${businessId} (${business.name}) is not connected to VenueBoost - missing venueBoostId`);
      }

      logs.push(`Business VenueBoost ID: ${business.externalIds.venueBoostId}`);

      // Get tasks from VenueBoost API
      logs.push(`Calling VenueBoost API to get tasks...`);
      const venueBoostTasks = await this.venueBoostService.getTasks(business.externalIds.venueBoostId);
      
      logs.push(`VenueBoost API response received`);
      logs.push(`VenueBoost tasks structure: ${JSON.stringify(Object.keys(venueBoostTasks))}`);
      
      if (!venueBoostTasks || !venueBoostTasks.tasks) {
        logs.push(`ERROR: VenueBoost API returned invalid structure: ${JSON.stringify(venueBoostTasks)}`);
        throw new Error('VenueBoost API returned invalid task structure');
      }
      
      logs.push(`Retrieved ${venueBoostTasks.tasks.length} tasks from VenueBoost API`);
      
      const syncSummary = {
        added: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        deleted: 0, // Add deleted counter
        externalIdUpdates: 0,
        externalIdFailures: 0,
        assignmentChanges: 0
      };
      
      // Get all PHP task IDs from the response
      const phpTaskIds = venueBoostTasks.tasks.map(task => String(task.id));
      logs.push(`PHP task IDs: [${phpTaskIds.join(', ')}]`);
      
      for (const phpTask of venueBoostTasks.tasks) {
        try {
          logs.push(`\n--- Processing task: ${phpTask.name || phpTask.title || 'Unnamed'} (ID: ${phpTask.id}) ---`);
          logs.push(`Task data: ${JSON.stringify(phpTask, null, 2)}`);
          
          // Map PHP task status to MongoDB TaskStatus
          const status = this.mapPhpStatusToMongoStatus(phpTask.status);
          logs.push(`Mapped status: ${phpTask.status} -> ${status}`);
          
          // Check if task already exists in our system
          let existingTask = await this.taskModel.findOne({
            'externalIds.venueBoostTaskId': String(phpTask.id)
          });
          
          logs.push(`Task exists in system: ${!!existingTask}`);
          
          if (existingTask) {
            // Update existing task
            logs.push(`Updating existing task: ${existingTask._id}`);
            
            const updateData = {
              title: phpTask.name || phpTask.title,
              description: phpTask.description,
              status,
              priority: phpTask.priority ? phpTask.priority.toLowerCase() : 'medium',
              dueDate: phpTask.due_date ? new Date(phpTask.due_date) : undefined,
              businessId,
              metadata: {
                ...existingTask.metadata,
                requiredSkills: phpTask.required_skills || [],
                lastSyncedAt: new Date(),
                phpTaskId: phpTask.id,
                syncSource: 'php_venue_boost'
              }
            };
            
            logs.push(`Update data: ${JSON.stringify(updateData, null, 2)}`);
            
            await existingTask.updateOne(updateData);
            syncSummary.updated++;
            logs.push(`Successfully updated task: ${existingTask._id}`);

            // Check if PHP task needs external ID update
            let externalIds = {};
            if (phpTask.external_ids) {
              if (typeof phpTask.external_ids === 'string') {
                externalIds = JSON.parse(phpTask.external_ids);
              } else {
                externalIds = phpTask.external_ids;
              }
            }
            
            // Check for BOTH possible property names
            // @ts-ignore
            const hasOmnistackId = externalIds.omnistackId || externalIds.omniStackGateway;
            const needsUpdate = !hasOmnistackId;
            
            logs.push(`External IDs object: ${JSON.stringify(externalIds)}`);
            // @ts-ignore
            logs.push(`Has omnistackId: ${!!externalIds.omnistackId}`);
            // @ts-ignore
            logs.push(`Has omniStackGateway: ${!!externalIds.omniStackGateway}`);
            logs.push(`PHP task needs external ID update: ${needsUpdate}`);
                      
            if (needsUpdate) {
              logs.push(`Calling updateTaskExternalId(${phpTask.id}, ${existingTask._id.toString()})`);
              const updateSuccess = await this.updateTaskExternalId(phpTask.id, existingTask._id.toString());
              logs.push(`External ID update result: ${updateSuccess ? 'SUCCESS' : 'FAILED'}`);
              
              if (updateSuccess) {
                syncSummary.externalIdUpdates++;
              } else {
                syncSummary.externalIdFailures++;
              }
            }
          } else {
            // Create new task
            logs.push(`Creating new task...`);
            
            const createData = {
              title: phpTask.name || phpTask.title,
              description: phpTask.description,
              status,
              priority: phpTask.priority ? phpTask.priority.toLowerCase() : 'medium',
              dueDate: phpTask.due_date ? new Date(phpTask.due_date) : undefined,
              businessId,
              clientId: business.clientId,
              externalIds: {
                venueBoostTaskId: String(phpTask.id)
              },
              metadata: {
                requiredSkills: phpTask.required_skills || [],
                projectId: phpTask.project_id ? String(phpTask.project_id) : null,
                lastSyncedAt: new Date(),
                phpTaskId: phpTask.id,
                syncSource: 'php_venue_boost',
                createdViaSync: true
              }
            };
            
            logs.push(`Create data: ${JSON.stringify(createData, null, 2)}`);
            
            const newTask = await this.taskModel.create(createData);
            syncSummary.added++;
            logs.push(`Successfully created task: ${newTask._id}`);

            // Update PHP task with the new Task ID
            logs.push(`Calling updateTaskExternalId(${phpTask.id}, ${newTask._id.toString()})`);
            const updateSuccess = await this.updateTaskExternalId(phpTask.id, newTask._id.toString());
            logs.push(`External ID update result: ${updateSuccess ? 'SUCCESS' : 'FAILED'}`);
            
            if (updateSuccess) {
              syncSummary.externalIdUpdates++;
            } else {
              syncSummary.externalIdFailures++;
            }
          }
          
          // Handle task assignment changes (added, updated, removed)
          const task = existingTask || await this.taskModel.findOne({
            'externalIds.venueBoostTaskId': String(phpTask.id)
          });
          
          if (task) {
            const assignmentChanged = await this.syncTaskAssignment(task, phpTask, logs);
            if (assignmentChanged) {
              syncSummary.assignmentChanges++;
            }
          } else {
            logs.push(`ERROR: Could not find task to sync assignment for PHP task ${phpTask.id}`);
          }
          
        } catch (taskError) {
          const errorMsg = `Failed to sync task ${phpTask.id}: ${taskError.message}`;
          logs.push(`ERROR: ${errorMsg}`);
          logs.push(`Task error stack: ${taskError.stack}`);
          this.logger.error(errorMsg);
          syncSummary.failed++;
        }
      }
      
      // Handle deletions - find tasks in NestJS that no longer exist in PHP
      logs.push(`\n--- Processing deletions ---`);
      try {
        const existingNestJSTasks = await this.taskModel.find({
          businessId,
          'externalIds.venueBoostTaskId': { $exists: true },
          $or: [
            { isDeleted: { $ne: true } }, // Not already marked as deleted
            { isDeleted: { $exists: false } } // No isDeleted field
          ]
        });
        
        logs.push(`Found ${existingNestJSTasks.length} existing NestJS tasks for business`);
        
        const nestJSTaskIds = existingNestJSTasks.map(task => task.externalIds.venueBoostTaskId);
        logs.push(`NestJS task IDs: [${nestJSTaskIds.join(', ')}]`);
        
        // Find tasks that exist in NestJS but not in PHP (should be deleted)
        const tasksToDelete = existingNestJSTasks.filter(task => 
          !phpTaskIds.includes(task.externalIds.venueBoostTaskId)
        );
        
        logs.push(`Found ${tasksToDelete.length} tasks to delete: [${tasksToDelete.map(t => t.externalIds.venueBoostTaskId).join(', ')}]`);
        
        for (const taskToDelete of tasksToDelete) {
          try {
            logs.push(`Deleting task ${taskToDelete._id} (PHP ID: ${taskToDelete.externalIds.venueBoostTaskId})`);
            
            // Update staff workload if task was assigned
            if (taskToDelete.assignedUserId) {
              const staffProfile = await this.staffProfileModel.findOne({ 
                userId: taskToDelete.assignedUserId 
              });
              if (staffProfile) {
                await this.staffProfileModel.findByIdAndUpdate(
                  staffProfile._id,
                  { $inc: { currentWorkload: -1 } }
                );
                logs.push(`Decremented workload for staff ${staffProfile._id} due to task deletion`);
              }
            }
            
            // Mark as deleted (soft delete) instead of hard delete to maintain audit trail
            await taskToDelete.updateOne({
              isDeleted: true,
              deletedAt: new Date(),
              'metadata.deletionReason': 'sync_not_found_in_php',
              'metadata.deletedViaSync': true,
              'metadata.lastSyncedAt': new Date()
            });
            
            syncSummary.deleted++;
            logs.push(`✅ Successfully marked task ${taskToDelete._id} as deleted`);
            
          } catch (deleteError) {
            logs.push(`ERROR deleting task ${taskToDelete._id}: ${deleteError.message}`);
            this.logger.error(`Error deleting task ${taskToDelete._id}:`, deleteError);
          }
        }
        
      } catch (deletionError) {
        logs.push(`ERROR processing deletions: ${deletionError.message}`);
        this.logger.error(`Error processing deletions:`, deletionError);
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
          updated: syncSummary.updated,
          deleted: syncSummary.deleted,
          failed: syncSummary.failed,
          externalIdUpdates: syncSummary.externalIdUpdates,
          externalIdFailures: syncSummary.externalIdFailures,
          assignmentChanges: syncSummary.assignmentChanges
        }
      });
      
      const completionMsg = `[SYNC COMPLETE] Successfully synced ${totalSynced} tasks for business ${businessId}. Added: ${syncSummary.added}, Updated: ${syncSummary.updated}, Deleted: ${syncSummary.deleted}, External ID updates: ${syncSummary.externalIdUpdates}, failures: ${syncSummary.externalIdFailures}, assignment changes: ${syncSummary.assignmentChanges}`;
      logs.push(completionMsg);
      this.logger.log(completionMsg);
      
      return {
        totalSynced,
        logs,
        summary: syncSummary
      };
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
      
      const errorMsg = `[SYNC FAILED] Error syncing tasks from VenueBoost: ${error.message}`;
      logs.push(`ERROR: ${errorMsg}`);
      logs.push(`Error stack: ${error.stack}`);
      this.logger.error(errorMsg, error.stack);
      
      throw {
        message: error.message,
        logs,
        stack: error.stack
      };
    }
  }

  /**
   * Sync task assignment changes - handles added, updated, removed assignments
   * Returns true if assignment was changed, false if no change
   */
  private async syncTaskAssignment(task: any, phpTask: any, logs: string[]): Promise<boolean> {
    try {
      logs.push(`\n--- Syncing assignment for task ${task._id} ---`);
      
      // Get current assignment in our system
      const currentAssignedUserId = task.assignedUserId;
      logs.push(`Current assignment in our system: ${currentAssignedUserId || 'NONE'}`);
      
      // Get assignment from PHP system
      const phpAssigneeId = phpTask.assignee?.id;
      logs.push(`PHP system assignee ID: ${phpAssigneeId || 'NONE'}`);
      
      // Find staff profile for PHP assignee (if exists)
      let newStaffProfile = null;
      let newAssignedUserId = null;
      
      if (phpAssigneeId) {
        newStaffProfile = await this.staffProfileModel.findOne({
          'externalIds.venueBoostId': String(phpAssigneeId)
        });
        
        if (newStaffProfile) {
          newAssignedUserId = newStaffProfile.userId;
          logs.push(`Found staff profile for PHP assignee: ${newStaffProfile._id} (userId: ${newAssignedUserId})`);
        } else {
          logs.push(`WARNING: Staff profile not found for PHP assignee ID: ${phpAssigneeId}`);
        }
      }
      
      // Compare current vs new assignment
      const currentUserId = currentAssignedUserId?.toString();
      const newUserId = newAssignedUserId?.toString();
      
      if (currentUserId === newUserId) {
        logs.push(`✅ Assignment unchanged: ${currentUserId || 'NONE'}`);
        return false;
      }
      
      // Handle different assignment scenarios
      if (!currentUserId && newUserId) {
        // SCENARIO 1: Added assignment (was unassigned, now assigned)
        logs.push(`📥 ADDED assignment: NONE -> ${newUserId}`);
        await this.addTaskAssignment(task, newUserId, newStaffProfile, logs);
        return true;
        
      } else if (currentUserId && !newUserId) {
        // SCENARIO 2: Removed assignment (was assigned, now unassigned)
        logs.push(`📤 REMOVED assignment: ${currentUserId} -> NONE`);
        await this.removeTaskAssignment(task, currentUserId, logs);
        return true;
        
      } else if (currentUserId && newUserId) {
        // SCENARIO 3: Updated assignment (was assigned to A, now assigned to B)
        logs.push(`🔄 UPDATED assignment: ${currentUserId} -> ${newUserId}`);
        await this.updateTaskAssignment(task, currentUserId, newUserId, newStaffProfile, logs);
        return true;
      }
      
      return false;
    } catch (error) {
      logs.push(`ERROR syncing assignment for task ${task._id}: ${error.message}`);
      this.logger.error(`Error syncing task assignment: ${error.message}`, error.stack);
      return false;
    }
  }
  
  /**
   * Add new task assignment
   */
  private async addTaskAssignment(task: any, newUserId: string, staffProfile: any, logs: string[]): Promise<void> {
    await task.updateOne({
      assignedUserId: newUserId,
      assignedAt: new Date(),
      status: TaskStatus.ASSIGNED,
      'metadata.lastAssignmentSync': new Date(),
      'metadata.assignmentSyncAction': 'added'
    });
    
    // Update staff workload
    if (staffProfile) {
      await this.staffProfileModel.findByIdAndUpdate(
        staffProfile._id,
        { $inc: { currentWorkload: 1 } }
      );
      logs.push(`Incremented workload for staff ${staffProfile._id}`);
    }
    
    logs.push(`✅ Successfully added assignment to user: ${newUserId}`);
  }
  
  /**
   * Remove task assignment
   */
  private async removeTaskAssignment(task: any, currentUserId: string, logs: string[]): Promise<void> {
    await task.updateOne({
      $unset: { 
        assignedUserId: 1,
        assignedAt: 1
      },
      status: TaskStatus.UNASSIGNED,
      'metadata.lastAssignmentSync': new Date(),
      'metadata.assignmentSyncAction': 'removed',
      'metadata.previousAssigneeId': currentUserId
    });
    
    // Update staff workload
    const staffProfile = await this.staffProfileModel.findOne({ userId: currentUserId });
    if (staffProfile) {
      await this.staffProfileModel.findByIdAndUpdate(
        staffProfile._id,
        { $inc: { currentWorkload: -1 } }
      );
      logs.push(`Decremented workload for staff ${staffProfile._id}`);
    }
    
    logs.push(`✅ Successfully removed assignment from user: ${currentUserId}`);
  }
  
  /**
   * Update task assignment (reassign to different user)
   */
  private async updateTaskAssignment(task: any, currentUserId: string, newUserId: string, newStaffProfile: any, logs: string[]): Promise<void> {
    await task.updateOne({
      assignedUserId: newUserId,
      assignedAt: new Date(),
      status: TaskStatus.ASSIGNED,
      'metadata.lastAssignmentSync': new Date(),
      'metadata.assignmentSyncAction': 'updated',
      'metadata.previousAssigneeId': currentUserId
    });
    
    // Update workload for both users
    const oldStaffProfile = await this.staffProfileModel.findOne({ userId: currentUserId });
    if (oldStaffProfile) {
      await this.staffProfileModel.findByIdAndUpdate(
        oldStaffProfile._id,
        { $inc: { currentWorkload: -1 } }
      );
      logs.push(`Decremented workload for old staff ${oldStaffProfile._id}`);
    }
    
    if (newStaffProfile) {
      await this.staffProfileModel.findByIdAndUpdate(
        newStaffProfile._id,
        { $inc: { currentWorkload: 1 } }
      );
      logs.push(`Incremented workload for new staff ${newStaffProfile._id}`);
    }
    
    logs.push(`✅ Successfully updated assignment: ${currentUserId} -> ${newUserId}`);
  }
  
  /**
   * Push task assignment from NestJS to VenueBoost
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
      if (!staffProfile || !staffProfile.externalIds?.venueBoostId) {
        throw new Error(`Staff profile for user ${assigneeId} not found or not connected to VenueBoost`);
      }
      
      // Push assignment to VenueBoost
      await this.venueBoostService.assignTask(
        task.externalIds.venueBoostTaskId,
        staffProfile.externalIds.venueBoostId
      );
      
      // Update task status in our system
      await task.updateOne({
        status: TaskStatus.ASSIGNED,
        assignedUserId: assigneeId,
        assignedAt: new Date(),
        'metadata.assignmentSyncedToVenueBoost': true
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
          venueBoostStaffId: staffProfile.externalIds.venueBoostId,
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
      
      this.logger.error(`Error pushing task assignment to VenueBoost: ${error.message}`, error.stack);
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
   * Scheduled job to sync tasks from VenueBoost for all businesses
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
      // Find all businesses with VenueBoost connection
      const businesses = await this.businessModel.find({
        'externalIds.venueBoostId': { $exists: true, $ne: null }
      });
      
      const syncSummary = {
        added: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        deleted: 0,
        externalIdUpdates: 0,
        externalIdFailures: 0,
        assignmentChanges: 0
      };
      
      const businessResults = [];
      
      for (const business of businesses) {
        try {
          const syncResult = await this.syncTasksFromVenueBoost(business.id);
          
          businessResults.push({
            businessId: business.id,
            businessName: business.name,
            tasksSynced: syncResult.totalSynced,
            deleted: syncResult.summary.deleted,
            assignmentChanges: syncResult.summary.assignmentChanges,
            success: true
          });
          
          // Add to overall summary
          syncSummary.added += syncResult.summary.added;
          syncSummary.updated += syncResult.summary.updated;
          syncSummary.deleted += syncResult.summary.deleted;
          syncSummary.failed += syncResult.summary.failed;
          syncSummary.externalIdUpdates += syncResult.summary.externalIdUpdates;
          syncSummary.externalIdFailures += syncResult.summary.externalIdFailures;
          syncSummary.assignmentChanges += syncResult.summary.assignmentChanges;
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
          totalBusinesses: businesses.length,
          externalIdUpdates: syncSummary.externalIdUpdates,
          externalIdFailures: syncSummary.externalIdFailures,
          assignmentChanges: syncSummary.assignmentChanges
        }
      });
      
             this.logger.log(`[CRON COMPLETE] Task sync job completed at ${endTime.toISOString()}, duration: ${duration}s, processed ${businesses.length} businesses. Added: ${syncSummary.added}, Updated: ${syncSummary.updated}, Deleted: ${syncSummary.deleted}, External ID updates: ${syncSummary.externalIdUpdates}, failures: ${syncSummary.externalIdFailures}, assignment changes: ${syncSummary.assignmentChanges}`);
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

  /**
   * Manual sync trigger for a specific business
   */
  async triggerManualSync(businessId: string): Promise<{
    success: boolean;
    message: string;
    syncedCount?: number;
    externalIdUpdates?: number;
    externalIdFailures?: number;
    assignmentChanges?: number;
    logs: string[];
    summary?: any;
  }> {
    try {
      const syncResult = await this.syncTasksFromVenueBoost(businessId);
      return {
        success: true,
        message: `Successfully synced ${syncResult.totalSynced} tasks. External ID updates: ${syncResult.summary.externalIdUpdates}, failures: ${syncResult.summary.externalIdFailures}, assignment changes: ${syncResult.summary.assignmentChanges}`,
        syncedCount: syncResult.totalSynced,
        externalIdUpdates: syncResult.summary.externalIdUpdates,
        externalIdFailures: syncResult.summary.externalIdFailures,
        assignmentChanges: syncResult.summary.assignmentChanges,
        logs: syncResult.logs,
        summary: syncResult.summary
      };
    } catch (error) {
      this.logger.error(`Manual sync failed for business ${businessId}: ${error.message}`);
      
      // Handle both regular errors and our custom error objects with logs
      const logs = error.logs || [`ERROR: Manual sync failed for business ${businessId}: ${error.message}`];
      
      return {
        success: false,
        message: `Sync failed: ${error.message}`,
        logs: logs,
        syncedCount: 0,
        externalIdUpdates: 0,
        externalIdFailures: 0,
        assignmentChanges: 0
      };
    }
  }
}