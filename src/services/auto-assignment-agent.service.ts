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
import { CronJobHistory } from '../schemas/cron-job-history.schema';
import { AgentPermissionService } from './agent-permission.service';
import * as geolib from 'geolib';
import { CronJob } from 'cron';
import { StaffluentTaskService } from './staffluent-task.service';

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
    @InjectModel(CronJobHistory.name) private cronJobHistoryModel: Model<CronJobHistory>,
    private readonly agentPermissionService: AgentPermissionService,
    private readonly staffluentTaskService: StaffluentTaskService,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {
    // Initialize custom cron jobs for businesses
    this.initializeBusinessCronJobs();
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
    const job = new CronJob(cronExpression, async () => {
      const startTime = new Date();
      
      // Create a record for this job execution
      const jobRecord = await this.cronJobHistoryModel.create({
        jobName: `businessAutoAssign-${businessId}`,
        startTime,
        status: 'started',
        businessId
      });
      
      try {
        const result = await this.processBusinessUnassignedTasks(businessId);
        
        // Update job record on success
        const endTime = new Date();
        const duration = (endTime.getTime() - startTime.getTime()) / 1000;
        
        await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
          endTime,
          duration,
          status: 'completed',
          targetCount: result.totalTasks,
          processedCount: result.assignedCount,
          details: {
            businessId,
            frequency: frequencyMinutes,
            totalTasks: result.totalTasks,
            assignedCount: result.assignedCount,
            taskIds: result.taskIds
          }
        });
        
        this.logger.log(`[CRON COMPLETE] Business auto-assignment for ${businessId} completed, processed ${result.totalTasks} tasks, assigned ${result.assignedCount} tasks`);
      } catch (error) {
        // Update job record on failure
        const endTime = new Date();
        const duration = (endTime.getTime() - startTime.getTime()) / 1000;
        
        await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
          endTime,
          duration,
          status: 'failed',
          error: error.message
        });
        
        this.logger.error(`[CRON FAILED] Error in business cron job for ${businessId}: ${error.message}`, error.stack);
      }
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
    const startTime = new Date();
    this.logger.log(`[CRON START] Global unassigned tasks check started at ${startTime.toISOString()}`);
    
    // Create a record for this job execution
    const jobRecord = await this.cronJobHistoryModel.create({
      jobName: 'processUnassignedTasks',
      startTime,
      status: 'started'
    });
    
    try {
      // Find all active businesses with auto-assignment enabled
      const enabledBusinessIds = await this.agentConfigModel.find({
        agentType: 'auto-assignment',
        isEnabled: true
      }).distinct('businessId');
      
      let totalProcessed = 0;
      let totalAssigned = 0;
      const businessResults = [];
      let failedBusinesses = 0;
      
      // Process each business
      for (const businessId of enabledBusinessIds) {
        try {
          const result = await this.processBusinessUnassignedTasks(businessId);
          businessResults.push({
            businessId,
            totalTasks: result.totalTasks,
            assignedCount: result.assignedCount,
            success: true
          });
          
          totalProcessed += result.totalTasks;
          totalAssigned += result.assignedCount;
        } catch (error) {
          this.logger.error(`Error processing tasks for business ${businessId}: ${error.message}`);
          businessResults.push({
            businessId,
            error: error.message,
            success: false
          });
          failedBusinesses++;
        }
      }
      
      // Update the job record on completion
      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000;
      
      await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
        endTime,
        duration,
        status: 'completed',
        businessIds: enabledBusinessIds,
        targetCount: enabledBusinessIds.length,
        processedCount: enabledBusinessIds.length - failedBusinesses,
        failedCount: failedBusinesses,
        details: { 
          businessResults,
          totalBusinesses: enabledBusinessIds.length,
          totalTasksProcessed: totalProcessed,
          totalTasksAssigned: totalAssigned
        }
      });
      
      this.logger.log(`[CRON COMPLETE] Global unassigned tasks check completed at ${endTime.toISOString()}, duration: ${duration}s, processed: ${totalProcessed} tasks, assigned: ${totalAssigned} tasks`);
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
      
      this.logger.error(`[CRON FAILED] Error in global unassigned tasks check: ${error.message}`, error.stack);
    }
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
   * Process unassigned tasks for a specific business
   */
  async processBusinessUnassignedTasks(businessId: string): Promise<{ totalTasks: number, assignedCount: number, taskIds: string[] }> {
    this.logger.log(`Processing unassigned tasks for business ${businessId}...`);
    
    // Check if agent is enabled for this business
    const hasAccess = await this.agentPermissionService.hasAgentAccess(businessId, 'auto-assignment');
    
    if (!hasAccess) {
      this.logger.warn(`Auto-assignment agent not enabled for business ${businessId}`);
      return { totalTasks: 0, assignedCount: 0, taskIds: [] };
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
    
    let assignedCount = 0;
    const taskIds = unassignedTasks.map(task => task._id.toString());
    
    for (const task of unassignedTasks) {
      try {
        const beforeStatus = task.status;
        await this.findOptimalAssignee(task, agentConfig);
        
        // Check if task was assigned or marked for approval
        const updatedTask = await this.taskModel.findById(task._id);
        const wasProcessed = updatedTask.status !== beforeStatus || 
                            updatedTask.metadata?.pendingAssignment !== undefined;
        
        if (wasProcessed) assignedCount++;
      } catch (error) {
        this.logger.error(`Error processing task ${task._id}: ${error.message}`);
      }
    }
    
    return { totalTasks: unassignedTasks.length, assignedCount, taskIds };
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
   * Find optimal assignee for a VenueBoost task with history tracking
   */
  async findOptimalAssigneeForVenueBoostTask(taskId: string): Promise<boolean> {
    const startTime = new Date();
    this.logger.log(`[TASK ASSIGN] Finding optimal assignee for VenueBoost task ${taskId}`);
    
    // Create a record for this job execution
    const jobRecord = await this.cronJobHistoryModel.create({
      jobName: 'findOptimalAssigneeForVenueBoostTask',
      startTime,
      status: 'started',
      details: { taskId }
    });
    
    try {
      // Get the task from our system
      const task = await this.taskModel.findById(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }
      
      // Get the business from our system
      const business = await this.businessModel.findById(task.businessId);
      if (!business) {
        throw new Error(`Business ${task.businessId} not found`);
      }
      
      // Check if agent is enabled for this business
      const hasAccess = await this.agentPermissionService.hasAgentAccess(
        business.id.toString(), 
        'auto-assignment'
      );
      
      if (!hasAccess) {
        this.logger.warn(`Auto-assignment agent not enabled for business ${business.id}`);
        
        // Update the job record when agent not enabled
        const endTime = new Date();
        const duration = (endTime.getTime() - startTime.getTime()) / 1000;
        
        await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
          endTime,
          duration,
          status: 'completed',
          businessId: business.id.toString(),
          details: { 
            taskId,
            businessId: business.id.toString(),
            agentEnabled: false,
            result: false
          }
        });
        
        return false;
      }
      
      // Get agent configuration
      const agentConfig = await this.agentConfigModel.findOne({
        businessId: business.id.toString(),
        agentType: 'auto-assignment'
      });
      
      // Find all staff profiles for this business
      const staffProfiles = await this.staffProfileModel.find({
        businessId: business.id.toString()
      }).populate('userId');
      
      if (staffProfiles.length === 0) {
        this.logger.warn(`No staff profiles found for business ${business.id}`);
        
        // Update the job record when no staff profiles
        const endTime = new Date();
        const duration = (endTime.getTime() - startTime.getTime()) / 1000;
        
        await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
          endTime,
          duration,
          status: 'completed',
          businessId: business.id.toString(),
          details: { 
            taskId,
            businessId: business.id.toString(),
            noStaffProfiles: true,
            result: false
          }
        });
        
        return false;
      }
      
      // Extract task requirements
      const requiredSkills = task.metadata?.requiredSkills || [];
      
      // Prioritize skills if specified in configuration
      const prioritizedSkills = agentConfig.skillPriorities && agentConfig.skillPriorities.length > 0 ? 
        agentConfig.skillPriorities.filter(skill => requiredSkills.includes(skill)) : 
        requiredSkills;
      
      // Calculate scores for each potential assignee
      const scoredAssignees = await Promise.all(
        staffProfiles.map(async staff => {
          // Check max workload if configured
          if (agentConfig.respectMaxWorkload && 
              staff.currentWorkload >= agentConfig.maxTasksPerStaff) {
            return {
              staffProfile: staff,
              userId: staff.userId?.toString(),
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
          
          // Workload balance score (0-100)
          const workloadScore = this.calculateWorkloadBalance(staff, agentConfig.maxTasksPerStaff);
          
          // Calculate final score (weighted average)
          const finalScore = 
            (skillMatchScore * agentConfig.weights.skillMatch) + 
            (availabilityScore * agentConfig.weights.availability) + 
            (workloadScore * agentConfig.weights.workload);
          
          return {
            staffProfile: staff,
            userId: staff.userId?.toString(),
            metrics: {
              skillMatch: skillMatchScore,
              availabilityScore,
              proximityScore: 100, // Default since we don't have location for Staffluent tasks
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
          potentialAssignees: scoredAssignees.map(a => a.userId).filter(Boolean),
          assignmentMetrics: bestMatch.metrics
        };
        
        if (agentConfig.requireApproval) {
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
          if (agentConfig.notificationSettings?.emailNotifications && 
              agentConfig.notificationSettings?.notifyOnAssignment) {
            await this.sendAssignmentNotification(task, bestMatch, agentConfig);
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
          
          // Push assignment to Staffluent
          if (task.externalIds?.venueBoostTaskId && bestMatch.staffProfile.externalIds?.venueBoostStaffId) {
            await this.staffluentTaskService.pushTaskAssignment(
              task.externalIds.venueBoostTaskId, 
              bestMatch.staffProfile.externalIds.venueBoostStaffId
            );
          }
        }
        
        await this.taskModel.findByIdAndUpdate(task._id, updateData);
        
        // Update the job record on success
        const endTime = new Date();
        const duration = (endTime.getTime() - startTime.getTime()) / 1000;
        
        await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
          endTime,
          duration,
          status: 'completed',
          businessId: business.id.toString(),
          details: { 
            taskId,
            businessId: business.id.toString(),
            assigneeId: bestMatch.userId,
            requiresApproval: agentConfig.requireApproval,
            assignmentScore: bestMatch.metrics.finalScore,
            skillMatchScore: bestMatch.metrics.skillMatch,
            workloadScore: bestMatch.metrics.workloadBalance,
            availabilityScore: bestMatch.metrics.availabilityScore
          }
        });
        
        this.logger.log(`Task ${task._id} ${agentConfig.requireApproval ? 'proposed for' : 'assigned to'} user ${bestMatch.userId} with score ${bestMatch.metrics.finalScore}`);
        return true;
      } else {
        // Update the job record when no suitable assignee found
        const endTime = new Date();
        const duration = (endTime.getTime() - startTime.getTime()) / 1000;
        
        await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
          endTime,
          duration,
          status: 'completed',
          businessId: business.id.toString(),
          details: { 
            taskId,
            businessId: business.id.toString(),
            noSuitableAssignee: true,
            candidatesCount: scoredAssignees.length,
            result: false
          }
        });
        
        this.logger.warn(`No suitable assignee found for task ${task._id}`);
        return false;
      }
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
      
      this.logger.error(`Error finding optimal assignee for task ${taskId}: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Approve a pending assignment and sync to VenueBoost with history tracking
   */
  async approveVenueBoostAssignment(taskId: string): Promise<TaskAssignment> {
    const startTime = new Date();
    
    // Create a record for this job execution
    const jobRecord = await this.cronJobHistoryModel.create({
      jobName: 'approveVenueBoostAssignment',
      startTime,
      status: 'started',
      details: { taskId }
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
        
        throw new Error('Task not found');
      }
      
      if (!task.metadata?.pendingAssignment) {
        await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
          endTime: new Date(),
          duration: (new Date().getTime() - startTime.getTime()) / 1000,
          status: 'failed',
          error: 'No pending assignment found'
        });
        
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
      
      let syncedToVenueBoost = false;
      let staffProfileId = null;
      
      // Sync assignment to VenueBoost if external IDs exist
      if (task.externalIds?.venueBoostTaskId) {
        const staffProfile = await this.staffProfileModel.findOne({ userId });
        staffProfileId = staffProfile?._id;
        
        if (staffProfile?.externalIds?.venueBoostStaffId) {
          await this.staffluentTaskService.pushTaskAssignment(taskId, userId);
          syncedToVenueBoost = true;
        }
      }
      
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
          assignedUserId: userId,
          staffProfileId,
          syncedToVenueBoost,
          previousStatus: TaskStatus.UNASSIGNED,
          newStatus: TaskStatus.ASSIGNED
        }
      });
      
      return updatedTask;
    } catch (error) {
      // Update the job record on failure if not already updated
      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000;
      
      await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
        endTime,
        duration,
        status: 'failed',
        error: error.message
      });
      
      throw error;
    }
  }
}