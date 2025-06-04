// src/services/business-general.service.ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StaffProfile } from '../schemas/staff-profile.schema';
import { Business, EnhancedTeam } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import { Types } from 'mongoose';

import {
  SimpleStaffProfileResponse,
  FullStaffProfileResponse,
} from '../dtos/business-general.dto';
import { StaffluentEmployeeService } from './staffluent-employee.service';
import { StaffluentTaskService } from './staffluent-task.service';
import { GoogleMapsService } from './google-maps.service';
import { RoutePlanningConfiguration } from '../schemas/business.schema';

/**
 * Enhanced team response type for API responses
 */
interface EnhancedTeamResponse extends EnhancedTeam {
  stats: {
    totalTasks: number;
    completedTasks: number;
    onTimePerformance: number;
    averageRating: number;
    totalDistanceTraveled: number;
    fuelConsumption: number;
    activeHours: number;
    lastActivityDate: Date;
    serviceAreaCoverage: number;
    equipmentUtilization: number;
  };
  recentActivity: Array<{
    date: Date;
    type: 'task_completed' | 'location_update' | 'status_change' | 'maintenance';
    description: string;
    metadata?: any;
  }>;
}


@Injectable()
export class BusinessGeneralService {
  private readonly logger = new Logger(BusinessGeneralService.name);

  constructor(
    @InjectModel(StaffProfile.name) private staffProfileModel: Model<StaffProfile>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly googleMapsService: GoogleMapsService,
    private readonly staffluentEmployeeService: StaffluentEmployeeService,
    private readonly staffluentTaskService: StaffluentTaskService,
  ) {}

  // ============================================================================
  // INDIVIDUAL STAFF PROFILES
  // ============================================================================

  /**
   * Get simple staff profile (basic information for modals/cards)
   */
  async getSimpleStaffProfile(
    staffId: string,
    businessId: string
  ): Promise<SimpleStaffProfileResponse> {
    try {
      const staffProfile = await this.staffProfileModel
        .findOne({ _id: staffId, businessId })
        .lean();

      if (!staffProfile) {
        throw new NotFoundException('Staff profile not found');
      }

      return {
        hireDate: staffProfile.hireDate,
        performance: staffProfile.performanceMetrics?.averageTaskRating || 0,
        currentWorkload: staffProfile.currentWorkload || 0,
        averageRating: staffProfile.averageRating || 0,
        taskCompletionRate: staffProfile.taskCompletionRate || 0,
        totalSkills: Object.keys(staffProfile.skills || {}).length,
        yearsExperience: Math.floor((staffProfile.totalWorkExperienceMonths || 0) / 12),
        startDate: staffProfile.hireDate
      };
    } catch (error) {
      this.logger.error(`Error getting simple staff profile: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get full staff profile (comprehensive information)
   */
  async getFullStaffProfile(
    staffId: string,
    businessId: string
  ): Promise<FullStaffProfileResponse> {
    try {
      const staffProfile = await this.staffProfileModel
        .findOne({ _id: staffId, businessId })
        .lean();

      if (!staffProfile) {
        throw new NotFoundException('Staff profile not found');
      }
     

      // Process skills data
      const skills = this.processSkillsData(staffProfile.skills || {});

      // Process work experience
      const workExperience = (staffProfile.workExperience || []).map(exp => ({
        companyName: exp.companyName,
        position: exp.position,
        industry: exp.industry,
        startDate: exp.startDate,
        endDate: exp.endDate,
        durationMonths: exp.durationMonths,
        type: exp.type,
        responsibilities: exp.responsibilities || [],
        skillsGained: exp.skillsGained || [],
        achievements: exp.achievements || [],
        verified: exp.verified || false
      }));

      // Process development goals
      const developmentGoals = (staffProfile.developmentGoals || []).map(goal => ({
        skillName: goal.skillName,
        targetLevel: goal.targetLevel,
        targetDate: goal.targetDate,
        currentProgress: goal.currentProgress,
        status: goal.status,
        milestones: goal.milestones || [],
        assignedBy: goal.assignedBy
      }));

      // Process performance metrics
      const performanceHistory = (staffProfile.skillAssessments || []).map(assessment => ({
        skillName: assessment.skillName,
        assessmentDate: assessment.assessmentDate,
        assessorType: assessment.assessorType,
        rating: assessment.rating,
        notes: assessment.notes,
        improvementPlan: assessment.improvementPlan
      }));

      return {
        // Experience & Tenure
        experienceMetrics: {
          totalWorkExperienceMonths: staffProfile.totalWorkExperienceMonths || 0,
          currentTenureMonths: staffProfile.currentTenureMonths || 0,
          industryExperienceMonths: staffProfile.industryExperienceMonths || 0,
          yearsExperience: Math.floor((staffProfile.totalWorkExperienceMonths || 0) / 12)
        },

        // Skills & Competencies
        skills,
        skillsSummary: {
          totalSkills: Object.keys(staffProfile.skills || {}).length,
          verifiedSkills: Object.values(staffProfile.skills || {}).filter(skill => skill.verified).length,
          skillsByLevel: this.getSkillsByLevel(staffProfile.skills || {}),
          topSkills: this.getTopSkills(staffProfile.skills || {}, 5)
        },

        // Work Experience
        workExperience,

        // Education & Training
        education: staffProfile.education || [],
        training: (staffProfile.training || []).map(t => ({
          name: t.name,
          provider: t.provider,
          completedDate: t.completedDate,
          expirationDate: t.expirationDate,
          certificateUrl: t.certificateUrl,
          skillsLearned: t.skillsLearned || []
        })),
        certifications: staffProfile.certifications || [],

        // Performance & Analytics
        performanceMetrics: {
          tasksCompleted: staffProfile.performanceMetrics?.tasksCompleted || 0,
          tasksOnTime: staffProfile.performanceMetrics?.tasksOnTime || 0,
          averageTaskRating: staffProfile.performanceMetrics?.averageTaskRating || 0,
          customerFeedbackScore: staffProfile.performanceMetrics?.customerFeedbackScore || 0,
          peerRatingAverage: staffProfile.performanceMetrics?.peerRatingAverage || 0,
          improvementAreas: staffProfile.performanceMetrics?.improvementAreas || [],
          strengths: staffProfile.performanceMetrics?.strengths || [],
          lastPerformanceReview: staffProfile.performanceMetrics?.lastPerformanceReview,
          nextPerformanceReview: staffProfile.performanceMetrics?.nextPerformanceReview
        },

        // Current Status
        currentStatus: {
          workload: staffProfile.currentWorkload || 0,
          averageRating: staffProfile.averageRating || 0,
          taskCompletionRate: staffProfile.taskCompletionRate || 0,
          availability: staffProfile.availability || null
        },

        // Development & Goals
        developmentGoals,
        performanceHistory,

        // Location & Contact
        location: staffProfile.location || null,
        preferences: staffProfile.preferences || null,
      };
    } catch (error) {
      this.logger.error(`Error getting full staff profile: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================================================
  // DEPARTMENT MANAGEMENT
  // ============================================================================

  /**
   * Create a new department for a business
   */
  async createDepartment(
    businessId: string,
    departmentData: {
      name: string;
      requiredSkills?: string[];
      optionalSkills?: string[];
      skillWeights?: Record<string, number>;
      metadata?: any;
    }
  ): Promise<{ success: boolean; departmentId: string; message: string }> {
    try {
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      // Check if department name already exists
      const existingDept = business.departments.find(
        (dept: any) => dept.name.toLowerCase() === departmentData.name.toLowerCase()
      );
      
      if (existingDept) {
        throw new Error('Department with this name already exists');
      }

      // Generate a unique ID for the department
      const departmentId = new Date().getTime().toString();
      const now = new Date();
      
      // Create new department object with all fields
      const newDepartment = {
        id: departmentId,
        name: departmentData.name,
        requiredSkills: departmentData.requiredSkills || [],
        optionalSkills: departmentData.optionalSkills || [],
        skillWeights: departmentData.skillWeights || {},
        metadata: departmentData.metadata || {},
        createdAt: now,
        updatedAt: now
      };

      // Add department to business
      business.departments.push(newDepartment);
      business.markModified('departments');
      await business.save();

      return {
        success: true,
        departmentId,
        message: `Department '${departmentData.name}' created successfully`
      };
    } catch (error) {
      this.logger.error(`Error creating department: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update an existing department
   */
  async updateDepartment(
    businessId: string,
    departmentId: string,
    updateData: {
      name?: string;
      requiredSkills?: string[];
      optionalSkills?: string[];
      skillWeights?: Record<string, number>;
      metadata?: any;
    }
  ): Promise<{ success: boolean; message: string }> {
    try {
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      // Find department by ID
      const departmentIndex = business.departments.findIndex(
        (dept: any) => dept.id === departmentId
      );

      if (departmentIndex === -1) {
        throw new NotFoundException('Department not found');
      }

      // Check if new name conflicts with existing departments (if name is being updated)
      if (updateData.name) {
        const nameConflict = business.departments.find(
          (dept: any, index: number) => 
            index !== departmentIndex && 
            dept.name.toLowerCase() === updateData.name.toLowerCase()
        );
        
        if (nameConflict) {
          throw new Error('Department with this name already exists');
        }
      }

      // Update department data
      const department = business.departments[departmentIndex] as any;
      
      if (updateData.name !== undefined) department.name = updateData.name;
      if (updateData.requiredSkills !== undefined) department.requiredSkills = updateData.requiredSkills;
      if (updateData.optionalSkills !== undefined) department.optionalSkills = updateData.optionalSkills;
      if (updateData.skillWeights !== undefined) department.skillWeights = updateData.skillWeights;
      if (updateData.metadata !== undefined) {
        // Merge metadata instead of replacing
        department.metadata = { ...department.metadata, ...updateData.metadata };
      }
      
      // Always update the timestamp
      department.updatedAt = new Date();

      // Mark the departments array as modified for Mongoose
      business.markModified('departments');
      await business.save();

      return {
        success: true,
        message: `Department updated successfully`
      };
    } catch (error) {
      this.logger.error(`Error updating department: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Remove a department from a business
   */
  async removeDepartment(
    businessId: string,
    departmentId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      // Find department by ID
      const departmentIndex = business.departments.findIndex(
        (dept: any) => dept.id === departmentId
      );

      if (departmentIndex === -1) {
        throw new NotFoundException('Department not found');
      }

      const departmentName = (business.departments[departmentIndex] as any).name;

      // Remove department from array
      business.departments.splice(departmentIndex, 1);
      
      // Mark as modified and save
      business.markModified('departments');
      await business.save();

      return {
        success: true,
        message: `Department '${departmentName}' removed successfully`
      };
    } catch (error) {
      this.logger.error(`Error removing department: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all departments for a business
   */
  async getDepartments(businessId: string): Promise<{ departments: any[] }> {
    try {
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      return {
        departments: business.departments || []
      };
    } catch (error) {
      this.logger.error(`Error getting departments: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================================================
  // TEAM MANAGEMENT (NEW)
  // ============================================================================

  /**
   * Create a new team for a business
   */
  async createTeam(
    businessId: string,
    teamData: {
      name: string;
      metadata?: any;
    }
  ): Promise<{ success: boolean; teamId: string; message: string }> {
    try {
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      // Check if team name already exists
      const existingTeam = business.teams.find(
        (team: any) => team.name.toLowerCase() === teamData.name.toLowerCase()
      );
      
      if (existingTeam) {
        throw new Error('Team with this name already exists');
      }

      // Generate a unique ID for the team
      const teamId = new Date().getTime().toString();
      const now = new Date();
      
      // Create new team object
      const newTeam = {
        id: teamId,
        name: teamData.name,
        metadata: teamData.metadata || {},
        createdAt: now,
        updatedAt: now
      };

      // Add team to business
      business.teams.push(newTeam as EnhancedTeam);
      business.markModified('teams');
      await business.save();

      return {
        success: true,
        teamId,
        message: `Team '${teamData.name}' created successfully`
      };
    } catch (error) {
      this.logger.error(`Error creating team: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update an existing team
   */
  async updateTeam(
    businessId: string,
    teamId: string,
    updateData: {
      name?: string;
      metadata?: any;
    }
  ): Promise<{ success: boolean; message: string }> {
    try {
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      // Find team by ID
      const teamIndex = business.teams.findIndex(
        (team: any) => team.id === teamId
      );

      if (teamIndex === -1) {
        throw new NotFoundException('Team not found');
      }

      // Check if new name conflicts with existing teams (if name is being updated)
      if (updateData.name) {
        const nameConflict = business.teams.find(
          (team: any, index: number) => 
            index !== teamIndex && 
            team.name.toLowerCase() === updateData.name.toLowerCase()
        );
        
        if (nameConflict) {
          throw new Error('Team with this name already exists');
        }
      }

      // Update team data
      const team = business.teams[teamIndex] as any;
      
      if (updateData.name !== undefined) team.name = updateData.name;
      if (updateData.metadata !== undefined) {
        // Merge metadata instead of replacing
        team.metadata = { ...team.metadata, ...updateData.metadata };
      }
      
      // Always update the timestamp
      team.updatedAt = new Date();

      // Mark the teams array as modified for Mongoose
      business.markModified('teams');
      await business.save();

      return {
        success: true,
        message: `Team updated successfully`
      };
    } catch (error) {
      this.logger.error(`Error updating team: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Remove a team from a business
   */
  async removeTeam(
    businessId: string,
    teamId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      // Find team by ID
      const teamIndex = business.teams.findIndex(
        (team: any) => team.id === teamId
      );

      if (teamIndex === -1) {
        throw new NotFoundException('Team not found');
      }

      const teamName = (business.teams[teamIndex] as any).name;

      // Remove team from array
      business.teams.splice(teamIndex, 1);
      
      // Mark as modified and save
      business.markModified('teams');
      await business.save();

      return {
        success: true,
        message: `Team '${teamName}' removed successfully`
      };
    } catch (error) {
      this.logger.error(`Error removing team: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all teams for a business
   */
  async getTeams(businessId: string): Promise<{ teams: any[] }> {
    try {
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      return {
        teams: business.teams || []
      };
    } catch (error) {
      this.logger.error(`Error getting teams: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================================================
  // SYNC OPERATIONS
  // ============================================================================

  /**
   * Trigger employee sync from VenueBoost for this business
   */
  async syncEmployeesFromVenueBoost(businessId: string): Promise<{
    success: boolean;
    message: string;
    syncedCount?: number;
    externalIdUpdates?: number;
    externalIdFailures?: number;
    logs: string[];
    summary?: any;
  }> {
    try {
      this.logger.log(`Triggering employee sync for business ${businessId}`);
      
      const syncResult = await this.staffluentEmployeeService.triggerManualSync(businessId);
      
      this.logger.log(`Employee sync completed for business ${businessId}: ${syncResult.message}`);
      
      return syncResult;
    } catch (error) {
      this.logger.error(`Error syncing employees for business ${businessId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Trigger task sync from VenueBoost for this business
   */
  async syncTasksFromVenueBoost(businessId: string): Promise<{
    success: boolean;
    message: string;
    syncedCount?: number;
    logs: string[];
    summary?: any;
  }> {
    try {
      this.logger.log(`Triggering task sync for business ${businessId}`);
      
      const syncResult = await this.staffluentTaskService.triggerManualSync(businessId);
      
      this.logger.log(`Task sync completed for business ${businessId}: ${syncResult.message}`);
      
      return syncResult;
    } catch (error) {
      this.logger.error(`Error syncing tasks for business ${businessId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================================================
  // DEPARTMENT SKILLS METHODS
  // ============================================================================

  async updateDepartmentSkills(
    businessId: string,
    departmentId: string,
    skillsData: {
      requiredSkills?: string[];
      optionalSkills?: string[];
      skillWeights?: Record<string, number>;
    }
  ): Promise<{ success: boolean; message: string }> {
    try {
      // CRITICAL FIX: Use findByIdAndUpdate with arrayFilters
      // This properly updates nested array elements in MongoDB
      
      const updateResult = await this.businessModel.findOneAndUpdate(
        { 
          _id: businessId,
          'departments.id': departmentId 
        },
        {
          $set: {
            'departments.$.requiredSkills': skillsData.requiredSkills || [],
            'departments.$.optionalSkills': skillsData.optionalSkills || [],
            'departments.$.skillWeights': skillsData.skillWeights || {},
            'departments.$.updatedAt': new Date()
          }
        },
        { 
          new: true,
          runValidators: true 
        }
      );

      if (!updateResult) {
        throw new NotFoundException('Business or department not found');
      }

      this.logger.log(`Successfully updated skills for department ${departmentId} in business ${businessId}`);

      return {
        success: true,
        message: `Department skills updated successfully`
      };
    } catch (error) {
      this.logger.error(`Error updating department skills: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get department with its skill requirements
   */
  async getDepartmentSkills(
    businessId: string,
    departmentId: string
  ): Promise<{
    department: any;
    skillRequirements: {
      required: string[];
      optional: string[];
      weights: Record<string, number>;
    };
  }> {
    try {
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      const department = business.departments.find(
        (dept: any) => dept.id === departmentId
      );

      if (!department) {
        throw new NotFoundException('Department not found');
      }

      return {
        department,
        skillRequirements: {
          required: department.requiredSkills || [],
          optional: department.optionalSkills || [],
          weights: department.skillWeights || {}
        }
      };
    } catch (error) {
      this.logger.error(`Error getting department skills: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Sync department skill requirements with business skill requirements
   */
  async syncDepartmentSkills(businessId: string): Promise<{
    success: boolean;
    message: string;
    syncedDepartments: number;
  }> {
    try {
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      let syncedDepartments = 0;

      // Update each department with business-level skill requirements
      for (const department of business.departments) {
        const dept = department as any;
        
        // Find business skill requirements for this department
        const departmentSkillReqs = business.skillRequirements?.filter(
          req => req.department === dept.name || !req.department
        ) || [];

        const requiredSkills = departmentSkillReqs
          .filter(req => req.level === 'required')
          .map(req => req.name);

        const optionalSkills = departmentSkillReqs
          .filter(req => req.level === 'preferred' || req.level === 'optional')
          .map(req => req.name);

        const skillWeights: Record<string, number> = {};
        departmentSkillReqs.forEach(req => {
          if (req.customWeight) {
            skillWeights[req.name] = req.customWeight;
          }
        });

        // Update department if there are changes
        const hasChanges = 
          JSON.stringify(dept.requiredSkills || []) !== JSON.stringify(requiredSkills) ||
          JSON.stringify(dept.optionalSkills || []) !== JSON.stringify(optionalSkills) ||
          JSON.stringify(dept.skillWeights || {}) !== JSON.stringify(skillWeights);

        if (hasChanges) {
          dept.requiredSkills = requiredSkills;
          dept.optionalSkills = optionalSkills;
          dept.skillWeights = skillWeights;
          dept.updatedAt = new Date();
          syncedDepartments++;
        }
      }

      if (syncedDepartments > 0) {
        business.markModified('departments');
        await business.save();
      }

      this.logger.log(`Synced skill requirements for ${syncedDepartments} departments in business ${businessId}`);

      return {
        success: true,
        message: `Synced skill requirements for ${syncedDepartments} departments`,
        syncedDepartments
      };
    } catch (error) {
      this.logger.error(`Error syncing department skills: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Process skills data for display
   */
  private processSkillsData(skills: Record<string, any>) {
    return Object.entries(skills).map(([skillName, skillData]) => ({
      name: skillName,
      level: skillData.level,
      yearsExperience: skillData.yearsExperience || 0,
      monthsExperience: skillData.monthsExperience || 0,
      lastUsed: skillData.lastUsed,
      source: skillData.source,
      confidence: skillData.confidence || 0,
      verified: skillData.verified || false,
      verifiedBy: skillData.verifiedBy,
      verifiedAt: skillData.verifiedAt,
      performanceRating: skillData.performanceRating || 0,
      notes: skillData.notes,
      trainingCompleted: skillData.trainingCompleted || []
    }));
  }

  /**
   * Get skills grouped by level
   */
  private getSkillsByLevel(skills: Record<string, any>) {
    const skillsByLevel = {
      novice: 0,
      intermediate: 0,
      advanced: 0,
      expert: 0
    };

    Object.values(skills).forEach((skill: any) => {
      if (skill.level && skillsByLevel.hasOwnProperty(skill.level)) {
        skillsByLevel[skill.level as keyof typeof skillsByLevel]++;
      }
    });

    return skillsByLevel;
  }

  /**
   * Get top skills by performance or confidence
   */
  private getTopSkills(skills: Record<string, any>, limit: number = 5) {
    return Object.entries(skills)
      .sort(([,a], [,b]) => {
        // Sort by performance rating, then confidence, then experience
        const aScore = (a.performanceRating || 0) * 100 + (a.confidence || 0) + (a.yearsExperience || 0);
        const bScore = (b.performanceRating || 0) * 100 + (b.confidence || 0) + (b.yearsExperience || 0);
        return bScore - aScore;
      })
      .slice(0, limit)
      .map(([name, data]) => ({
        name,
        level: data.level,
        performanceRating: data.performanceRating || 0,
        confidence: data.confidence || 0,
        yearsExperience: data.yearsExperience || 0
      }));
  }

  // ============================================================================
// ROUTE PLANNING CONFIGURATION METHODS (NEW)
// ============================================================================

/**
 * Update route planning configuration
 */
async updateRoutePlanningConfig(
  businessId: string,
  configData: Partial<RoutePlanningConfiguration>
): Promise<{ success: boolean; message: string }> {
  try {
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    // Get current config or create default
    const currentConfig = business.routePlanningConfig || this.getDefaultRoutePlanningConfig();

    // Deep merge the configuration
    const updatedConfig: RoutePlanningConfiguration = {
      enabled: configData.enabled !== undefined ? configData.enabled : currentConfig.enabled,
      defaultOptimizationParams: {
        ...currentConfig.defaultOptimizationParams,
        ...(configData.defaultOptimizationParams || {})
      },
      integrations: {
        googleMaps: {
          ...currentConfig.integrations.googleMaps,
          ...(configData.integrations?.googleMaps || {})
        },
        weatherApi: {
          ...currentConfig.integrations.weatherApi,
          ...(configData.integrations?.weatherApi || {})
        }
      },
      workingHours: {
        ...currentConfig.workingHours,
        ...(configData.workingHours || {})
      },
      serviceRadius: configData.serviceRadius !== undefined ? configData.serviceRadius : currentConfig.serviceRadius,
      allowOvertimeRoutes: configData.allowOvertimeRoutes !== undefined ? configData.allowOvertimeRoutes : currentConfig.allowOvertimeRoutes,
      maxDailyTasksPerTeam: configData.maxDailyTasksPerTeam !== undefined ? configData.maxDailyTasksPerTeam : currentConfig.maxDailyTasksPerTeam,
      automaticOptimization: {
        ...currentConfig.automaticOptimization,
        ...(configData.automaticOptimization || {})
      },
      notifications: {
        ...currentConfig.notifications,
        ...(configData.notifications || {})
      }
    };

    // Validate the configuration
    const validation = this.validateConfigData(updatedConfig);
    if (!validation.isValid) {
      throw new BadRequestException(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    // Update business with new config
    business.routePlanningConfig = updatedConfig;
    business.markModified('routePlanningConfig');
    await business.save();

    this.logger.log(`Updated route planning configuration for business ${businessId}`);

    return {
      success: true,
      message: 'Route planning configuration updated successfully'
    };
  } catch (error) {
    this.logger.error(`Error updating route planning config: ${error.message}`, error.stack);
    throw error;
  }
}

/**
 * Reset route planning configuration to defaults
 */
async resetRoutePlanningConfig(
  businessId: string
): Promise<{ success: boolean; message: string; config: RoutePlanningConfiguration }> {
  try {
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const defaultConfig = this.getDefaultRoutePlanningConfig();
    
    business.routePlanningConfig = defaultConfig;
    business.markModified('routePlanningConfig');
    await business.save();

    this.logger.log(`Reset route planning configuration to defaults for business ${businessId}`);

    return {
      success: true,
      message: 'Route planning configuration reset to defaults',
      config: defaultConfig
    };
  } catch (error) {
    this.logger.error(`Error resetting route planning config: ${error.message}`, error.stack);
    throw error;
  }
}

/**
 * Update Google Maps integration configuration
 */
async updateGoogleMapsConfig(
  businessId: string,
  googleMapsConfig: {
    apiKey?: string;
    enabled: boolean;
    geocodingEnabled?: boolean;
    directionsEnabled?: boolean;
    trafficEnabled?: boolean;
  }
): Promise<{ success: boolean; message: string; isValid?: boolean; errors?: string[] }> {
  try {
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    // Get current config or create default
    const currentConfig = business.routePlanningConfig || this.getDefaultRoutePlanningConfig();

    // Update Google Maps configuration
    const updatedGoogleMapsConfig = {
      ...currentConfig.integrations.googleMaps,
      enabled: googleMapsConfig.enabled,
      ...(googleMapsConfig.apiKey !== undefined && { apiKey: googleMapsConfig.apiKey }),
      ...(googleMapsConfig.geocodingEnabled !== undefined && { geocodingEnabled: googleMapsConfig.geocodingEnabled }),
      ...(googleMapsConfig.directionsEnabled !== undefined && { directionsEnabled: googleMapsConfig.directionsEnabled }),
      ...(googleMapsConfig.trafficEnabled !== undefined && { trafficEnabled: googleMapsConfig.trafficEnabled })
    };

    // Validate API key if provided and enabled
    let isValid = true;
    let errors: string[] = [];

    if (googleMapsConfig.enabled) {
      if (!updatedGoogleMapsConfig.apiKey) {
        isValid = false;
        errors.push('API key is required when Google Maps is enabled');
      } else {
        // Validate API key if you have GoogleMapsService
        try {
          const validation = await this.googleMapsService.validateConfiguration(updatedGoogleMapsConfig);
          isValid = validation.isValid;
          errors = validation.errors;
        } catch (error) {
          isValid = false;
          errors.push(`API key validation failed: ${error.message}`);
        }
      }
    }

    // Update the business configuration
    currentConfig.integrations.googleMaps = updatedGoogleMapsConfig;
    business.routePlanningConfig = currentConfig;
    business.markModified('routePlanningConfig');
    await business.save();

    this.logger.log(`Updated Google Maps configuration for business ${businessId}`);

    return {
      success: true,
      message: 'Google Maps configuration updated successfully',
      isValid,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    this.logger.error(`Error updating Google Maps config: ${error.message}`, error.stack);
    throw error;
  }
}

/**
 * Update weather integration configuration
 */
async updateWeatherConfig(
  businessId: string,
  weatherConfig: {
    enabled: boolean;
    considerInRouting?: boolean;
    delayThresholds?: {
      rain?: number;
      snow?: number;
      wind?: number;
      temperature?: { min: number; max: number };
    };
  }
): Promise<{ success: boolean; message: string }> {
  try {
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    // Get current config or create default
    const currentConfig = business.routePlanningConfig || this.getDefaultRoutePlanningConfig();

    // Update weather configuration
    const updatedWeatherConfig = {
      ...currentConfig.integrations.weatherApi,
      enabled: weatherConfig.enabled,
      ...(weatherConfig.considerInRouting !== undefined && { considerInRouting: weatherConfig.considerInRouting }),
      ...(weatherConfig.delayThresholds && {
        delayThresholds: {
          ...currentConfig.integrations.weatherApi.delayThresholds,
          ...weatherConfig.delayThresholds
        }
      })
    };

    // Update the business configuration
    currentConfig.integrations.weatherApi = updatedWeatherConfig;
    business.routePlanningConfig = currentConfig;
    business.markModified('routePlanningConfig');
    await business.save();

    this.logger.log(`Updated weather configuration for business ${businessId}`);

    return {
      success: true,
      message: 'Weather configuration updated successfully'
    };
  } catch (error) {
    this.logger.error(`Error updating weather config: ${error.message}`, error.stack);
    throw error;
  }
}

/**
 * Validate route planning configuration
 */
async validateRoutePlanningConfig(
  businessId: string
): Promise<{
  isValid: boolean;
  errors: string[];
  warnings: string[];
  integrationStatus: {
    googleMaps: { enabled: boolean; valid: boolean; errors?: string[] };
    weather: { enabled: boolean; valid: boolean; errors?: string[] };
  };
}> {
  try {
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const config = business.routePlanningConfig;
    if (!config) {
      return {
        isValid: false,
        errors: ['Route planning configuration not found'],
        warnings: ['Consider setting up route planning configuration'],
        integrationStatus: {
          googleMaps: { enabled: false, valid: false, errors: ['Not configured'] },
          weather: { enabled: false, valid: false, errors: ['Not configured'] }
        }
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate core configuration
    const coreValidation = this.validateConfigData(config);
    if (!coreValidation.isValid) {
      errors.push(...coreValidation.errors);
    }
    warnings.push(...coreValidation.warnings);

    // Validate Google Maps integration
    const googleMapsStatus = await this.validateGoogleMapsIntegration(config.integrations.googleMaps);
    
    // Validate Weather integration
    const weatherStatus = await this.validateWeatherIntegration(config.integrations.weatherApi);

    const isValid = errors.length === 0 && googleMapsStatus.valid && weatherStatus.valid;

    return {
      isValid,
      errors,
      warnings,
      integrationStatus: {
        googleMaps: googleMapsStatus,
        weather: weatherStatus
      }
    };
  } catch (error) {
    this.logger.error(`Error validating route planning config: ${error.message}`, error.stack);
    throw error;
  }
}

// ============================================================================
// PRIVATE HELPER METHODS FOR ROUTE PLANNING CONFIG
// ============================================================================

/**
 * Get default route planning configuration
 */
private getDefaultRoutePlanningConfig(): RoutePlanningConfiguration {
  return {
    enabled: true,
    defaultOptimizationParams: {
      prioritizeTime: true,
      prioritizeFuel: false,
      prioritizeCustomerPreference: true,
      maxRouteTime: 480, // 8 hours
      maxStopsPerRoute: 15,
      allowOvertime: false,
      considerTraffic: true,
      considerWeather: true,
      skillMatching: true,
      balanceWorkload: true
    },
    integrations: {
      googleMaps: {
        enabled: false,
        geocodingEnabled: true,
        directionsEnabled: true,
        trafficEnabled: true
      },
      weatherApi: {
        enabled: false,
        considerInRouting: true,
        delayThresholds: {
          rain: 10, // mm
          snow: 5,  // cm
          wind: 25, // km/h
          temperature: { min: -10, max: 40 } // celsius
        }
      }
    },
    workingHours: {
      start: '08:00',
      end: '17:00',
      timezone: 'UTC',
      allowEarlyStart: false,
      allowLateFinish: false
    },
    serviceRadius: 50, // km
    allowOvertimeRoutes: false,
    maxDailyTasksPerTeam: 8,
    automaticOptimization: {
      enabled: false,
      scheduleTime: '06:00',
      advanceDays: 1
    },
    notifications: {
      routeAssigned: true,
      routeStarted: true,
      taskCompleted: true,
      delays: true,
      weatherAlerts: true
    }
  };
}

/**
 * Validate configuration data
 */
private validateConfigData(config: RoutePlanningConfiguration): { isValid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate working hours
  if (!this.isValidTimeFormat(config.workingHours.start)) {
    errors.push('Invalid working hours start time format (use HH:MM)');
  }
  if (!this.isValidTimeFormat(config.workingHours.end)) {
    errors.push('Invalid working hours end time format (use HH:MM)');
  }

  // Validate numeric values
  if (config.defaultOptimizationParams.maxRouteTime <= 0) {
    errors.push('Maximum route time must be greater than 0');
  }
  if (config.defaultOptimizationParams.maxStopsPerRoute <= 0) {
    errors.push('Maximum stops per route must be greater than 0');
  }
  if (config.serviceRadius <= 0) {
    errors.push('Service radius must be greater than 0');
  }
  if (config.maxDailyTasksPerTeam <= 0) {
    errors.push('Maximum daily tasks per team must be greater than 0');
  }

  // Validate automatic optimization
  if (config.automaticOptimization.enabled) {
    if (!this.isValidTimeFormat(config.automaticOptimization.scheduleTime)) {
      errors.push('Invalid automatic optimization schedule time format (use HH:MM)');
    }
    if (config.automaticOptimization.advanceDays < 0) {
      errors.push('Advance days for optimization cannot be negative');
    }
  }

  // Warnings
  if (config.defaultOptimizationParams.maxRouteTime > 600) {
    warnings.push('Route time exceeds 10 hours - consider driver fatigue');
  }
  if (config.serviceRadius > 100) {
    warnings.push('Large service radius may result in long travel times');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate Google Maps integration
 */
private async validateGoogleMapsIntegration(googleMapsConfig: any): Promise<{ enabled: boolean; valid: boolean; errors?: string[] }> {
  if (!googleMapsConfig.enabled) {
    return { enabled: false, valid: true };
  }

  const errors: string[] = [];

  if (!googleMapsConfig.apiKey) {
    errors.push('API key is required when Google Maps is enabled');
  }

  // If you have GoogleMapsService, validate the API key
  try {
    if (googleMapsConfig.apiKey) {
      const validation = await this.googleMapsService.validateConfiguration(googleMapsConfig);
      if (!validation.isValid) {
        errors.push(...validation.errors);
      }
    }
  } catch (error) {
    errors.push(`API validation failed: ${error.message}`);
  }

  return {
    enabled: true,
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * Validate Weather integration
 */
private async validateWeatherIntegration(weatherConfig: any): Promise<{ enabled: boolean; valid: boolean; errors?: string[] }> {
  if (!weatherConfig.enabled) {
    return { enabled: false, valid: true };
  }

  const errors: string[] = [];

  // Validate delay thresholds
  if (weatherConfig.delayThresholds) {
    const thresholds = weatherConfig.delayThresholds;
    
    if (thresholds.rain !== undefined && thresholds.rain < 0) {
      errors.push('Rain delay threshold cannot be negative');
    }
    if (thresholds.snow !== undefined && thresholds.snow < 0) {
      errors.push('Snow delay threshold cannot be negative');
    }
    if (thresholds.wind !== undefined && thresholds.wind < 0) {
      errors.push('Wind delay threshold cannot be negative');
    }
    if (thresholds.temperature) {
      if (thresholds.temperature.min >= thresholds.temperature.max) {
        errors.push('Temperature minimum must be less than maximum');
      }
    }
  }

  return {
    enabled: true,
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * Validate time format (HH:MM)
 */
private isValidTimeFormat(time: string): boolean {
  if (!time || time.trim() === '') return true;
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}

/**
 * Get a specific team by ID with enhanced field operations data
 */
async getTeam(businessId: string, teamId: string): Promise<{
  team: EnhancedTeamResponse;
  stats: any;
  recentActivity: any[];
}> {
  try {
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    // Find team by PHP ID first, then by MongoDB ID as fallback
    let team = business.teams.find((t: any) => t.metadata?.phpId === teamId);
    if (!team) {
      team = business.teams.find((t: any) => t.id === teamId);
    }
    
    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Enhance team with full stats and data
    const enhancedTeam = this.enhanceTeamWithStats(team);

    this.logger.log(`Retrieved enhanced team ${team.id} (PHP ID: ${team.metadata?.phpId}) for business ${businessId}`);

    return {
      team: enhancedTeam,
      stats: enhancedTeam.stats,
      recentActivity: enhancedTeam.recentActivity
    };
  } catch (error) {
    this.logger.error(`Error getting team: ${error.message}`, error.stack);
    throw error;
  }
}

async updateFieldTeam(
  businessId: string,
  teamId: string,
  updateData: any
): Promise<{
  success: boolean;
  message: string;
  updatedTeam: any;
  changesApplied: string[];
  debugInfo: any;
}> {
  const debugInfo = {
    step: 'starting',
    businessId,
    teamId,
    updateDataKeys: Object.keys(updateData)
  };

  try {
    this.logger.log(`Starting field team update for business ${businessId}, team ${teamId}`);
    debugInfo.step = 'finding_business';

    const business = await this.businessModel.findById(businessId);
    debugInfo['businessFound'] = !!business;
    debugInfo['teamsCount'] = business?.teams?.length || 0;

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    debugInfo.step = 'finding_team';
    // Find team - check both PHP ID and MongoDB ID
    let teamIndex = business.teams.findIndex((t: any) => t.metadata?.phpId === teamId);
    if (teamIndex === -1) {
      teamIndex = business.teams.findIndex((t: any) => t.id === teamId);
    }
    
    debugInfo['teamIndex'] = teamIndex;
    debugInfo['searchedByPhpId'] = business.teams.some((t: any) => t.metadata?.phpId === teamId);
    debugInfo['searchedByMongoId'] = business.teams.some((t: any) => t.id === teamId);

    if (teamIndex === -1) {
      debugInfo['availableTeamIds'] = business.teams.map((t: any) => ({ id: t.id, phpId: t.metadata?.phpId }));
      throw new NotFoundException('Team not found');
    }

    debugInfo.step = 'building_update';
    const changesApplied: string[] = [];
    const updateOperations: any = {};

    // Only update what's actually provided
    if (updateData.name !== undefined && updateData.name.trim() !== '') {
      updateOperations[`teams.${teamIndex}.name`] = updateData.name;
      changesApplied.push('name');
    }

    if (updateData.currentLocation !== undefined) {
      const locationUpdate: any = {};
      if (updateData.currentLocation.lat !== undefined) locationUpdate.lat = updateData.currentLocation.lat;
      if (updateData.currentLocation.lng !== undefined) locationUpdate.lng = updateData.currentLocation.lng;
      if (updateData.currentLocation.accuracy !== undefined) locationUpdate.accuracy = updateData.currentLocation.accuracy;
      if (updateData.currentLocation.isManualUpdate !== undefined) locationUpdate.isManualUpdate = updateData.currentLocation.isManualUpdate;
      locationUpdate.timestamp = new Date();
      
      updateOperations[`teams.${teamIndex}.currentLocation`] = locationUpdate;
      updateOperations[`teams.${teamIndex}.lastLocationUpdate`] = new Date();
      changesApplied.push('location');
    }

    if (updateData.workingHours !== undefined) {
      const workingHoursUpdate: any = {};
      if (updateData.workingHours.start !== undefined) workingHoursUpdate.start = updateData.workingHours.start;
      if (updateData.workingHours.end !== undefined) workingHoursUpdate.end = updateData.workingHours.end;
      if (updateData.workingHours.timezone !== undefined) workingHoursUpdate.timezone = updateData.workingHours.timezone;
      if (updateData.workingHours.breakDuration !== undefined) workingHoursUpdate.breakDuration = updateData.workingHours.breakDuration;
      
      if (updateData.workingHours.lunchBreak !== undefined) {
        workingHoursUpdate.lunchBreak = {};
        if (updateData.workingHours.lunchBreak.start !== undefined) workingHoursUpdate.lunchBreak.start = updateData.workingHours.lunchBreak.start;
        if (updateData.workingHours.lunchBreak.end !== undefined) workingHoursUpdate.lunchBreak.end = updateData.workingHours.lunchBreak.end;
      }
      
      updateOperations[`teams.${teamIndex}.workingHours`] = workingHoursUpdate;
      changesApplied.push('working hours');
    }

    if (updateData.vehicleInfo !== undefined) {
      const vehicleUpdate: any = {};
      if (updateData.vehicleInfo.type !== undefined) vehicleUpdate.type = updateData.vehicleInfo.type;
      if (updateData.vehicleInfo.licensePlate !== undefined) vehicleUpdate.licensePlate = updateData.vehicleInfo.licensePlate;
      if (updateData.vehicleInfo.capacity !== undefined) vehicleUpdate.capacity = updateData.vehicleInfo.capacity;
      if (updateData.vehicleInfo.fuelType !== undefined) vehicleUpdate.fuelType = updateData.vehicleInfo.fuelType;
      if (updateData.vehicleInfo.avgFuelConsumption !== undefined) vehicleUpdate.avgFuelConsumption = updateData.vehicleInfo.avgFuelConsumption;
      if (updateData.vehicleInfo.maxRange !== undefined) vehicleUpdate.maxRange = updateData.vehicleInfo.maxRange;
      if (updateData.vehicleInfo.currentFuelLevel !== undefined) vehicleUpdate.currentFuelLevel = updateData.vehicleInfo.currentFuelLevel;
      if (updateData.vehicleInfo.maintenanceStatus !== undefined) vehicleUpdate.maintenanceStatus = updateData.vehicleInfo.maintenanceStatus;
      if (updateData.vehicleInfo.gpsEnabled !== undefined) vehicleUpdate.gpsEnabled = updateData.vehicleInfo.gpsEnabled;
      
      updateOperations[`teams.${teamIndex}.vehicleInfo`] = vehicleUpdate;
      changesApplied.push('vehicle information');
    }

    if (updateData.serviceAreas !== undefined) {
      updateOperations[`teams.${teamIndex}.serviceAreas`] = updateData.serviceAreas;
      changesApplied.push('service areas');
    }

    if (updateData.skills !== undefined) {
      updateOperations[`teams.${teamIndex}.skills`] = updateData.skills;
      changesApplied.push('skills');
    }

    if (updateData.equipment !== undefined) {
      updateOperations[`teams.${teamIndex}.equipment`] = updateData.equipment;
      changesApplied.push('equipment');
    }

    if (updateData.certifications !== undefined) {
      updateOperations[`teams.${teamIndex}.certifications`] = updateData.certifications;
      changesApplied.push('certifications');
    }

    if (updateData.isActive !== undefined) {
      updateOperations[`teams.${teamIndex}.isActive`] = updateData.isActive;
      changesApplied.push('active status');
    }

    if (updateData.isAvailableForRouting !== undefined) {
      updateOperations[`teams.${teamIndex}.isAvailableForRouting`] = updateData.isAvailableForRouting;
      changesApplied.push('routing availability');
    }

    if (updateData.maxDailyTasks !== undefined) {
      updateOperations[`teams.${teamIndex}.maxDailyTasks`] = updateData.maxDailyTasks;
      changesApplied.push('max daily tasks');
    }

    if (updateData.maxRouteDistance !== undefined) {
      updateOperations[`teams.${teamIndex}.maxRouteDistance`] = updateData.maxRouteDistance;
      changesApplied.push('max route distance');
    }

    if (updateData.performanceMetrics !== undefined) {
      const performanceUpdate: any = {};
      if (updateData.performanceMetrics.averageTasksPerDay !== undefined) performanceUpdate.averageTasksPerDay = updateData.performanceMetrics.averageTasksPerDay;
      if (updateData.performanceMetrics.onTimePerformance !== undefined) performanceUpdate.onTimePerformance = updateData.performanceMetrics.onTimePerformance;
      if (updateData.performanceMetrics.customerRating !== undefined) performanceUpdate.customerRating = updateData.performanceMetrics.customerRating;
      if (updateData.performanceMetrics.fuelEfficiency !== undefined) performanceUpdate.fuelEfficiency = updateData.performanceMetrics.fuelEfficiency;
      performanceUpdate.lastPerformanceUpdate = new Date();
      
      updateOperations[`teams.${teamIndex}.performanceMetrics`] = performanceUpdate;
      changesApplied.push('performance metrics');
    }

    if (updateData.emergencyContact !== undefined) {
      const emergencyUpdate: any = {};
      if (updateData.emergencyContact.name !== undefined) emergencyUpdate.name = updateData.emergencyContact.name;
      if (updateData.emergencyContact.phone !== undefined) emergencyUpdate.phone = updateData.emergencyContact.phone;
      if (updateData.emergencyContact.relationship !== undefined) emergencyUpdate.relationship = updateData.emergencyContact.relationship;
      
      updateOperations[`teams.${teamIndex}.emergencyContact`] = emergencyUpdate;
      changesApplied.push('emergency contact');
    }

    // Always update timestamp
    updateOperations[`teams.${teamIndex}.updatedAt`] = new Date();

    debugInfo.step = 'executing_update';
    debugInfo['updateOperationsCount'] = Object.keys(updateOperations).length;
    debugInfo['changesApplied'] = changesApplied;

    this.logger.log(`Applying ${Object.keys(updateOperations).length} field updates`);
    this.logger.log(`Update operations:`, JSON.stringify(updateOperations, null, 2));

    // Use direct MongoDB update to bypass Mongoose validation issues
    const result = await this.businessModel.collection.updateOne(
      { _id: new Types.ObjectId(businessId) },
      { $set: updateOperations }
    );

    debugInfo['mongoResult'] = {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      acknowledged: result.acknowledged
    };

    if (result.matchedCount === 0) {
      throw new Error('Business not found during update');
    }

    debugInfo.step = 'fetching_updated_data';
    this.logger.log(`MongoDB update result: matched=${result.matchedCount}, modified=${result.modifiedCount}`);
    this.logger.log(`Successfully updated field team ${teamId} - Changes: ${changesApplied.join(', ')}`);

    // Get the updated team for response
    const updatedBusiness = await this.businessModel.findById(businessId);
    const updatedTeam = updatedBusiness.teams[teamIndex];
    const enhancedTeam = this.enhanceTeamWithStats(updatedTeam);

    debugInfo.step = 'completed';

    return {
      success: true,
      message: `Field team updated successfully. ${changesApplied.length} changes applied.`,
      updatedTeam: enhancedTeam,
      changesApplied,
      debugInfo
    };

  } catch (error) {
    debugInfo['error'] = {
      step: debugInfo.step,
      message: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 3)
    };
    this.logger.error(`Error at step ${debugInfo.step}:`, error);
    this.logger.error(`Debug info:`, debugInfo);
    throw error;
  }
}

private enhanceTeamWithStats(team: any): EnhancedTeamResponse {
  try {
    // Use _doc if it's a Mongoose document, otherwise use the object directly
    const teamData = team._doc || team;
    
    const totalTasks = this.calculateTotalTasks(teamData);
    const completedTasks = this.calculateCompletedTasks(teamData);
    const totalDistance = this.calculateTotalDistance(teamData);
    const fuelConsumption = this.calculateFuelConsumption(teamData);
    const activeHours = this.calculateActiveHours(teamData);
    const serviceAreaCoverage = this.calculateServiceAreaCoverage(teamData);
    const equipmentUtilization = this.calculateEquipmentUtilization(teamData);
    const recentActivity = this.getRecentActivity(teamData);

    // Return clean enhanced team data
    return {
      id: teamData.id,
      name: teamData.name,
      metadata: teamData.metadata,
      createdAt: teamData.createdAt,
      updatedAt: teamData.updatedAt,
      _id: teamData._id,
      
      // Enhanced fields with defaults
      currentLocation: teamData.currentLocation || { lat: 0, lng: 0, accuracy: 0, isManualUpdate: false, timestamp: new Date() },
      workingHours: teamData.workingHours || { start: '', end: '', timezone: '', breakDuration: null, lunchBreak: { start: '', end: '' } },
      vehicleInfo: teamData.vehicleInfo || { type: '', licensePlate: '', capacity: null, fuelType: 'gasoline', avgFuelConsumption: null, maxRange: null, currentFuelLevel: null, maintenanceStatus: 'good', gpsEnabled: false },
      serviceAreas: teamData.serviceAreas || [],
      skills: teamData.skills || [],
      equipment: teamData.equipment || [],
      certifications: teamData.certifications || [],
      isActive: teamData.isActive ?? false,
      isAvailableForRouting: teamData.isAvailableForRouting ?? false,
      maxDailyTasks: teamData.maxDailyTasks || 8,
      maxRouteDistance: teamData.maxRouteDistance || 200,
      performanceMetrics: teamData.performanceMetrics || { averageTasksPerDay: 0, onTimePerformance: 0, customerRating: 0, fuelEfficiency: 0, lastPerformanceUpdate: new Date() },
      emergencyContact: teamData.emergencyContact || { name: '', phone: '', relationship: '' },
      lastLocationUpdate: teamData.lastLocationUpdate,
      
      stats: {
        totalTasks,
        completedTasks,
        onTimePerformance: teamData.performanceMetrics?.onTimePerformance || 0,
        averageRating: teamData.performanceMetrics?.customerRating || 0,
        totalDistanceTraveled: totalDistance,
        fuelConsumption,
        activeHours,
        lastActivityDate: teamData.updatedAt || teamData.createdAt,
        serviceAreaCoverage,
        equipmentUtilization
      },
      recentActivity
    };
  } catch (error) {
    this.logger.error(`Error enhancing team: ${error.message}`);
    throw error;
  }
}
// ============================================================================
// IMPROVED PRIVATE HELPER METHODS FOR TEAM STATS
// ============================================================================

private calculateTotalTasks(team: any): number {
  // Use actual performance data if available, otherwise return 0
  if (team.performanceMetrics?.tasksCompleted) {
    return team.performanceMetrics.tasksCompleted;
  }
  
  // If we have average per day and a creation date, calculate based on actual time
  if (team.performanceMetrics?.averageTasksPerDay && team.createdAt) {
    const creationDate = new Date(team.createdAt);
    const now = new Date();
    const daysSinceCreation = Math.floor((now.getTime() - creationDate.getTime()) / (1000 * 60 * 60 * 24));
    const workingDays = Math.floor(daysSinceCreation * 0.71); // ~5 working days per week
    return Math.max(0, Math.floor(team.performanceMetrics.averageTasksPerDay * workingDays));
  }
  
  return 0; // No data available
}

private calculateCompletedTasks(team: any): number {
  // Use actual completion data if available
  if (team.performanceMetrics?.tasksOnTime) {
    return team.performanceMetrics.tasksOnTime;
  }
  
  // Calculate based on total tasks and completion rate
  const totalTasks = this.calculateTotalTasks(team);
  if (totalTasks === 0) return 0;
  
  const completionRate = team.performanceMetrics?.onTimePerformance || 0;
  return Math.floor(totalTasks * (completionRate / 100));
}

private calculateTotalDistance(team: any): number {
  // Check if we have actual distance tracking data
  if (team.performanceMetrics?.totalDistanceTraveled) {
    return team.performanceMetrics.totalDistanceTraveled;
  }
  
  // If we have route history or location updates, use that
  if (team.routeHistory && Array.isArray(team.routeHistory)) {
    return team.routeHistory.reduce((total: number, route: any) => {
      return total + (route.distance || 0);
    }, 0);
  }
  
  // Estimate based on team activity and working pattern
  if (team.maxRouteDistance && team.createdAt && team.isActive) {
    const creationDate = new Date(team.createdAt);
    const now = new Date();
    const daysSinceCreation = Math.floor((now.getTime() - creationDate.getTime()) / (1000 * 60 * 60 * 24));
    const workingDays = Math.floor(daysSinceCreation * 0.71); // ~5 working days per week
    
    // Estimate based on max route distance with realistic utilization
    const estimatedDailyDistance = team.maxRouteDistance * 0.4; // 40% utilization seems reasonable
    return Math.max(0, estimatedDailyDistance * workingDays);
  }
  
  return 0; // No data to calculate from
}

private calculateFuelConsumption(team: any): number {
  // Use actual fuel consumption data if tracked
  if (team.performanceMetrics?.totalFuelConsumed) {
    return team.performanceMetrics.totalFuelConsumed;
  }
  
  // Calculate based on actual distance and vehicle specs
  const totalDistance = this.calculateTotalDistance(team);
  if (totalDistance === 0 || !team.vehicleInfo?.avgFuelConsumption) {
    return 0;
  }
  
  // Calculate fuel consumption: (distance / 100) * consumption rate
  const fuelConsumed = (totalDistance / 100) * team.vehicleInfo.avgFuelConsumption;
  return Math.round(fuelConsumed * 100) / 100; // Round to 2 decimal places
}

private calculateActiveHours(team: any): number {
  // Use actual tracked hours if available
  if (team.performanceMetrics?.totalActiveHours) {
    return team.performanceMetrics.totalActiveHours;
  }
  
  // Calculate based on actual working pattern
  if (!team.workingHours || !team.createdAt) {
    return 0;
  }
  
  try {
    const [startHour, startMin] = team.workingHours.start.split(':').map(Number);
    const [endHour, endMin] = team.workingHours.end.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    let dailyMinutes = endMinutes - startMinutes;
    
    // Handle overnight shifts
    if (dailyMinutes < 0) {
      dailyMinutes += 24 * 60;
    }
    
    // Subtract break time
    const breakMinutes = team.workingHours.breakDuration || 0;
    const lunchMinutes = team.workingHours.lunchBreak ? 
      this.calculateLunchDuration(team.workingHours.lunchBreak) : 0;
    
    const effectiveDailyMinutes = Math.max(0, dailyMinutes - breakMinutes - lunchMinutes);
    const dailyHours = effectiveDailyMinutes / 60;
    
    // Calculate working days since creation
    const creationDate = new Date(team.createdAt);
    const now = new Date();
    const daysSinceCreation = Math.floor((now.getTime() - creationDate.getTime()) / (1000 * 60 * 60 * 24));
    const workingDays = Math.floor(daysSinceCreation * 0.71); // ~5 working days per week
    
    return Math.max(0, dailyHours * workingDays);
  } catch (error) {
    this.logger.warn(`Error calculating active hours for team: ${error.message}`);
    return 0;
  }
}

private calculateLunchDuration(lunchBreak: any): number {
  if (!lunchBreak?.start || !lunchBreak?.end) return 0;
  
  try {
    const [startHour, startMin] = lunchBreak.start.split(':').map(Number);
    const [endHour, endMin] = lunchBreak.end.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    return Math.max(0, endMinutes - startMinutes);
  } catch (error) {
    return 0;
  }
}

private calculateServiceAreaCoverage(team: any): number {
  // Use actual coverage data if tracked
  if (team.performanceMetrics?.serviceCoverage) {
    return team.performanceMetrics.serviceCoverage;
  }
  
  if (!team.serviceAreas || team.serviceAreas.length === 0) {
    return 0;
  }
  
  let totalCoverage = 0;
  
  for (const area of team.serviceAreas) {
    try {
      if (area.type === 'circle' && area.radius && area.radius > 0) {
        // Calculate actual circle area in km²
        const radiusKm = area.radius / 1000; // Convert meters to km
        const areaKm2 = Math.PI * Math.pow(radiusKm, 2);
        totalCoverage += areaKm2;
      } else if (area.type === 'polygon' && area.coordinates && area.coordinates.length >= 3) {
        // Use Shoelace formula for polygon area calculation
        const areaKm2 = this.calculatePolygonArea(area.coordinates);
        totalCoverage += areaKm2;
      }
    } catch (error) {
      this.logger.warn(`Error calculating service area coverage: ${error.message}`);
    }
  }
  
  return Math.round(totalCoverage * 100) / 100; // Round to 2 decimal places
}

private calculatePolygonArea(coordinates: Array<{ lat: number; lng: number }>): number {
  if (coordinates.length < 3) return 0;
  
  // Shoelace formula for polygon area
  // Note: This is a simplified calculation that assumes small areas where lat/lng can be treated as planar
  let area = 0;
  const n = coordinates.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coordinates[i].lat * coordinates[j].lng;
    area -= coordinates[j].lat * coordinates[i].lng;
  }
  
  // Convert to approximate km² (very rough approximation)
  // For accurate results, you'd use proper geodesic calculations
  const approximateKm2 = Math.abs(area) * 12321; // Rough conversion factor
  return approximateKm2;
}

private calculateEquipmentUtilization(team: any): number {
  // Use actual utilization data if tracked
  if (team.performanceMetrics?.equipmentUtilization) {
    return team.performanceMetrics.equipmentUtilization;
  }
  
  // Calculate based on equipment usage and team activity
  const equipmentCount = team.equipment?.length || 0;
  if (equipmentCount === 0) return 0;
  
  // Factor in team activity level
  const activityFactor = team.isActive ? 1 : 0.1;
  const routingFactor = team.isAvailableForRouting ? 1 : 0.5;
  const performanceFactor = (team.performanceMetrics?.onTimePerformance || 0) / 100;
  
  // Calculate utilization as a percentage
  const baseUtilization = Math.min(100, equipmentCount * 15); // Base 15% per equipment item
  const adjustedUtilization = baseUtilization * activityFactor * routingFactor * performanceFactor;
  
  return Math.round(adjustedUtilization);
}

private getRecentActivity(team: any): Array<{
  date: Date;
  type: 'task_completed' | 'location_update' | 'status_change' | 'maintenance';
  description: string;
  metadata?: any;
}> {
  const activities: Array<{
    date: Date;
    type: 'task_completed' | 'location_update' | 'status_change' | 'maintenance';
    description: string;
    metadata?: any;
  }> = [];
  
  // Use actual activity log if available
  if (team.activityLog && Array.isArray(team.activityLog)) {
    return team.activityLog
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10)
      .map((activity: any) => ({
        date: new Date(activity.timestamp),
        type: activity.type,
        description: activity.description,
        metadata: activity.metadata
      }));
  }
  
  // Generate activities from available data
  if (team.lastLocationUpdate) {
    activities.push({
      date: new Date(team.lastLocationUpdate),
      type: 'location_update',
      description: team.currentLocation ? 
        `Location updated to ${team.currentLocation.lat.toFixed(4)}, ${team.currentLocation.lng.toFixed(4)}` :
        'Location updated',
      metadata: { coordinates: team.currentLocation }
    });
  }
  
  if (team.performanceMetrics?.lastPerformanceUpdate) {
    activities.push({
      date: new Date(team.performanceMetrics.lastPerformanceUpdate),
      type: 'task_completed',
      description: `Performance metrics updated - ${team.performanceMetrics.customerRating}/5 rating`,
      metadata: { 
        rating: team.performanceMetrics.customerRating,
        onTimePerformance: team.performanceMetrics.onTimePerformance
      }
    });
  }
  
  if (team.updatedAt) {
    activities.push({
      date: new Date(team.updatedAt),
      type: 'status_change',
      description: `Team configuration updated`,
      metadata: { 
        isActive: team.isActive,
        isAvailableForRouting: team.isAvailableForRouting
      }
    });
  }
  
  if (team.vehicleInfo?.maintenanceStatus && team.vehicleInfo.maintenanceStatus !== 'good') {
    // Estimate maintenance activity date (if not available)
    const maintenanceDate = team.vehicleInfo.lastMaintenanceDate ? 
      new Date(team.vehicleInfo.lastMaintenanceDate) : 
      new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000); // Random within last week
      
    activities.push({
      date: maintenanceDate,
      type: 'maintenance',
      description: `Vehicle maintenance: ${team.vehicleInfo.maintenanceStatus.replace('_', ' ')}`,
      metadata: { 
        vehicleType: team.vehicleInfo.type,
        maintenanceStatus: team.vehicleInfo.maintenanceStatus
      }
    });
  }
  
  if (team.createdAt) {
    activities.push({
      date: new Date(team.createdAt),
      type: 'status_change',
      description: 'Team created and configured for field operations',
      metadata: { teamName: team.name }
    });
  }
  
  // Sort by date (most recent first) and limit to 10
  return activities
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 10);
}

}