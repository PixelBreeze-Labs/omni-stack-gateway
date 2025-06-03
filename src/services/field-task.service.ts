// src/services/field-task.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business } from '../schemas/business.schema';

interface CreateFieldTaskRequest {
  businessId: string;
  name: string;
  description?: string;
  type: 'installation' | 'maintenance' | 'inspection' | 'delivery' | 'pickup';
  priority: 'high' | 'medium' | 'low';
  location: {
    address: string;
    coordinates: { lat: number; lng: number };
    accessInstructions?: string;
  };
  schedule: {
    scheduledDate: Date;
    timeWindow: { start: string; end: string; isFlexible?: boolean };
    estimatedDuration: number; // in minutes
  };
  requirements: {
    skillsRequired?: string[];
    equipmentRequired?: string[];
  };
  customer?: {
    name: string;
    email?: string;
    phone?: string;
    contactPreference?: 'email' | 'phone' | 'sms';
  };
  metadata?: any;
}

interface UpdateFieldTaskRequest {
  name?: string;
  description?: string;
  type?: 'installation' | 'maintenance' | 'inspection' | 'delivery' | 'pickup';
  priority?: 'high' | 'medium' | 'low';
  location?: {
    address?: string;
    coordinates?: { lat: number; lng: number };
    accessInstructions?: string;
  };
  schedule?: {
    scheduledDate?: Date;
    timeWindow?: { start: string; end: string; isFlexible?: boolean };
    estimatedDuration?: number;
  };
  requirements?: {
    skillsRequired?: string[];
    equipmentRequired?: string[];
  };
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
    contactPreference?: 'email' | 'phone' | 'sms';
  };
  metadata?: any;
}

interface FieldTask {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  type: string;
  priority: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  location: any;
  schedule: any;
  requirements: any;
  customer?: any;
  assignedTeam?: string;
  assignedDate?: Date;
  completedDate?: Date;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * TODO: FUTURE IMPROVEMENTS FOR FIELD TASK MANAGEMENT
 * 
 * Current Implementation: Basic task CRUD operations with business validation
 * 
 * Planned Enhancements:
 * - Integration with existing TaskAssignment schema for unified task management
 * - Real-time task status synchronization across teams
 * - Customer notification system integration (email/SMS)
 * - Photo/document attachment support for task completion
 * - Recurring task scheduling and template management
 * - Integration with calendar systems for automatic scheduling
 * - Mobile app synchronization for offline task access
 * - Advanced filtering and search capabilities
 * - Task dependency management (prerequisite tasks)
 * - Integration with inventory management for equipment tracking
 * - Performance analytics and task completion reporting
 * - Integration with customer feedback and rating systems
 */

@Injectable()
export class FieldTaskService {
  private readonly logger = new Logger(FieldTaskService.name);

  constructor(
    @InjectModel(Business.name) private businessModel: Model<Business>,
  ) {}

  // ============================================================================
  // TASK CRUD OPERATIONS
  // ============================================================================

  /**
   * Create a new field task
   */
  async createTask(request: CreateFieldTaskRequest): Promise<{ success: boolean; taskId: string; message: string }> {
    try {
      // Validate business
      const business = await this.validateBusiness(request.businessId);
      
      // Validate required fields
      this.validateTaskData(request);

      // Generate task ID
      const taskId = new Date().getTime().toString();
      const now = new Date();

      // Create task object
      const newTask = {
        id: taskId,
        businessId: request.businessId,
        name: request.name,
        description: request.description,
        type: request.type,
        priority: request.priority,
        status: 'pending',
        location: {
          address: request.location.address,
          coordinates: request.location.coordinates,
          accessInstructions: request.location.accessInstructions
        },
        schedule: {
          scheduledDate: request.schedule.scheduledDate,
          timeWindow: request.schedule.timeWindow,
          estimatedDuration: request.schedule.estimatedDuration
        },
        requirements: {
          skillsRequired: request.requirements.skillsRequired || [],
          equipmentRequired: request.requirements.equipmentRequired || []
        },
        customer: request.customer,
        metadata: request.metadata || {},
        createdAt: now,
        updatedAt: now
      };

      // Store in business metadata (for now - TODO: create dedicated schema)
      if (!business.metadata) business.metadata = {};
      if (!business.metadata.fieldTasks) business.metadata.fieldTasks = [];
      
      business.metadata.fieldTasks.push(newTask);
      business.markModified('metadata');
      await business.save();

      this.logger.log(`Created field task ${taskId} for business ${request.businessId}`);

      return {
        success: true,
        taskId,
        message: `Task '${request.name}' created successfully`
      };

    } catch (error) {
      this.logger.error(`Error creating field task: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update an existing field task
   */
  async updateTask(
    businessId: string,
    taskId: string,
    updateData: UpdateFieldTaskRequest
  ): Promise<{ success: boolean; message: string }> {
    try {
      const business = await this.validateBusiness(businessId);

      // Find task in business metadata
      const tasks = business.metadata?.fieldTasks || [];
      const taskIndex = tasks.findIndex((task: any) => task.id === taskId);

      if (taskIndex === -1) {
        throw new NotFoundException('Task not found');
      }

      const task = tasks[taskIndex];

      // Update task fields
      if (updateData.name !== undefined) task.name = updateData.name;
      if (updateData.description !== undefined) task.description = updateData.description;
      if (updateData.type !== undefined) task.type = updateData.type;
      if (updateData.priority !== undefined) task.priority = updateData.priority;
      
      if (updateData.location) {
        task.location = { ...task.location, ...updateData.location };
      }
      
      if (updateData.schedule) {
        task.schedule = { ...task.schedule, ...updateData.schedule };
      }
      
      if (updateData.requirements) {
        task.requirements = { ...task.requirements, ...updateData.requirements };
      }
      
      if (updateData.customer) {
        task.customer = { ...task.customer, ...updateData.customer };
      }
      
      if (updateData.metadata) {
        task.metadata = { ...task.metadata, ...updateData.metadata };
      }

      task.updatedAt = new Date();

      business.markModified('metadata');
      await business.save();

      this.logger.log(`Updated field task ${taskId} for business ${businessId}`);

      return {
        success: true,
        message: 'Task updated successfully'
      };

    } catch (error) {
      this.logger.error(`Error updating field task: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete a field task
   */
  async deleteTask(businessId: string, taskId: string): Promise<{ success: boolean; message: string }> {
    try {
      const business = await this.validateBusiness(businessId);

      // Find and remove task
      const tasks = business.metadata?.fieldTasks || [];
      const taskIndex = tasks.findIndex((task: any) => task.id === taskId);

      if (taskIndex === -1) {
        throw new NotFoundException('Task not found');
      }

      const taskName = tasks[taskIndex].name;
      tasks.splice(taskIndex, 1);

      business.markModified('metadata');
      await business.save();

      this.logger.log(`Deleted field task ${taskId} for business ${businessId}`);

      return {
        success: true,
        message: `Task '${taskName}' deleted successfully`
      };

    } catch (error) {
      this.logger.error(`Error deleting field task: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get field tasks with filters
   */
  async getTasks(
    businessId: string,
    filters?: {
      status?: string;
      type?: string;
      priority?: string;
      assignedTeam?: string;
      date?: string;
    }
  ): Promise<{ tasks: FieldTask[]; total: number }> {
    try {
      const business = await this.validateBusiness(businessId);

      let tasks = business.metadata?.fieldTasks || [];

      // Apply filters
      if (filters?.status && filters.status !== 'all') {
        tasks = tasks.filter((task: any) => task.status === filters.status);
      }
      
      if (filters?.type && filters.type !== 'all') {
        tasks = tasks.filter((task: any) => task.type === filters.type);
      }
      
      if (filters?.priority && filters.priority !== 'all') {
        tasks = tasks.filter((task: any) => task.priority === filters.priority);
      }
      
      if (filters?.assignedTeam && filters.assignedTeam !== 'all') {
        tasks = tasks.filter((task: any) => task.assignedTeam === filters.assignedTeam);
      }
      
      if (filters?.date) {
        const filterDate = new Date(filters.date).toISOString().split('T')[0];
        tasks = tasks.filter((task: any) => {
          const taskDate = new Date(task.schedule.scheduledDate).toISOString().split('T')[0];
          return taskDate === filterDate;
        });
      }

      // Sort by scheduled date and priority
      tasks.sort((a: any, b: any) => {
        const dateA = new Date(a.schedule.scheduledDate);
        const dateB = new Date(b.schedule.scheduledDate);
        if (dateA.getTime() !== dateB.getTime()) {
          return dateA.getTime() - dateB.getTime();
        }
        // Secondary sort by priority
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority as keyof typeof priorityOrder] - priorityOrder[a.priority as keyof typeof priorityOrder];
      });

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
      const tasks = business.metadata?.fieldTasks || [];
      const task = tasks.find((t: any) => t.id === taskId);

      if (!task) {
        throw new NotFoundException('Task not found');
      }

      task.assignedTeam = teamId;
      task.assignedDate = new Date();
      task.status = 'assigned';
      task.updatedAt = new Date();

      business.markModified('metadata');
      await business.save();

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
    status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
  ): Promise<{ success: boolean; message: string }> {
    try {
      const business = await this.validateBusiness(businessId);

      // Find and update task
      const tasks = business.metadata?.fieldTasks || [];
      const task = tasks.find((t: any) => t.id === taskId);

      if (!task) {
        throw new NotFoundException('Task not found');
      }

      const previousStatus = task.status;
      task.status = status;
      task.updatedAt = new Date();

      // Set completion date if completed
      if (status === 'completed' && previousStatus !== 'completed') {
        task.completedDate = new Date();
      }

      business.markModified('metadata');
      await business.save();

      this.logger.log(`Updated task ${taskId} status from ${previousStatus} to ${status} for business ${businessId}`);

      return {
        success: true,
        message: `Task status updated to ${status}`
      };

    } catch (error) {
      this.logger.error(`Error updating task status: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get tasks by date range
   */
  async getTasksByDateRange(
    businessId: string,
    startDate: string,
    endDate: string
  ): Promise<{ tasks: FieldTask[]; total: number }> {
    try {
      const business = await this.validateBusiness(businessId);

      let tasks = business.metadata?.fieldTasks || [];

      // Filter by date range
      const start = new Date(startDate);
      const end = new Date(endDate);

      tasks = tasks.filter((task: any) => {
        const taskDate = new Date(task.schedule.scheduledDate);
        return taskDate >= start && taskDate <= end;
      });

      // Sort by scheduled date
      tasks.sort((a: any, b: any) => {
        return new Date(a.schedule.scheduledDate).getTime() - new Date(b.schedule.scheduledDate).getTime();
      });

      return {
        tasks,
        total: tasks.length
      };

    } catch (error) {
      this.logger.error(`Error getting tasks by date range: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

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

    if (!data.location?.address?.trim()) {
      throw new BadRequestException('Task address is required');
    }

    if (!data.location?.coordinates?.lat || !data.location?.coordinates?.lng) {
      throw new BadRequestException('Task coordinates are required');
    }

    if (!data.schedule?.scheduledDate) {
      throw new BadRequestException('Scheduled date is required');
    }

    if (!data.schedule?.timeWindow?.start || !data.schedule?.timeWindow?.end) {
      throw new BadRequestException('Time window is required');
    }

    if (!data.schedule?.estimatedDuration || data.schedule.estimatedDuration <= 0) {
      throw new BadRequestException('Valid estimated duration is required');
    }

    // Validate coordinates are reasonable
    const { lat, lng } = data.location.coordinates;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new BadRequestException('Invalid coordinates provided');
    }

    // Validate time window
    const startTime = data.schedule.timeWindow.start;
    const endTime = data.schedule.timeWindow.end;
    if (startTime >= endTime) {
      throw new BadRequestException('End time must be after start time');
    }
  }
}