// src/services/auto-assignment-agent.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TaskAssignment, TaskStatus, TaskPriority } from '../schemas/task-assignment.schema';
import { StaffProfile, SkillLevel } from '../schemas/staff-profile.schema';
import { User } from '../schemas/user.schema';
import { Business } from '../schemas/business.schema';
import * as geolib from 'geolib'; // You'll need to install this: npm install geolib

@Injectable()
export class AutoAssignmentAgentService {
  private readonly logger = new Logger(AutoAssignmentAgentService.name);

  constructor(
    @InjectModel(TaskAssignment.name) private taskModel: Model<TaskAssignment>,
    @InjectModel(StaffProfile.name) private staffProfileModel: Model<StaffProfile>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Business.name) private businessModel: Model<Business>
  ) {}

  /**
   * Process unassigned tasks automatically
   * Runs every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processUnassignedTasks() {
    this.logger.log('Processing unassigned tasks...');
    
    // Find all unassigned tasks
    const unassignedTasks = await this.taskModel.find({
      status: TaskStatus.UNASSIGNED,
      isDeleted: false
    }).sort({ priority: -1, dueDate: 1 }); // Sort by priority (highest first) then by due date (earliest first)
    
    for (const task of unassignedTasks) {
      await this.findOptimalAssignee(task);
    }
    
    this.logger.log(`Processed ${unassignedTasks.length} unassigned tasks`);
  }

  /**
   * Find the best assignee for a task based on multiple factors
   */
  async findOptimalAssignee(task: TaskAssignment): Promise<void> {
    // Find all available staff for the business
    const staffProfiles = await this.staffProfileModel.find({
      businessId: task.businessId
    }).populate('userId');
    
    if (staffProfiles.length === 0) {
      this.logger.warn(`No staff profiles found for business ${task.businessId}`);
      return;
    }

    // Extract task requirements (assuming they're in metadata)
    const requiredSkills = task.metadata?.requiredSkills || [];
    const taskLocation = task.metadata?.location;
    
    // Calculate scores for each potential assignee
    const scoredAssignees = await Promise.all(
      staffProfiles.map(async staff => {
        // Skill match score (0-100)
        const skillMatchScore = this.calculateSkillMatch(staff, requiredSkills);
        
        // Availability score (0-100)
        const availabilityScore = this.calculateAvailability(staff);
        
        // Proximity score if location is available (0-100)
        const proximityScore = taskLocation ? 
          this.calculateProximity(staff, taskLocation) : 100;
        
        // Workload balance score (0-100)
        const workloadScore = this.calculateWorkloadBalance(staff);
        
        // Calculate final score (weighted average)
        const weights = {
          skill: 0.4,
          availability: 0.3,
          proximity: 0.1,
          workload: 0.2
        };
        
        const finalScore = 
          (skillMatchScore * weights.skill) + 
          (availabilityScore * weights.availability) + 
          (proximityScore * weights.proximity) + 
          (workloadScore * weights.workload);
        
        return {
          staffProfile: staff,
          userId: staff.userId,
          metrics: {
            skillMatch: skillMatchScore,
            availabilityScore,
            proximityScore,
            workloadBalance: workloadScore,
            finalScore
          }
        };
      })
    );
    
    // Sort by final score (descending)
    scoredAssignees.sort((a, b) => b.metrics.finalScore - a.metrics.finalScore);
    
    // Select top candidate
    if (scoredAssignees.length > 0) {
      const bestMatch = scoredAssignees[0];
      
      // Update task with assignment
      await this.taskModel.findByIdAndUpdate(task._id, {
        assignedUserId: bestMatch.userId,
        status: TaskStatus.ASSIGNED,
        assignedAt: new Date(),
        potentialAssignees: scoredAssignees.map(a => a.userId),
        assignmentMetrics: bestMatch.metrics
      });
      
      // Update staff workload
      await this.staffProfileModel.findByIdAndUpdate(bestMatch.staffProfile._id, {
        $inc: { currentWorkload: 1 }
      });
      
      this.logger.log(`Task ${task._id} assigned to user ${bestMatch.userId} with score ${bestMatch.metrics.finalScore}`);
    } else {
      this.logger.warn(`No suitable assignee found for task ${task._id}`);
    }
  }

  /**
   * Calculate how well the staff's skills match the task requirements
   */
  private calculateSkillMatch(staffProfile: StaffProfile, requiredSkills: string[]): number {
    if (!requiredSkills || requiredSkills.length === 0) {
      return 100; // No specific skills required
    }
    
    let totalScore = 0;
    const staffSkills = staffProfile.skills || {};
    
    for (const skill of requiredSkills) {
      const staffSkill = staffSkills[skill];
      
      if (!staffSkill) {
        // Staff doesn't have this skill
        continue;
      }
      
      // Calculate score based on skill level
      switch (staffSkill.level) {
        case SkillLevel.EXPERT:
          totalScore += 100;
          break;
        case SkillLevel.ADVANCED:
          totalScore += 75;
          break;
        case SkillLevel.INTERMEDIATE:
          totalScore += 50;
          break;
        case SkillLevel.NOVICE:
          totalScore += 25;
          break;
      }
    }
    
    // Normalize score
    return Math.min(100, (totalScore / requiredSkills.length));
  }

  /**
   * Calculate availability score based on current workload and availability
   */
  private calculateAvailability(staffProfile: StaffProfile): number {
    // Basic implementation - could be expanded with actual calendar integration
    const currentWorkload = staffProfile.currentWorkload || 0;
    const maxWorkload = 10; // Example threshold
    
    // Check if at capacity
    if (currentWorkload >= maxWorkload) {
      return 0;
    }
    
    // Score decreases as workload increases
    return 100 - ((currentWorkload / maxWorkload) * 100);
  }

  /**
   * Calculate proximity score based on distance
   */
  private calculateProximity(staffProfile: StaffProfile, taskLocation: any): number {
    if (!staffProfile.location?.coordinates || !taskLocation?.coordinates) {
      return 50; // Default middle score if location data is missing
    }
    
    const staffCoords = {
      latitude: staffProfile.location.coordinates.latitude,
      longitude: staffProfile.location.coordinates.longitude
    };
    
    const taskCoords = {
      latitude: taskLocation.coordinates.latitude,
      longitude: taskLocation.coordinates.longitude
    };
    
    // Calculate distance in meters
    const distanceInMeters = geolib.getDistance(staffCoords, taskCoords);
    
    // Convert to kilometers
    const distanceInKm = distanceInMeters / 1000;
    
    // Score decreases with distance (example: 20km or more = 0 score)
    const maxDistance = 20;
    return Math.max(0, 100 - ((distanceInKm / maxDistance) * 100));
  }

  /**
   * Calculate workload balance score
   */
  private calculateWorkloadBalance(staffProfile: StaffProfile): number {
    const currentWorkload = staffProfile.currentWorkload || 0;
    const maxWeeklyHours = staffProfile.availability?.maxWeeklyHours || 40;
    const currentWeeklyHours = staffProfile.availability?.currentWeeklyHours || 0;
    
    // Calculate percentage of capacity used
    const capacityUsed = (currentWeeklyHours / maxWeeklyHours) * 100;
    
    // Score is higher for less utilized staff
    return Math.max(0, 100 - capacityUsed);
  }

  /**
   * Manually assign a task to a specific user
   */
  async manuallyAssignTask(taskId: string, userId: string): Promise<TaskAssignment> {
    const task = await this.taskModel.findById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }
    
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Update task with assignment
    const updatedTask = await this.taskModel.findByIdAndUpdate(
      taskId,
      {
        assignedUserId: userId,
        status: TaskStatus.ASSIGNED,
        assignedAt: new Date()
      },
      { new: true }
    );
    
    // Update staff workload
    await this.staffProfileModel.findOneAndUpdate(
      { userId },
      { $inc: { currentWorkload: 1 } }
    );
    
    return updatedTask;
  }

  /**
   * Create a new task
   */
  async createTask(taskData: Partial<TaskAssignment>): Promise<TaskAssignment> {
    const newTask = new this.taskModel(taskData);
    return newTask.save();
  }

  /**
   * Get all tasks for a business with optional filters
   */
  async getBusinessTasks(
    businessId: string, 
    filters: {
      status?: TaskStatus,
      assignedUserId?: string,
      dueDate?: Date
    } = {}
  ): Promise<TaskAssignment[]> {
    const query: any = { 
      businessId,
      isDeleted: false
    };
    
    // Add optional filters
    if (filters.status) query.status = filters.status;
    if (filters.assignedUserId) query.assignedUserId = filters.assignedUserId;
    if (filters.dueDate) query.dueDate = { $lte: filters.dueDate };
    
    return this.taskModel.find(query)
      .populate('assignedUserId', 'name surname email')
      .sort({ priority: -1, dueDate: 1 });
  }

  async getTaskById(taskId: string): Promise<TaskAssignment> {
    return this.taskModel.findById(taskId);
  }
}