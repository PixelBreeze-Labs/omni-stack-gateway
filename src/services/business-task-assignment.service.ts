// src/services/business-task-assignment.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TaskAssignment } from '../schemas/task-assignment.schema';
import { AutoAssignmentAgentService } from './auto-assignment-agent.service';
import { CronJobHistory } from '../schemas/cron-job-history.schema';

@Injectable()
export class BusinessTaskAssignmentService {
  private readonly logger = new Logger(BusinessTaskAssignmentService.name);

  constructor(
    @InjectModel(TaskAssignment.name) private taskModel: Model<TaskAssignment>,
    @InjectModel(CronJobHistory.name) private cronJobHistoryModel: Model<CronJobHistory>,
    private readonly autoAssignmentAgentService: AutoAssignmentAgentService
  ) {}

  /**
   * Get task by ID
   */
  async getTaskById(taskId: string): Promise<TaskAssignment> {
    return this.taskModel.findById(taskId);
  }

  /**
   * Get all tasks pending approval for a business
   */
  async getPendingApprovalTasks(businessId: string): Promise<TaskAssignment[]> {
    return this.taskModel.find({
      businessId,
      'metadata.pendingAssignment': { $exists: true },
      isDeleted: false
    }).populate('assignedUserId', 'name surname email');
  }

  /**
   * Trigger auto-assignment for a specific task
   */
  async triggerAutoAssign(taskId: string): Promise<boolean> {
    const startTime = new Date();
    
    // Create a record for this job execution
    const jobRecord = await this.cronJobHistoryModel.create({
      jobName: 'manuallyTriggeredAutoAssign',
      startTime,
      status: 'started',
      details: { taskId, triggeredBy: 'business_api' }
    });
    
    try {
      const task = await this.taskModel.findById(taskId);
      if (!task) {
        await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
          endTime: new Date(),
          duration: (new Date().getTime() - startTime.getTime()) / 1000,
          status: 'failed',
          error: 'Task not found'
        });
        
        throw new NotFoundException('Task not found');
      }
      
      // Call the auto-assignment agent to find optimal assignee
      await this.autoAssignmentAgentService.findOptimalAssignee(task);
      
      // Update job record
      const endTime = new Date();
      await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
        endTime,
        duration: (endTime.getTime() - startTime.getTime()) / 1000,
        status: 'completed',
        businessId: task.businessId,
        details: { 
          taskId,
          triggeredBy: 'business_api',
          success: true
        }
      });
      
      return true;
    } catch (error) {
      // Update job record on failure
      const endTime = new Date();
      await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
        endTime,
        duration: (endTime.getTime() - startTime.getTime()) / 1000,
        status: 'failed',
        error: error.message
      });
      
      this.logger.error(`Error in manually triggered auto-assign: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Approve a pending task assignment
   */
  async approveTaskAssignment(taskId: string): Promise<TaskAssignment> {
    const startTime = new Date();
    
    // Create a record for this job execution
    const jobRecord = await this.cronJobHistoryModel.create({
      jobName: 'manuallyApproveAssignment',
      startTime,
      status: 'started',
      details: { taskId, triggeredBy: 'business_api' }
    });
    
    try {
      const result = await this.autoAssignmentAgentService.approveAssignment(taskId);
      
      // Update job record
      const endTime = new Date();
      await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
        endTime,
        duration: (endTime.getTime() - startTime.getTime()) / 1000,
        status: 'completed',
        businessId: result.businessId,
        details: { 
          taskId,
          triggeredBy: 'business_api',
          success: true,
          assignedUserId: result.assignedUserId
        }
      });
      
      return result;
    } catch (error) {
      // Update job record on failure
      const endTime = new Date();
      await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
        endTime,
        duration: (endTime.getTime() - startTime.getTime()) / 1000,
        status: 'failed',
        error: error.message
      });
      
      this.logger.error(`Error in manually approving assignment: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Reject a pending task assignment
   */
  async rejectTaskAssignment(taskId: string, reason: string): Promise<TaskAssignment> {
    const startTime = new Date();
    
    // Create a record for this job execution
    const jobRecord = await this.cronJobHistoryModel.create({
      jobName: 'manuallyRejectAssignment',
      startTime,
      status: 'started',
      details: { taskId, reason, triggeredBy: 'business_api' }
    });
    
    try {
      const result = await this.autoAssignmentAgentService.rejectAssignment(taskId, reason);
      
      // Update job record
      const endTime = new Date();
      await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
        endTime,
        duration: (endTime.getTime() - startTime.getTime()) / 1000,
        status: 'completed',
        businessId: result.businessId,
        details: { 
          taskId,
          triggeredBy: 'business_api',
          success: true,
          reason
        }
      });
      
      return result;
    } catch (error) {
      // Update job record on failure
      const endTime = new Date();
      await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
        endTime,
        duration: (endTime.getTime() - startTime.getTime()) / 1000,
        status: 'failed',
        error: error.message
      });
      
      this.logger.error(`Error in manually rejecting assignment: ${error.message}`, error.stack);
      throw error;
    }
  }
}