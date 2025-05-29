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
   * Debug method to check all tasks and their status fields
   */
  async debugTaskStatuses(businessId: string): Promise<any[]> {
    const allTasks = await this.taskModel.find({
      businessId,
      isDeleted: false
    }).select('title status metadata assignedUserId createdAt updatedAt').limit(20);
    
    this.logger.log(`Debug: Found ${allTasks.length} tasks for business ${businessId}`);
    allTasks.forEach(task => {
      this.logger.log({
        id: task._id,
        title: task.title,
        status: task.status,
        assignedUserId: !!task.assignedUserId,
        hasPendingAssignment: !!task.metadata?.pendingAssignment,
        hasRejectionReason: !!task.metadata?.rejectionReason,
        assignmentStatus: task.metadata?.assignmentStatus,
        metadataKeys: Object.keys(task.metadata || {})
      });
    });
    
    return allTasks;
  }

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
    const tasks = await this.taskModel.aggregate([
      {
        $match: {
          businessId,
          'metadata.pendingAssignment': { $exists: true },
          isDeleted: false
        }
      },
      {
        $addFields: {
          // Convert the pendingAssignment.userId string to ObjectId for lookup
          pendingAssigneeId: {
            $cond: {
              if: { $type: "$metadata.pendingAssignment.userId" },
              then: { $toObjectId: "$metadata.pendingAssignment.userId" },
              else: null
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users', // Make sure this matches your User collection name
          localField: 'pendingAssigneeId',
          foreignField: '_id',
          as: 'pendingAssignee',
          pipeline: [
            {
              $project: {
                name: 1,
                surname: 1,
                email: 1
              }
            }
          ]
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'assignedUserId',
          foreignField: '_id',
          as: 'assignedUser',
          pipeline: [
            {
              $project: {
                name: 1,
                surname: 1,
                email: 1
              }
            }
          ]
        }
      },
      {
        $addFields: {
          // Add the pending assignee info to the response
          assignedUserId: {
            $cond: {
              if: { $gt: [{ $size: "$pendingAssignee" }, 0] },
              then: { $arrayElemAt: ["$pendingAssignee", 0] },
              else: {
                $cond: {
                  if: { $gt: [{ $size: "$assignedUser" }, 0] },
                  then: { $arrayElemAt: ["$assignedUser", 0] },
                  else: null
                }
              }
            }
          }
        }
      },
      {
        $project: {
          pendingAssigneeId: 0,
          pendingAssignee: 0,
          assignedUser: 0
        }
      }
    ]);

    return tasks;
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
    
    // Build query conditions - check multiple possible ways a task can be approved/rejected
    const baseQuery: any = {
      businessId,
      isDeleted: false,
      $or: [
        // Check if task has been assigned (approved)
        { 
          assignedUserId: { $exists: true, $ne: null },
          'metadata.pendingAssignment': { $exists: false } // No longer pending
        },
        // Check metadata status fields
        { 'metadata.assignmentStatus': 'approved' },
        { 'metadata.assignmentStatus': 'rejected' },
        { 'metadata.status': 'approved' },
        { 'metadata.status': 'rejected' },
        // Check if rejection reason exists (rejected)
        { 'metadata.rejectionReason': { $exists: true } }
      ]
    };

    // Apply status filter
    if (filters.status === 'approved') {
      baseQuery.$or = [
        { 
          assignedUserId: { $exists: true, $ne: null },
          'metadata.pendingAssignment': { $exists: false },
          'metadata.rejectionReason': { $exists: false }
        },
        { 'metadata.assignmentStatus': 'approved' },
        { 'metadata.status': 'approved' }
      ];
    } else if (filters.status === 'rejected') {
      baseQuery.$or = [
        { 'metadata.rejectionReason': { $exists: true } },
        { 'metadata.assignmentStatus': 'rejected' },
        { 'metadata.status': 'rejected' }
      ];
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

    // Get summary counts with multiple conditions
    const [approvedCount, rejectedCount] = await Promise.all([
      this.taskModel.countDocuments({
        businessId,
        isDeleted: false,
        $or: [
          { 
            assignedUserId: { $exists: true, $ne: null },
            'metadata.pendingAssignment': { $exists: false },
            'metadata.rejectionReason': { $exists: false }
          },
          { 'metadata.assignmentStatus': 'approved' },
          { 'metadata.status': 'approved' }
        ]
      }),
      this.taskModel.countDocuments({
        businessId,
        isDeleted: false,
        $or: [
          { 'metadata.rejectionReason': { $exists: true } },
          { 'metadata.assignmentStatus': 'rejected' },
          { 'metadata.status': 'rejected' }
        ]
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

    // Get total approved and rejected with improved conditions
    const [approved, rejected] = await Promise.all([
      this.taskModel.countDocuments({
        businessId,
        isDeleted: false,
        $or: [
          { 
            assignedUserId: { $exists: true, $ne: null },
            'metadata.pendingAssignment': { $exists: false },
            'metadata.rejectionReason': { $exists: false }
          },
          { 'metadata.assignmentStatus': 'approved' },
          { 'metadata.status': 'approved' }
        ]
      }),
      this.taskModel.countDocuments({
        businessId,
        isDeleted: false,
        $or: [
          { 'metadata.rejectionReason': { $exists: true } },
          { 'metadata.assignmentStatus': 'rejected' },
          { 'metadata.status': 'rejected' }
        ]
      })
    ]);

    // Get today's counts
    const [approvedToday, rejectedToday] = await Promise.all([
      this.taskModel.countDocuments({
        businessId,
        updatedAt: { $gte: today },
        isDeleted: false,
        $or: [
          { 
            assignedUserId: { $exists: true, $ne: null },
            'metadata.pendingAssignment': { $exists: false },
            'metadata.rejectionReason': { $exists: false }
          },
          { 'metadata.assignmentStatus': 'approved' },
          { 'metadata.status': 'approved' }
        ]
      }),
      this.taskModel.countDocuments({
        businessId,
        updatedAt: { $gte: today },
        isDeleted: false,
        $or: [
          { 'metadata.rejectionReason': { $exists: true } },
          { 'metadata.assignmentStatus': 'rejected' },
          { 'metadata.status': 'rejected' }
        ]
      })
    ]);

    // Get yesterday's counts for trend calculation
    const [approvedYesterday, rejectedYesterday] = await Promise.all([
      this.taskModel.countDocuments({
        businessId,
        updatedAt: { $gte: yesterday, $lt: today },
        isDeleted: false,
        $or: [
          { 
            assignedUserId: { $exists: true, $ne: null },
            'metadata.pendingAssignment': { $exists: false },
            'metadata.rejectionReason': { $exists: false }
          },
          { 'metadata.assignmentStatus': 'approved' },
          { 'metadata.status': 'approved' }
        ]
      }),
      this.taskModel.countDocuments({
        businessId,
        updatedAt: { $gte: yesterday, $lt: today },
        isDeleted: false,
        $or: [
          { 'metadata.rejectionReason': { $exists: true } },
          { 'metadata.assignmentStatus': 'rejected' },
          { 'metadata.status': 'rejected' }
        ]
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