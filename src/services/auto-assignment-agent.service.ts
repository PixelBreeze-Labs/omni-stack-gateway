// src/services/auto-assignment-agent.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { TaskAssignment, TaskStatus } from '../schemas/task-assignment.schema';
import { StaffProfile, SkillLevel } from '../schemas/staff-profile.schema';
import { User } from '../schemas/user.schema';
import { Business } from '../schemas/business.schema';
import { AgentConfiguration } from '../schemas/agent-configuration.schema';
import { AgentPermissionService } from './agent-permission.service';
import * as geolib from 'geolib';
import { CronJob } from 'cron';

@Injectable()
export class AutoAssignmentAgentService {
  private readonly logger = new Logger(AutoAssignmentAgentService.name);
  private businessCronJobs: Map<string, CronJob> = new Map();

  constructor(
    @InjectModel(TaskAssignment.name) private taskModel: Model<TaskAssignment>,
    @InjectModel(StaffProfile.name) private staffProfileModel: Model<StaffProfile>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(AgentConfiguration.name) private agentConfigModel: Model<AgentConfiguration>,
    private readonly agentPermissionService: AgentPermissionService,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {
    // Initialize custom cron jobs for businesses
    this.initializeBusinessCronJobs();
  }

  /**
   * Method to get task by ID - for controller access
   */
  async getTaskById(taskId: string): Promise<TaskAssignment> {
    return this.taskModel.findById(taskId);
  }

  /**
   * Initialize cron jobs for each business with the auto-assignment agent enabled
   */
  private async initializeBusinessCronJobs() {
    try {
      // Get all enabled auto-assignment agent configurations
      const enabledConfigs = await this.agentConfigModel.find({
        agentType: 'auto-assignment',
        isEnabled: true
      });

      for (const config of enabledConfigs) {
        this.setupBusinessCronJob(config.businessId, config.assignmentFrequency);
      }

      this.logger.log(`Initialized ${enabledConfigs.length} business-specific cron jobs`);
    } catch (error) {
      this.logger.error('Failed to initialize business cron jobs', error.stack);
    }
  }

  /**
   * Setup a cron job for a specific business
   */
  private setupBusinessCronJob(businessId: string, frequencyMinutes: number) {
    // Create a unique name for this cron job
    const jobName = `auto-assignment-${businessId}`;

    // Remove existing job if it exists
    try {
      const existingJob = this.schedulerRegistry.getCronJob(jobName);
      if (existingJob) {
        this.schedulerRegistry.deleteCronJob(jobName);
        this.logger.log(`Removed existing cron job: ${jobName}`);
      }
    } catch (error) {
      // Job doesn't exist, which is fine
    }

    // Create new cron expression based on frequency
    const cronExpression = `*/${frequencyMinutes} * * * *`; // Run every X minutes

    // Create and register new cron job
    const job = new CronJob(cronExpression, () => {
      this.processBusinessUnassignedTasks(businessId);
    });

    this.schedulerRegistry.addCronJob(jobName, job);
    job.start();

    // Store job reference
    this.businessCronJobs.set(businessId, job);
    this.logger.log(`Setup cron job for business ${businessId} with frequency: ${frequencyMinutes} minutes`);
  }

  /**
   * Update or create cron job for a business when configuration changes
   */
  async updateBusinessCronJob(businessId: string) {
    try {
      // Get latest configuration
      const config = await this.agentConfigModel.findOne({
        businessId,
        agentType: 'auto-assignment'
      });

      if (!config || !config.isEnabled) {
        // Configuration doesn't exist or is disabled - remove job if it exists
        const jobName = `auto-assignment-${businessId}`;
        try {
          this.schedulerRegistry.deleteCronJob(jobName);
          this.businessCronJobs.delete(businessId);
          this.logger.log(`Removed cron job for business ${businessId}`);
        } catch (error) {
          // Job doesn't exist, which is fine
        }
        return;
      }

      // Setup/update cron job with latest frequency
      this.setupBusinessCronJob(businessId, config.assignmentFrequency);
    } catch (error) {
      this.logger.error(`Failed to update cron job for business ${businessId}`, error.stack);
    }
  }

  /**
   * Default cron job that checks for any missed tasks
   * (Fallback to ensure no tasks are missed)
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async processUnassignedTasks() {
    this.logger.log('Running global unassigned tasks check...');
    
    // Find all active businesses with auto-assignment enabled
    const enabledBusinessIds = await this.agentConfigModel.find({
      agentType: 'auto-assignment',
      isEnabled: true
    }).distinct('businessId');
    
    // Process each business
    for (const businessId of enabledBusinessIds) {
      await this.processBusinessUnassignedTasks(businessId);
    }
  }

  /**
   * Process unassigned tasks for a specific business
   */
  async processBusinessUnassignedTasks(businessId: string) {
    this.logger.log(`Processing unassigned tasks for business ${businessId}...`);
    
    // Check if agent is enabled for this business
    const hasAccess = await this.agentPermissionService.hasAgentAccess(businessId, 'auto-assignment');
    
    if (!hasAccess) {
      this.logger.warn(`Auto-assignment agent not enabled for business ${businessId}`);
      return;
    }
    
    // Get agent configuration
    const agentConfig = await this.agentConfigModel.findOne({
      businessId,
      agentType: 'auto-assignment'
    });
    
    // Find all unassigned tasks for this business
    const unassignedTasks = await this.taskModel.find({
      businessId,
      status: TaskStatus.UNASSIGNED,
      isDeleted: false
    }).sort({ priority: -1, dueDate: 1 }); // Sort by priority (highest first) then by due date (earliest first)
    
    this.logger.log(`Found ${unassignedTasks.length} unassigned tasks for business ${businessId}`);
    
    for (const task of unassignedTasks) {
      await this.findOptimalAssignee(task, agentConfig);
    }
  }

  /**
   * Find the best assignee for a task based on multiple factors
   * Now uses the business-specific configuration
   */
  async findOptimalAssignee(task: TaskAssignment, config?: AgentConfiguration): Promise<void> {
    // If config not provided, fetch it
    if (!config) {
      config = await this.agentConfigModel.findOne({
        businessId: task.businessId,
        agentType: 'auto-assignment'
      });
      
      // If still no config, use default weights
      if (!config) {
        config = {
          weights: {
            skillMatch: 0.4,
            availability: 0.3,
            proximity: 0.1,
            workload: 0.2
          },
          requireApproval: true,
          maxTasksPerStaff: 10,
          respectMaxWorkload: true
        } as any;
      }
    }
    
    // Get the configuration weights
    const weights = config.weights;
    
    // Find all available staff for the business
    let staffQuery = this.staffProfileModel.find({
      businessId: task.businessId
    });
    
    // Filter by specific roles if configured
    if (config.autoAssignToRoles && config.autoAssignToRoles.length > 0) {
      staffQuery = staffQuery.populate({
        path: 'userId',
        match: { role: { $in: config.autoAssignToRoles } }
      });
    } else {
      staffQuery = staffQuery.populate('userId');
    }
    
    const staffProfiles = await staffQuery.exec();
    
    // Filter out staff profiles where userId didn't match the role criteria
    const validStaffProfiles = staffProfiles.filter(profile => profile.userId);
    
    if (validStaffProfiles.length === 0) {
      this.logger.warn(`No suitable staff profiles found for business ${task.businessId}`);
      return;
    }

    // Extract task requirements (assuming they're in metadata)
    const requiredSkills = task.metadata?.requiredSkills || [];
    // Prioritize skills if specified in configuration
    const prioritizedSkills = config.skillPriorities && config.skillPriorities.length > 0 ? 
      config.skillPriorities.filter(skill => requiredSkills.includes(skill)) : 
      requiredSkills;
    
    const taskLocation = task.metadata?.location;
    
    // Calculate scores for each potential assignee
    const scoredAssignees = await Promise.all(
      validStaffProfiles.map(async staff => {
        // Check max workload if configured
        if (config.respectMaxWorkload && 
            staff.currentWorkload >= config.maxTasksPerStaff) {
          return {
            staffProfile: staff,
            userId: staff.userId,
            metrics: {
              skillMatch: 0,
              availabilityScore: 0,
              proximityScore: 0,
              workloadBalance: 0,
              finalScore: 0
            }
          };
        }
        
        // Skill match score (0-100)
        const skillMatchScore = this.calculateSkillMatch(staff, prioritizedSkills);
        
        // Availability score (0-100)
        const availabilityScore = this.calculateAvailability(staff);
        
        // Proximity score if location is available (0-100)
        const proximityScore = taskLocation ? 
          this.calculateProximity(staff, taskLocation) : 100;
        
        // Workload balance score (0-100)
        const workloadScore = this.calculateWorkloadBalance(staff, config.maxTasksPerStaff);
        
        // Calculate final score (weighted average)
        const finalScore = 
          (skillMatchScore * weights.skillMatch) + 
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
    if (scoredAssignees.length > 0 && scoredAssignees[0].metrics.finalScore > 0) {
      const bestMatch = scoredAssignees[0];
      
      // Update task with assignment or proposed assignment based on approval config
      const updateData: Partial<TaskAssignment> = {
        potentialAssignees: scoredAssignees.map(a => a.userId),
        assignmentMetrics: bestMatch.metrics
      };
      
      if (config.requireApproval) {
        // Mark for approval
        updateData.metadata = {
          ...task.metadata,
          pendingAssignment: {
            userId: bestMatch.userId,
            requires_approval: true,
            proposed_at: new Date()
          }
        };
        
        // Send notification if configured
        if (config.notificationSettings?.emailNotifications && 
            config.notificationSettings?.notifyOnAssignment) {
          await this.sendAssignmentNotification(task, bestMatch, config);
        }
      } else {
        // Direct assignment
        updateData.assignedUserId = bestMatch.userId;
        updateData.status = TaskStatus.ASSIGNED;
        updateData.assignedAt = new Date();
        
        // Update staff workload
        await this.staffProfileModel.findByIdAndUpdate(bestMatch.staffProfile._id, {
          $inc: { currentWorkload: 1 }
        });
      }
      
      await this.taskModel.findByIdAndUpdate(task._id, updateData);
      
      this.logger.log(`Task ${task._id} ${config.requireApproval ? 'proposed for' : 'assigned to'} user ${bestMatch.userId} with score ${bestMatch.metrics.finalScore}`);
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
   * Calculate workload balance score with configurable max
   */
  private calculateWorkloadBalance(staffProfile: StaffProfile, maxTasks: number): number {
    const currentWorkload = staffProfile.currentWorkload || 0;
    
    // Score is higher for less utilized staff
    return Math.max(0, 100 - ((currentWorkload / maxTasks) * 100));
  }
  
  /**
   * Placeholder for notification method
   */
  private async sendAssignmentNotification(task: TaskAssignment, assignment: any, config: AgentConfiguration) {
    // This would be implemented to send emails to managers
    this.logger.log(`Notification would be sent for task ${task._id} assignment to user ${assignment.userId}`);
  }

  /**
   * Approve a pending assignment
   */
  async approveAssignment(taskId: string): Promise<TaskAssignment> {
    const task = await this.taskModel.findById(taskId);
    
    if (!task) {
      throw new Error('Task not found');
    }
    
    if (!task.metadata?.pendingAssignment) {
      throw new Error('No pending assignment found for this task');
    }
    
    const userId = task.metadata.pendingAssignment.userId;
    
    // Update task with assignment
    const updatedTask = await this.taskModel.findByIdAndUpdate(
      taskId,
      {
        assignedUserId: userId,
        status: TaskStatus.ASSIGNED,
        assignedAt: new Date(),
        $unset: { 'metadata.pendingAssignment': 1 }
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
   * Reject a pending assignment
   */
  async rejectAssignment(taskId: string, reason: string): Promise<TaskAssignment> {
    const task = await this.taskModel.findById(taskId);
    
    if (!task) {
      throw new Error('Task not found');
    }
    
    if (!task.metadata?.pendingAssignment) {
      throw new Error('No pending assignment found for this task');
    }
    
    // Update task to remove pending assignment
    const updatedTask = await this.taskModel.findByIdAndUpdate(
      taskId,
      {
        $unset: { 'metadata.pendingAssignment': 1 },
        $push: { 
          'metadata.rejectedAssignments': {
            userId: task.metadata.pendingAssignment.userId,
            rejectedAt: new Date(),
            reason
          }
        }
      },
      { new: true }
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
 * Get all tasks pending approval for a business
 */
async getPendingApprovalTasks(businessId: string): Promise<TaskAssignment[]> {
    return this.taskModel.find({
      businessId,
      'metadata.pendingAssignment': { $exists: true },
      isDeleted: false
    }).populate('assignedUserId', 'name surname email');
  }
}