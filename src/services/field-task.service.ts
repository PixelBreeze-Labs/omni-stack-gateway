// src/services/field-task.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business } from '../schemas/business.schema';
import { FieldTask, FieldTaskType, FieldTaskStatus, FieldTaskPriority } from '../schemas/field-task.schema';
import { TaskAssignment, TaskStatus, TaskPriority } from '../schemas/task-assignment.schema';

interface CreateFieldTaskRequest {
  businessId: string;
  appClientId: string;
  projectId?: string;
  siteId?: string; // Construction Site ID
  serviceOrderId?: string;
  name: string;
  description?: string;
  type: FieldTaskType;
  priority: FieldTaskPriority;
  location: {
    latitude: number;
    longitude: number;
    address: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    accessInstructions?: string;
    parkingNotes?: string;
  };
  scheduledDate: Date;
  timeWindow: {
    start: string; // HH:MM format
    end: string;   // HH:MM format
    isFlexible: boolean;
    preferredTime?: string;
  };
  estimatedDuration: number; // in minutes
  skillsRequired: string[];
  equipmentRequired: string[];
  specialInstructions?: string;
  difficultyLevel?: number; // 1-5 scale
  metadata?: any;
}

interface UpdateFieldTaskRequest {
  name?: string;
  description?: string;
  type?: FieldTaskType;
  priority?: FieldTaskPriority;
  siteId?: string;
  location?: Partial<{
    latitude: number;
    longitude: number;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    accessInstructions: string;
    parkingNotes: string;
  }>;
  scheduledDate?: Date;
  timeWindow?: Partial<{
    start: string;
    end: string;
    isFlexible: boolean;
    preferredTime: string;
  }>;
  estimatedDuration?: number;
  skillsRequired?: string[];
  equipmentRequired?: string[];
  specialInstructions?: string;
  difficultyLevel?: number;
  metadata?: any;
}

@Injectable()
export class FieldTaskService {
  private readonly logger = new Logger(FieldTaskService.name);

  constructor(
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(FieldTask.name) private fieldTaskModel: Model<FieldTask>,
    @InjectModel(TaskAssignment.name) private taskAssignmentModel: Model<TaskAssignment>,
  ) {}

  // ============================================================================
  // REAL TASK CRUD OPERATIONS WITH TASK ASSIGNMENT INTEGRATION
  // ============================================================================

  /**
   * Create a new field task and corresponding task assignment
   */
  async createTask(request: CreateFieldTaskRequest): Promise<{ success: boolean; taskId: string; message: string }> {
    try {
      // Validate business
      const business = await this.validateBusiness(request.businessId);
      
      // Validate required fields
      this.validateTaskData(request);

      // Generate unique task ID
      const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create real FieldTask document
      const fieldTask = new this.fieldTaskModel({
        taskId,
        name: request.name,
        description: request.description,
        businessId: request.businessId,
        projectId: request.projectId,
        siteId: request.siteId, // Construction Site ID
        appClientId: request.appClientId,
        serviceOrderId: request.serviceOrderId,
        type: request.type,
        priority: request.priority,
        status: FieldTaskStatus.PENDING,
        location: {
          latitude: request.location.latitude,
          longitude: request.location.longitude,
          address: request.location.address,
          city: request.location.city,
          state: request.location.state,
          zipCode: request.location.zipCode,
          country: request.location.country,
          accessInstructions: request.location.accessInstructions,
          parkingNotes: request.location.parkingNotes,
        },
        scheduledDate: request.scheduledDate,
        timeWindow: request.timeWindow,
        estimatedDuration: request.estimatedDuration,
        skillsRequired: request.skillsRequired,
        equipmentRequired: request.equipmentRequired,
        specialInstructions: request.specialInstructions,
        difficultyLevel: request.difficultyLevel,
        metadata: request.metadata || {},
        createdBy: business.adminUserId,
      });

      await fieldTask.save();

      // Create corresponding TaskAssignment
      await this.createTaskAssignment(fieldTask);

      this.logger.log(`Created field task ${taskId} for business ${request.businessId}`);

      return {
        success: true,
        taskId: fieldTask._id.toString(),
        message: `Task '${request.name}' created successfully`
      };

    } catch (error) {
      this.logger.error(`Error creating field task: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateTask(
    businessId: string,
    taskId: string,
    updateData: UpdateFieldTaskRequest
  ): Promise<{ success: boolean; message: string; debug?: any }> {
    try {
      const debugInfo: any = {
        steps: [],
        originalTask: null,
        updateFields: null,
        finalTask: null,
        comparisons: []
      };
  
      await this.validateBusiness(businessId);
      debugInfo.steps.push('✅ Business validated');
  
      const task = await this.fieldTaskModel.findOne({
        _id: taskId,
        businessId,
        isDeleted: false
      });
  
      if (!task) {
        throw new NotFoundException('Task not found');
      }
  
      debugInfo.originalTask = task.toObject();
      debugInfo.steps.push('✅ Task found');
  
      const updateFields: any = {};
  
      // ONLY UPDATE IF VALUES ARE DIFFERENT
      if (updateData.name !== undefined && updateData.name !== task.name) {
        updateFields.name = updateData.name;
        debugInfo.comparisons.push(`📝 Name: "${task.name}" → "${updateData.name}" (CHANGED)`);
      } else if (updateData.name !== undefined) {
        debugInfo.comparisons.push(`📝 Name: "${task.name}" → "${updateData.name}" (SAME - SKIPPED)`);
      }
      
      if (updateData.description !== undefined && updateData.description !== task.description) {
        updateFields.description = updateData.description;
        debugInfo.comparisons.push(`📝 Description: "${task.description}" → "${updateData.description}" (CHANGED)`);
      } else if (updateData.description !== undefined) {
        debugInfo.comparisons.push(`📝 Description: SAME - SKIPPED`);
      }
      
      if (updateData.type !== undefined && updateData.type !== task.type) {
        updateFields.type = updateData.type;
        debugInfo.comparisons.push(`📝 Type: "${task.type}" → "${updateData.type}" (CHANGED)`);
      } else if (updateData.type !== undefined) {
        debugInfo.comparisons.push(`📝 Type: "${task.type}" → "${updateData.type}" (SAME - SKIPPED)`);
      }
      
      if (updateData.priority !== undefined && updateData.priority !== task.priority) {
        updateFields.priority = updateData.priority;
        debugInfo.comparisons.push(`📝 Priority: "${task.priority}" → "${updateData.priority}" (CHANGED)`);
      } else if (updateData.priority !== undefined) {
        debugInfo.comparisons.push(`📝 Priority: "${task.priority}" → "${updateData.priority}" (SAME - SKIPPED)`);
      }
      
      if (updateData.scheduledDate !== undefined) {
        const newDate = new Date(updateData.scheduledDate).getTime();
        const oldDate = new Date(task.scheduledDate).getTime();
        if (newDate !== oldDate) {
          updateFields.scheduledDate = updateData.scheduledDate;
          debugInfo.comparisons.push(`📅 Date: "${task.scheduledDate}" → "${updateData.scheduledDate}" (CHANGED)`);
        } else {
          debugInfo.comparisons.push(`📅 Date: SAME - SKIPPED`);
        }
      }
      
      if (updateData.estimatedDuration !== undefined && updateData.estimatedDuration !== task.estimatedDuration) {
        updateFields.estimatedDuration = updateData.estimatedDuration;
        debugInfo.comparisons.push(`⏱️ Duration: ${task.estimatedDuration} → ${updateData.estimatedDuration} (CHANGED)`);
      } else if (updateData.estimatedDuration !== undefined) {
        debugInfo.comparisons.push(`⏱️ Duration: SAME - SKIPPED`);
      }
      
      if (updateData.difficultyLevel !== undefined && updateData.difficultyLevel !== task.difficultyLevel) {
        updateFields.difficultyLevel = updateData.difficultyLevel;
        debugInfo.comparisons.push(`🎯 Difficulty: ${task.difficultyLevel} → ${updateData.difficultyLevel} (CHANGED)`);
      } else if (updateData.difficultyLevel !== undefined) {
        debugInfo.comparisons.push(`🎯 Difficulty: SAME - SKIPPED`);
      }
  
      // Handle location with proper comparison
      if (updateData.location) {
        if (updateData.location.latitude !== undefined && updateData.location.latitude !== task.location?.latitude) {
          updateFields['location.latitude'] = updateData.location.latitude;
          debugInfo.comparisons.push(`📍 Latitude: ${task.location?.latitude} → ${updateData.location.latitude} (CHANGED)`);
        }
        if (updateData.location.longitude !== undefined && updateData.location.longitude !== task.location?.longitude) {
          updateFields['location.longitude'] = updateData.location.longitude;
          debugInfo.comparisons.push(`📍 Longitude: ${task.location?.longitude} → ${updateData.location.longitude} (CHANGED)`);
        }
        if (updateData.location.address !== undefined && updateData.location.address !== task.location?.address) {
          updateFields['location.address'] = updateData.location.address;
          debugInfo.comparisons.push(`📍 Address: "${task.location?.address}" → "${updateData.location.address}" (CHANGED)`);
        }
        if (updateData.location.accessInstructions !== undefined && updateData.location.accessInstructions !== task.location?.accessInstructions) {
          updateFields['location.accessInstructions'] = updateData.location.accessInstructions;
          debugInfo.comparisons.push(`📍 Access: CHANGED`);
        }
        if (updateData.location.parkingNotes !== undefined && updateData.location.parkingNotes !== task.location?.parkingNotes) {
          updateFields['location.parkingNotes'] = updateData.location.parkingNotes;
          debugInfo.comparisons.push(`📍 Parking: CHANGED`);
        }
      }
  
      // Handle timeWindow with proper comparison
      if (updateData.timeWindow) {
        if (updateData.timeWindow.start !== undefined && updateData.timeWindow.start !== task.timeWindow?.start) {
          updateFields['timeWindow.start'] = updateData.timeWindow.start;
          debugInfo.comparisons.push(`⏰ Start: "${task.timeWindow?.start}" → "${updateData.timeWindow.start}" (CHANGED)`);
        }
        if (updateData.timeWindow.end !== undefined && updateData.timeWindow.end !== task.timeWindow?.end) {
          updateFields['timeWindow.end'] = updateData.timeWindow.end;
          debugInfo.comparisons.push(`⏰ End: "${task.timeWindow?.end}" → "${updateData.timeWindow.end}" (CHANGED)`);
        }
        if (updateData.timeWindow.isFlexible !== undefined && updateData.timeWindow.isFlexible !== task.timeWindow?.isFlexible) {
          updateFields['timeWindow.isFlexible'] = updateData.timeWindow.isFlexible;
          debugInfo.comparisons.push(`⏰ Flexible: CHANGED`);
        }
        if (updateData.timeWindow.preferredTime !== undefined && updateData.timeWindow.preferredTime !== task.timeWindow?.preferredTime) {
          updateFields['timeWindow.preferredTime'] = updateData.timeWindow.preferredTime;
          debugInfo.comparisons.push(`⏰ Preferred: CHANGED`);
        }
      }
  
      // Handle arrays with proper comparison
      if (updateData.skillsRequired !== undefined && JSON.stringify(updateData.skillsRequired) !== JSON.stringify(task.skillsRequired)) {
        updateFields.skillsRequired = updateData.skillsRequired;
        debugInfo.comparisons.push(`🛠️ Skills: CHANGED`);
      }
      
      if (updateData.equipmentRequired !== undefined && JSON.stringify(updateData.equipmentRequired) !== JSON.stringify(task.equipmentRequired)) {
        updateFields.equipmentRequired = updateData.equipmentRequired;
        debugInfo.comparisons.push(`🚛 Equipment: CHANGED`);
      }
  
      if (updateData.specialInstructions !== undefined && updateData.specialInstructions !== task.specialInstructions) {
        updateFields.specialInstructions = updateData.specialInstructions;
        debugInfo.comparisons.push(`📋 Instructions: CHANGED`);
      }
  
      debugInfo.updateFields = updateFields;
      debugInfo.steps.push(`🔧 Built ${Object.keys(updateFields).length} update fields`);
  
      // Only update if there are actual changes
      if (Object.keys(updateFields).length === 0) {
        debugInfo.steps.push('ℹ️ No changes detected - skipping database update');
        return {
          success: true,
          message: 'No changes detected',
          debug: debugInfo
        };
      }
  
      const updatedTask = await this.fieldTaskModel.findOneAndUpdate(
        { _id: taskId, businessId, isDeleted: false },
        { $set: updateFields },
        { new: true, runValidators: true }
      );
  
      if (!updatedTask) {
        throw new NotFoundException('Task not found or could not be updated');
      }
  
      debugInfo.finalTask = updatedTask.toObject();
      debugInfo.steps.push('✅ Update completed successfully');
  
      await this.updateTaskAssignment(updatedTask);
      debugInfo.steps.push('✅ Task assignment updated');
  
      return {
        success: true,
        message: 'Task updated successfully',
        debug: debugInfo
      };
  
    } catch (error) {
      return {
        success: false,
        message: error.message,
        debug: { error: error.message, stack: error.stack }
      };
    }
  }
  
  /**
   * Delete a field task and corresponding task assignment (soft delete)
   */
  async deleteTask(businessId: string, taskId: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.validateBusiness(businessId);

      const task = await this.fieldTaskModel.findOne({
        _id: taskId,
        businessId,
        isDeleted: false
      });

      if (!task) {
        throw new NotFoundException('Task not found');
      }

      // Soft delete FieldTask
      task.isDeleted = true;
      task.deletedAt = new Date();
      await task.save();

      // Soft delete corresponding TaskAssignment
      await this.deleteTaskAssignment(task._id.toString());

      this.logger.log(`Deleted field task ${taskId} for business ${businessId}`);

      return {
        success: true,
        message: `Task '${task.name}' deleted successfully`
      };

    } catch (error) {
      this.logger.error(`Error deleting field task: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
 * Get field tasks - shows current month by default, with optional date filtering
 */
async getTasks(
    businessId: string,
    filters?: {
      status?: string;
      type?: string;
      priority?: string;
      assignedTeam?: string;
      date?: string;        // If provided, filter by this specific date
      month?: string;       // If provided, filter by this month (YYYY-MM format)
      projectId?: string;
      siteId?: string;
    }
  ): Promise<{ tasks: FieldTask[]; total: number }> {
    try {
      await this.validateBusiness(businessId);
  
      // Build query
      const query: any = {
        businessId,
        isDeleted: false
      };
  
      // Apply non-date filters
      if (filters?.status && filters.status !== 'all') {
        query.status = filters.status;
      }
      
      if (filters?.type && filters.type !== 'all') {
        query.type = filters.type;
      }
      
      if (filters?.priority && filters.priority !== 'all') {
        query.priority = filters.priority;
      }
      
      if (filters?.assignedTeam && filters.assignedTeam !== 'all') {
        query.assignedTeamId = filters.assignedTeam;
      }
  
      if (filters?.projectId) {
        query.projectId = filters.projectId;
      }
  
      if (filters?.siteId) {
        query.siteId = filters.siteId;
      }
      
      // DATE FILTERING LOGIC
      if (filters?.date) {
        // Specific date filter (when user selects a specific day)
        const selectedDate = new Date(filters.date);
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        query.scheduledDate = {
          $gte: startOfDay,
          $lte: endOfDay
        };
      } else if (filters?.month) {
        // Month filter (YYYY-MM format)
        const [year, month] = filters.month.split('-');
        const startOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1);
        const endOfMonth = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
        
        query.scheduledDate = {
          $gte: startOfMonth,
          $lte: endOfMonth
        };
      } else {
        // DEFAULT: Show current month if no date/month filter provided
        const now = new Date();
        const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        
        query.scheduledDate = {
          $gte: startOfCurrentMonth,
          $lte: endOfCurrentMonth
        };
      }
  
      // Execute query with sorting
      const tasks = await this.fieldTaskModel
        .find(query)
        .sort({ 
          scheduledDate: 1, 
          priority: -1, // High priority first
          createdAt: -1 
        })
        .exec();
  
      return {
        tasks,
        total: tasks.length
      };
  
    } catch (error) {
      this.logger.error(`Error getting field tasks: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Assign task to team
   */
  async assignTaskToTeam(
    businessId: string,
    taskId: string,
    teamId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const business = await this.validateBusiness(businessId);

      // Validate team exists
      const team = business.teams?.find((t: any) => t.id === teamId);
      if (!team) {
        throw new NotFoundException('Team not found');
      }

      // Find and update task
      const task = await this.fieldTaskModel.findOne({
        _id: taskId,
        businessId,
        isDeleted: false
      });

      if (!task) {
        throw new NotFoundException('Task not found');
      }

      task.assignedTeamId = teamId;
      task.assignedAt = new Date();
      task.status = FieldTaskStatus.ASSIGNED;
      await task.save();

      // Update TaskAssignment
      await this.updateTaskAssignment(task);

      this.logger.log(`Assigned task ${taskId} to team ${teamId} for business ${businessId}`);

      return {
        success: true,
        message: `Task assigned to ${team.name} successfully`
      };

    } catch (error) {
      this.logger.error(`Error assigning task to team: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    businessId: string,
    taskId: string,
    status: string | FieldTaskStatus
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.validateBusiness(businessId);

      const task = await this.fieldTaskModel.findOne({
        _id: taskId,
        businessId,
        isDeleted: false
      });

      if (!task) {
        throw new NotFoundException('Task not found');
      }

      // Validate and convert status
      const validStatus = this.validateAndConvertStatus(status);

      const previousStatus = task.status;
      task.status = validStatus;

      // Set completion date if completed
      if (validStatus === FieldTaskStatus.COMPLETED && previousStatus !== FieldTaskStatus.COMPLETED) {
        task.completedAt = new Date();
      }

      // Set actual performance data if status changes
      if (validStatus === FieldTaskStatus.IN_PROGRESS && !task.actualPerformance?.startTime) {
        task.actualPerformance = {
          startTime: new Date(),
          delays: []
        };
      }

      if (validStatus === FieldTaskStatus.COMPLETED && task.actualPerformance?.startTime && !task.actualPerformance?.endTime) {
        task.actualPerformance.endTime = new Date();
        task.actualPerformance.actualDuration = Math.round(
          (new Date().getTime() - task.actualPerformance.startTime.getTime()) / (1000 * 60)
        );
      }

      await task.save();

      // Update TaskAssignment status
      await this.updateTaskAssignment(task);

      this.logger.log(`Updated task ${taskId} status from ${previousStatus} to ${validStatus} for business ${businessId}`);

      return {
        success: true,
        message: `Task status updated to ${validStatus}`
      };

    } catch (error) {
      this.logger.error(`Error updating task status: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get tasks by date range using real database query
   */
  async getTasksByDateRange(
    businessId: string,
    startDate: string,
    endDate: string
  ): Promise<{ tasks: FieldTask[]; total: number }> {
    try {
      await this.validateBusiness(businessId);

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Include full end date

      const tasks = await this.fieldTaskModel
        .find({
          businessId,
          isDeleted: false,
          scheduledDate: {
            $gte: start,
            $lte: end
          }
        })
        .sort({ scheduledDate: 1, priority: -1 })
        .exec();

      return {
        tasks,
        total: tasks.length
      };

    } catch (error) {
      this.logger.error(`Error getting tasks by date range: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get tasks for route optimization (return tasks that need routing)
   */
  async getTasksForRouting(
    businessId: string,
    date: string,
    teamIds?: string[]
  ): Promise<FieldTask[]> {
    try {
      await this.validateBusiness(businessId);

      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const query: any = {
        businessId,
        isDeleted: false,
        scheduledDate: {
          $gte: startOfDay,
          $lte: endOfDay
        },
        status: { $in: [FieldTaskStatus.PENDING, FieldTaskStatus.ASSIGNED] }
      };

      if (teamIds && teamIds.length > 0) {
        query.$or = [
          { assignedTeamId: { $in: teamIds } },
          { assignedTeamId: { $exists: false } }
        ];
      }

      const tasks = await this.fieldTaskModel
        .find(query)
        .sort({ priority: -1, scheduledDate: 1 })
        .exec();

      return tasks;

    } catch (error) {
      this.logger.error(`Error getting tasks for routing: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get task analytics/statistics
   */
  async getTaskStatistics(businessId: string, timeframe: string = '30d'): Promise<any> {
    try {
      await this.validateBusiness(businessId);

      const days = parseInt(timeframe.replace('d', '')) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const pipeline = [
        {
          $match: {
            businessId,
            isDeleted: false,
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            totalTasks: { $sum: 1 },
            completedTasks: { $sum: { $cond: [{ $eq: ['$status', FieldTaskStatus.COMPLETED] }, 1, 0] } },
            pendingTasks: { $sum: { $cond: [{ $eq: ['$status', FieldTaskStatus.PENDING] }, 1, 0] } },
            inProgressTasks: { $sum: { $cond: [{ $eq: ['$status', FieldTaskStatus.IN_PROGRESS] }, 1, 0] } },
            avgEstimatedDuration: { $avg: '$estimatedDuration' },
            highPriorityTasks: { $sum: { $cond: [{ $eq: ['$priority', FieldTaskPriority.HIGH] }, 1, 0] } },
          }
        }
      ];

      const result = await this.fieldTaskModel.aggregate(pipeline);
      const stats = result[0] || {
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
        inProgressTasks: 0,
        avgEstimatedDuration: 0,
        highPriorityTasks: 0,
      };

      // Calculate completion rate
      stats.completionRate = stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;

      return stats;

    } catch (error) {
      this.logger.error(`Error getting task statistics: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================================================
  // TASK ASSIGNMENT INTEGRATION METHODS
  // ============================================================================

  /**
   * Create TaskAssignment when FieldTask is created
   */
  private async createTaskAssignment(fieldTask: FieldTask): Promise<void> {
    try {
      const taskAssignment = new this.taskAssignmentModel({
        title: fieldTask.name,
        description: fieldTask.description,
        businessId: fieldTask.businessId,
        clientId: fieldTask.appClientId,
        fieldTaskId: fieldTask._id,
        isFromFieldTask: true,
        constructionSiteId: fieldTask.siteId,
        status: this.mapFieldTaskStatusToTaskStatus(fieldTask.status),
        priority: this.mapFieldTaskPriorityToTaskPriority(fieldTask.priority),
        dueDate: fieldTask.scheduledDate,
        metadata: {
          ...fieldTask.metadata,
          estimatedDuration: fieldTask.estimatedDuration,
          skillsRequired: fieldTask.skillsRequired,
          equipmentRequired: fieldTask.equipmentRequired,
          location: fieldTask.location
        },
        legacySync: {
          needsSync: true,
          syncStatus: 'pending'
        }
      });

      await taskAssignment.save();
      this.logger.log(`Created TaskAssignment for FieldTask ${fieldTask._id}`);
    } catch (error) {
      this.logger.error(`Error creating TaskAssignment: ${error.message}`, error.stack);
      // Don't throw - we don't want to fail FieldTask creation
    }
  }

  /**
   * Update TaskAssignment when FieldTask is updated
   */
  private async updateTaskAssignment(fieldTask: FieldTask): Promise<void> {
    try {
      const taskAssignment = await this.taskAssignmentModel.findOne({
        fieldTaskId: fieldTask._id,
        isDeleted: false
      });

      if (taskAssignment) {
        taskAssignment.title = fieldTask.name;
        taskAssignment.description = fieldTask.description;
        taskAssignment.constructionSiteId = fieldTask.siteId;
        taskAssignment.status = this.mapFieldTaskStatusToTaskStatus(fieldTask.status);
        taskAssignment.priority = this.mapFieldTaskPriorityToTaskPriority(fieldTask.priority);
        taskAssignment.dueDate = fieldTask.scheduledDate;
        
        if (fieldTask.assignedAt) {
          taskAssignment.assignedAt = fieldTask.assignedAt;
        }
        
        if (fieldTask.completedAt) {
          taskAssignment.completedAt = fieldTask.completedAt;
        }

        taskAssignment.metadata = {
          ...taskAssignment.metadata,
          ...fieldTask.metadata,
          estimatedDuration: fieldTask.estimatedDuration,
          skillsRequired: fieldTask.skillsRequired,
          equipmentRequired: fieldTask.equipmentRequired,
          location: fieldTask.location
        };

        // TODO: Mark for sync with VenueBoost

        await taskAssignment.save();
        this.logger.log(`Updated TaskAssignment for FieldTask ${fieldTask._id}`);
      }
    } catch (error) {
      this.logger.error(`Error updating TaskAssignment: ${error.message}`, error.stack);
    }
  }

  /**
   * Delete TaskAssignment when FieldTask is deleted
   */
  private async deleteTaskAssignment(fieldTaskId: string): Promise<void> {
    try {
      const taskAssignment = await this.taskAssignmentModel.findOne({
        fieldTaskId: fieldTaskId,
        isDeleted: false
      });

      if (taskAssignment) {
        taskAssignment.isDeleted = true;
        taskAssignment.deletedAt = new Date();
        taskAssignment.status = TaskStatus.CANCELLED;
        
        // TODO: legacySync with VenueBoost
        

        await taskAssignment.save();
        this.logger.log(`Deleted TaskAssignment for FieldTask ${fieldTaskId}`);
      }
    } catch (error) {
      this.logger.error(`Error deleting TaskAssignment: ${error.message}`, error.stack);
    }
  }

  /**
   * Map FieldTaskStatus to TaskStatus
   */
  private mapFieldTaskStatusToTaskStatus(fieldTaskStatus: FieldTaskStatus): TaskStatus {
    const statusMap: { [key in FieldTaskStatus]: TaskStatus } = {
      [FieldTaskStatus.PENDING]: TaskStatus.UNASSIGNED,
      [FieldTaskStatus.ASSIGNED]: TaskStatus.ASSIGNED,
      [FieldTaskStatus.IN_PROGRESS]: TaskStatus.IN_PROGRESS,
      [FieldTaskStatus.ON_HOLD]: TaskStatus.ASSIGNED, // Keep as assigned but could be extended
      [FieldTaskStatus.COMPLETED]: TaskStatus.COMPLETED,
      [FieldTaskStatus.CANCELLED]: TaskStatus.CANCELLED,
      [FieldTaskStatus.RESCHEDULED]: TaskStatus.ASSIGNED,
      [FieldTaskStatus.SCHEDULED]: TaskStatus.SCHEDULED,
    };

    return statusMap[fieldTaskStatus] || TaskStatus.UNASSIGNED;
  }

  /**
   * Map FieldTaskPriority to TaskPriority
   */
  private mapFieldTaskPriorityToTaskPriority(fieldTaskPriority: FieldTaskPriority): TaskPriority {
    const priorityMap: { [key in FieldTaskPriority]: TaskPriority } = {
      [FieldTaskPriority.LOW]: TaskPriority.LOW,
      [FieldTaskPriority.MEDIUM]: TaskPriority.MEDIUM,
      [FieldTaskPriority.HIGH]: TaskPriority.HIGH,
      [FieldTaskPriority.URGENT]: TaskPriority.URGENT,
      [FieldTaskPriority.EMERGENCY]: TaskPriority.URGENT,
    };

    return priorityMap[fieldTaskPriority] || TaskPriority.MEDIUM;
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Validate and convert status string to FieldTaskStatus enum
   */
  private validateAndConvertStatus(status: string | FieldTaskStatus): FieldTaskStatus {
    // If it's already the enum type, return it
    if (Object.values(FieldTaskStatus).includes(status as FieldTaskStatus)) {
      return status as FieldTaskStatus;
    }

    // Convert string to enum
    const statusMap: { [key: string]: FieldTaskStatus } = {
      'pending': FieldTaskStatus.PENDING,
      'assigned': FieldTaskStatus.ASSIGNED,
      'in_progress': FieldTaskStatus.IN_PROGRESS,
      'on_hold': FieldTaskStatus.ON_HOLD,
      'completed': FieldTaskStatus.COMPLETED,
      'cancelled': FieldTaskStatus.CANCELLED,
      'rescheduled': FieldTaskStatus.RESCHEDULED,
    };

    const convertedStatus = statusMap[status as string];
    if (!convertedStatus) {
      throw new BadRequestException(`Invalid status: ${status}. Valid statuses are: ${Object.values(FieldTaskStatus).join(', ')}`);
    }

    return convertedStatus;
  }

  /**
   * Validate business exists
   */
  private async validateBusiness(businessId: string): Promise<any> {
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    return business;
  }

  /**
   * Validate task data
   */
  private validateTaskData(data: CreateFieldTaskRequest): void {
    if (!data.name?.trim()) {
      throw new BadRequestException('Task name is required');
    }

    if (!data.type) {
      throw new BadRequestException('Task type is required');
    }

    if (!data.priority) {
      throw new BadRequestException('Task priority is required');
    }

    if (!data.appClientId) {
      throw new BadRequestException('App Client ID is required');
    }

    if (!data.location?.address?.trim()) {
      throw new BadRequestException('Task address is required');
    }

    if (!data.location?.latitude || !data.location?.longitude) {
      throw new BadRequestException('Task coordinates are required');
    }

    if (!data.scheduledDate) {
      throw new BadRequestException('Scheduled date is required');
    }

    if (!data.timeWindow?.start || !data.timeWindow?.end) {
      throw new BadRequestException('Time window is required');
    }

    if (!data.estimatedDuration || data.estimatedDuration <= 0) {
      throw new BadRequestException('Valid estimated duration is required');
    }

    // Validate coordinates are reasonable
    const { latitude, longitude } = data.location;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new BadRequestException('Invalid coordinates provided');
    }

    // Validate time window
    const startTime = data.timeWindow.start;
    const endTime = data.timeWindow.end;
    if (startTime >= endTime) {
      throw new BadRequestException('End time must be after start time');
    }
  }
}