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
        failed: 0
      };
      
      for (const phpTask of venueBoostTasks.tasks) {
        try {
          logs.push(`\n--- Processing task: ${phpTask.name || phpTask.title || 'Unnamed'} (ID: ${phpTask.id}) ---`);
          logs.push(`Task data: ${JSON.stringify(phpTask, null, 2)}`);
          
          // Map PHP task status to MongoDB TaskStatus
          const status = this.mapPhpStatusToMongoStatus(phpTask.status);
          logs.push(`Mapped status: ${phpTask.status} -> ${status}`);
          
          // Check if task already exists in our system
          const existingTask = await this.taskModel.findOne({
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
              priority: phpTask.priority ? phpTask.priority.toUpperCase() : 'MEDIUM',
              dueDate: phpTask.due_date ? new Date(phpTask.due_date) : undefined,
              businessId,
              metadata: {
                ...existingTask.metadata,
                requiredSkills: phpTask.required_skills || [],
                lastSyncedAt: new Date()
              }
            };
            
            logs.push(`Update data: ${JSON.stringify(updateData, null, 2)}`);
            
            await existingTask.updateOne(updateData);
            syncSummary.updated++;
            logs.push(`Successfully updated task: ${existingTask._id}`);
          } else {
            // Create new task
            logs.push(`Creating new task...`);
            
            const createData = {
              title: phpTask.name || phpTask.title,
              description: phpTask.description,
              status,
              priority: phpTask.priority ? phpTask.priority.toUpperCase() : 'MEDIUM',
              dueDate: phpTask.due_date ? new Date(phpTask.due_date) : undefined,
              businessId,
              clientId: business.clientId,
              externalIds: {
                venueBoostTaskId: String(phpTask.id)
              },
              metadata: {
                requiredSkills: phpTask.required_skills || [],
                projectId: phpTask.project_id ? String(phpTask.project_id) : null,
                lastSyncedAt: new Date()
              }
            };
            
            logs.push(`Create data: ${JSON.stringify(createData, null, 2)}`);
            
            const newTask = await this.taskModel.create(createData);
            syncSummary.added++;
            logs.push(`Successfully created task: ${newTask._id}`);
          }
          
          // Handle task assignment if present
          if (phpTask.assignee && phpTask.assignee.id) {
            logs.push(`Task has assignee: ${phpTask.assignee.id} (${phpTask.assignee.name || 'Unknown'})`);
            
            const staffProfile = await this.staffProfileModel.findOne({
              'externalIds.venueBoostId': String(phpTask.assignee.id)
            });
            
            if (staffProfile) {
              logs.push(`Found staff profile for assignee: ${staffProfile._id}`);
              
              const task = existingTask || await this.taskModel.findOne({
                'externalIds.venueBoostTaskId': String(phpTask.id)
              });
              
              if (task) {
                await task.updateOne({
                  assignedUserId: staffProfile.userId,
                  assignedAt: new Date(),
                  status: TaskStatus.ASSIGNED
                });
                logs.push(`Updated task assignment to user: ${staffProfile.userId}`);
              }
            } else {
              logs.push(`WARNING: Staff profile not found for assignee ID: ${phpTask.assignee.id}`);
            }
          } else {
            logs.push(`Task has no assignee`);
          }
          
        } catch (taskError) {
          const errorMsg = `Failed to sync task ${phpTask.id}: ${taskError.message}`;
          logs.push(`ERROR: ${errorMsg}`);
          logs.push(`Task error stack: ${taskError.stack}`);
          this.logger.error(errorMsg);
          syncSummary.failed++;
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
          updated: syncSummary.updated,
          failed: syncSummary.failed
        }
      });
      
      const completionMsg = `[SYNC COMPLETE] Successfully synced ${totalSynced} tasks for business ${businessId}`;
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
         failed: 0
       };
       
       const businessResults = [];
       
       for (const business of businesses) {
         try {
           const syncResult = await this.syncTasksFromVenueBoost(business.id);
           
           businessResults.push({
             businessId: business.id,
             businessName: business.name,
             tasksSynced: syncResult.totalSynced,
             success: true
           });
           
           // Add to overall summary
           syncSummary.added += syncResult.summary.added;
           syncSummary.updated += syncResult.summary.updated;
           syncSummary.failed += syncResult.summary.failed;
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

   /**
    * Manual sync trigger for a specific business
    */
   async triggerManualSync(businessId: string): Promise<{
     success: boolean;
     message: string;
     syncedCount?: number;
     logs: string[];
     summary?: any;
   }> {
     try {
       const syncResult = await this.syncTasksFromVenueBoost(businessId);
       return {
         success: true,
         message: `Successfully synced ${syncResult.totalSynced} tasks`,
         syncedCount: syncResult.totalSynced,
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
         syncedCount: 0
       };
     }
   }
}