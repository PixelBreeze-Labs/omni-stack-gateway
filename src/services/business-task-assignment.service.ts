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
   * Get approved and rejected task assignments with pagination
   */
  async getApprovedRejectedTasks(
    businessId: string,
    page: number = 1,
    limit: number = 10,
    filters: {
      status?: 'approved' | 'rejected';
      dateFrom?: Date;
      dateTo?: Date;
    } = {}
  ): Promise<{
    tasks: TaskAssignment[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    summary: {
      approved: number;
      rejected: number;
      total: number;
    };
  }> {
    const skip = (page - 1) * limit;
    
    // Build query conditions
    const baseQuery: any = {
      businessId,
      isDeleted: false,
      $or: [
        { 'metadata.assignmentStatus': 'approved' },
        { 'metadata.assignmentStatus': 'rejected' }
      ]
    };

    // Apply status filter
    if (filters.status) {
      baseQuery['metadata.assignmentStatus'] = filters.status;
    }

    // Apply date filters
    if (filters.dateFrom || filters.dateTo) {
      baseQuery.updatedAt = {};
      if (filters.dateFrom) {
        baseQuery.updatedAt.$gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        baseQuery.updatedAt.$lte = filters.dateTo;
      }
    }

    // Get paginated results
    const tasks = await this.taskModel
      .find(baseQuery)
      .populate('assignedUserId', 'name surname email')
      .populate('clientId', 'name email')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    // Get total count
    const total = await this.taskModel.countDocuments(baseQuery);

    // Get summary counts
    const [approvedCount, rejectedCount] = await Promise.all([
      this.taskModel.countDocuments({
        businessId,
        'metadata.assignmentStatus': 'approved',
        isDeleted: false
      }),
      this.taskModel.countDocuments({
        businessId,
        'metadata.assignmentStatus': 'rejected',
        isDeleted: false
      })
    ]);

    return {
      tasks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      summary: {
        approved: approvedCount,
        rejected: rejectedCount,
        total: approvedCount + rejectedCount
      }
    };
  }

  /**
   * Get assignment statistics for a business
   */
  async getAssignmentStats(
    businessId: string,
    period: 'today' | 'week' | 'month' = 'today'
  ): Promise<{
    pending: number;
    approved: number;
    rejected: number;
    approvedToday: number;
    rejectedToday: number;
    trends: {
      approvedTrend: number;
      rejectedTrend: number;
    };
  }> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    // Get pending count
    const pending = await this.taskModel.countDocuments({
      businessId,
      'metadata.pendingAssignment': { $exists: true },
      isDeleted: false
    });

    // Get total approved and rejected
    const [approved, rejected] = await Promise.all([
      this.taskModel.countDocuments({
        businessId,
        'metadata.assignmentStatus': 'approved',
        isDeleted: false
      }),
      this.taskModel.countDocuments({
        businessId,
        'metadata.assignmentStatus': 'rejected',
        isDeleted: false
      })
    ]);

    // Get today's counts
    const [approvedToday, rejectedToday] = await Promise.all([
      this.taskModel.countDocuments({
        businessId,
        'metadata.assignmentStatus': 'approved',
        updatedAt: { $gte: today },
        isDeleted: false
      }),
      this.taskModel.countDocuments({
        businessId,
        'metadata.assignmentStatus': 'rejected',
        updatedAt: { $gte: today },
        isDeleted: false
      })
    ]);

    // Get yesterday's counts for trend calculation
    const [approvedYesterday, rejectedYesterday] = await Promise.all([
      this.taskModel.countDocuments({
        businessId,
        'metadata.assignmentStatus': 'approved',
        updatedAt: { $gte: yesterday, $lt: today },
        isDeleted: false
      }),
      this.taskModel.countDocuments({
        businessId,
        'metadata.assignmentStatus': 'rejected',
        updatedAt: { $gte: yesterday, $lt: today },
        isDeleted: false
      })
    ]);

    // Calculate trends (percentage change)
    const approvedTrend = approvedYesterday === 0 
      ? (approvedToday > 0 ? 100 : 0)
      : ((approvedToday - approvedYesterday) / approvedYesterday) * 100;

    const rejectedTrend = rejectedYesterday === 0 
      ? (rejectedToday > 0 ? 100 : 0)
      : ((rejectedToday - rejectedYesterday) / rejectedYesterday) * 100;

    return {
      pending,
      approved,
      rejected,
      approvedToday,
      rejectedToday,
      trends: {
        approvedTrend: Math.round(approvedTrend),
        rejectedTrend: Math.round(rejectedTrend)
      }
    };
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