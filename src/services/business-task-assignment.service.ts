// src/services/business-task-assignment.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TaskAssignment } from '../schemas/task-assignment.schema';
import { StaffProfile } from '../schemas/staff-profile.schema';
import { AutoAssignmentAgentService } from './auto-assignment-agent.service';
import { CronJobHistory } from '../schemas/cron-job-history.schema';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class BusinessTaskAssignmentService {
  private readonly logger = new Logger(BusinessTaskAssignmentService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    @InjectModel(TaskAssignment.name) private taskModel: Model<TaskAssignment>,
    @InjectModel(CronJobHistory.name) private cronJobHistoryModel: Model<CronJobHistory>,
    @InjectModel(StaffProfile.name) private staffProfileModel: Model<StaffProfile>,
    private readonly autoAssignmentAgentService: AutoAssignmentAgentService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('venueboost.baseUrl');
    this.apiKey = this.configService.get<string>('venueboost.apiKey');
  }

  /**
   * Call external PHP API to assign employee to task
   */
  private async callExternalAssignEmployee(phpTaskId: string, phpEmployeeId: string): Promise<boolean> {
    try {
      this.logger.log(`Calling external assign-employee API for task ${phpTaskId} to employee ${phpEmployeeId}`);
      this.logger.log(`Making POST request to: ${this.baseUrl}/tasks-os/${phpTaskId}/assign`);
      
      const response$ = this.httpService.post(
        `${this.baseUrl}/tasks-os/${phpTaskId}/assign`,
        {
          employee_id: phpEmployeeId
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey
          }
        }
      );

      const response = await lastValueFrom(response$);
      
      this.logger.log(`External assign-employee API Response Status: ${response.status}`);
      this.logger.log(`External assign-employee API Response Data:`, JSON.stringify(response.data, null, 2));
      
      if (response.status >= 400) {
        this.logger.error(`Failed to assign employee ${phpEmployeeId} to task ${phpTaskId}: ${response.data.error || 'Unknown error'}`);
        return false;
      }

      this.logger.log(`Successfully assigned employee ${phpEmployeeId} to task ${phpTaskId} via external API`);
      return true;
    } catch (error) {
      this.logger.error(`Error calling external assign-employee API for task ${phpTaskId}:`, {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      return false;
    }
  }

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
  try {
    this.logger.log(`Getting pending approval tasks for business: ${businessId}`);
    
    // Enhanced query to exclude already assigned tasks
    const tasks = await this.taskModel
      .find({
        businessId,
        'metadata.pendingAssignment': { $exists: true },
        isDeleted: false,
        // Exclude tasks that are already assigned
        $or: [
          { assignedUserId: { $exists: false } },
          { assignedUserId: null }
        ]
      })
      .populate('potentialAssignees', 'name surname email')
      .lean();

    this.logger.log(`Found ${tasks.length} pending approval tasks (excluding already assigned)`);

    // Transform the data to set assignedUserId for frontend compatibility
    const transformedTasks = tasks.map(task => {
      // Find the user that matches the pending assignment userId
      const pendingUserId = task.metadata?.pendingAssignment?.userId;
      
      if (pendingUserId && task.potentialAssignees) {
        // Find the matching user from populated potentialAssignees
        const matchingUser = Array.isArray(task.potentialAssignees) 
          ? task.potentialAssignees.find(user => 
               // @ts-ignore
              user._id.toString() === pendingUserId.toString()
            )
          : null;

        if (matchingUser) {
          // Set assignedUserId to the matching user for frontend compatibility
          // @ts-ignore
          task.assignedUserId = {
              // @ts-ignore
            _id: matchingUser._id,
               // @ts-ignore
            name: matchingUser.name,
               // @ts-ignore
            surname: matchingUser.surname,
               // @ts-ignore
            email: matchingUser.email
          };
        }
      }

      return task;
    });

    if (transformedTasks.length > 0) {
      const sampleTask = transformedTasks[0];
      this.logger.log(`Sample task debug info:`, {
        title: sampleTask.title,
        potentialAssigneesCount: Array.isArray(sampleTask.potentialAssignees) ? sampleTask.potentialAssignees.length : 0,
        pendingUserId: sampleTask.metadata?.pendingAssignment?.userId,
        assignedUserPopulated: !!sampleTask.assignedUserId,
           // @ts-ignore
        assignedUserName: sampleTask.assignedUserId?.name
      });
    }

    return transformedTasks as TaskAssignment[];
    
  } catch (error) {
    this.logger.error(`Error in getPendingApprovalTasks:`, error);
    throw new Error(`Failed to get pending approval tasks: ${error.message}`);
  }
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
    // Get task and staff profile info for external API call BEFORE approval
    const task = await this.taskModel.findById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }
    
    if (!task.metadata?.pendingAssignment) {
      throw new Error('No pending assignment found for this task');
    }
    
    const userId = task.metadata.pendingAssignment.userId;
    const staffProfile = await this.staffProfileModel.findOne({ userId });
    
    // Call external PHP API to assign employee if we have external IDs
    let externalAssignSuccess = false;
    if (task.externalIds?.venueBoostTaskId && staffProfile?.externalIds?.venueBoostId) {
      this.logger.log(`Calling external assign-employee API for task ${task.externalIds.venueBoostTaskId} to employee ${staffProfile.externalIds.venueBoostId}`);
      externalAssignSuccess = await this.callExternalAssignEmployee(
        task.externalIds.venueBoostTaskId,
        staffProfile.externalIds.venueBoostId
      );
      
      if (!externalAssignSuccess) {
        this.logger.warn(`External assign-employee API call failed for task ${taskId}, but continuing with internal assignment`);
      }
    } else {
      this.logger.log(`Skipping external assign-employee API call - missing external IDs for task ${taskId} or staff ${userId}`);
    }
    
    // Use the original auto assignment agent logic
    const result = await this.autoAssignmentAgentService.approveAssignment(taskId);
    
    // Enhanced metadata cleanup - ensure all assignment-related metadata is cleaned
    await this.taskModel.findByIdAndUpdate(taskId, {
      $set: { 
        'metadata.externalAssignSuccess': externalAssignSuccess,
        'metadata.assignmentApprovedAt': new Date(),
        'metadata.assignmentFinalizedAt': new Date()
      },
      $unset: {
        'metadata.pendingAssignment': 1,
        potentialAssignees: 1
      }
    });
    
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
        assignedUserId: userId,
        externalAssignSuccess,
        venueBoostTaskId: task.externalIds?.venueBoostTaskId,
        venueBoostEmployeeId: staffProfile?.externalIds?.venueBoostId,
        metadataCleanedUp: true
      }
    });
    
    this.logger.log(`✅ Task assignment approved successfully for task ${taskId}, assigned to user ${userId}. External API call: ${externalAssignSuccess ? 'SUCCESS' : 'FAILED'}. Metadata cleaned up.`);
    
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