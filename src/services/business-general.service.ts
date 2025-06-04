// src/services/business-general.service.ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StaffProfile } from '../schemas/staff-profile.schema';
import { Business, EnhancedTeam } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import {
  SimpleStaffProfileResponse,
  FullStaffProfileResponse,
} from '../dtos/business-general.dto';
import { StaffluentEmployeeService } from './staffluent-employee.service';
import { StaffluentTaskService } from './staffluent-task.service';
import { GoogleMapsService } from './google-maps.service';
import { RoutePlanningConfiguration } from '../schemas/business.schema';


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
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}

/**
 * Get a single team with all enhanced data and stats
 */
async getTeam(
  businessId: string,
  teamId: string
): Promise<{
  team: EnhancedTeam;
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
}> {
  try {
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    // Find team by ID
    const team = business.teams.find((t: any) => t.id === teamId);
    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Calculate stats (you can enhance these calculations based on your actual data)
    const stats = {
      totalTasks: this.calculateTotalTasks(team),
      completedTasks: this.calculateCompletedTasks(team),
      onTimePerformance: team.performanceMetrics?.onTimePerformance || 0,
      averageRating: team.performanceMetrics?.customerRating || 0,
      totalDistanceTraveled: this.calculateTotalDistance(team),
      fuelConsumption: this.calculateFuelConsumption(team),
      activeHours: this.calculateActiveHours(team),
      lastActivityDate: team.lastLocationUpdate || team.updatedAt || new Date(),
      serviceAreaCoverage: this.calculateServiceAreaCoverage(team),
      equipmentUtilization: this.calculateEquipmentUtilization(team)
    };

    // Get recent activity (mock data - replace with actual activity tracking)
    const recentActivity = this.getRecentActivity(team);

    this.logger.log(`Retrieved team ${teamId} for business ${businessId}`);

    return {
      team: team as EnhancedTeam,
      stats,
      recentActivity
    };
  } catch (error) {
    this.logger.error(`Error getting team: ${error.message}`, error.stack);
    throw error;
  }
}

/**
 * Update field team with all enhanced values
 */
async updateFieldTeam(
  businessId: string,
  teamId: string,
  updateData: {
    name?: string;
    
    // Location and tracking
    currentLocation?: {
      lat: number;
      lng: number;
      timestamp?: Date;
      accuracy?: number;
      isManualUpdate?: boolean;
    };
    
    // Working schedule
    workingHours?: {
      start: string; // HH:MM
      end: string;   // HH:MM
      timezone: string;
      breakDuration?: number;
      lunchBreak?: {
        start: string;
        end: string;
      };
    };
    
    // Vehicle information
    vehicleInfo?: {
      type: string;
      licensePlate?: string;
      capacity: number;
      fuelType: 'gasoline' | 'diesel' | 'electric' | 'hybrid';
      avgFuelConsumption: number;
      maxRange: number;
      currentFuelLevel?: number;
      maintenanceStatus: 'good' | 'needs_service' | 'out_of_service';
      gpsEnabled: boolean;
    };
    
    // Service capabilities
    serviceAreas?: Array<{
      name: string;
      type: 'circle' | 'polygon';
      coordinates: Array<{ lat: number; lng: number }>;
      radius?: number;
      priority: number;
    }>;
    
    skills?: string[];
    equipment?: string[];
    certifications?: string[];
    
    // Team status
    isActive?: boolean;
    isAvailableForRouting?: boolean;
    maxDailyTasks?: number;
    maxRouteDistance?: number;
    
    // Performance metrics
    performanceMetrics?: {
      averageTasksPerDay?: number;
      onTimePerformance?: number;
      customerRating?: number;
      fuelEfficiency?: number;
      lastPerformanceUpdate?: Date;
    };
    
    // Emergency contact
    emergencyContact?: {
      name: string;
      phone: string;
      relationship: string;
    };
    
    metadata?: any;
  }
): Promise<{
  success: boolean;
  message: string;
  updatedTeam: EnhancedTeam;
  changesApplied: string[];
}> {
  try {
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    // Find team by ID
    const teamIndex = business.teams.findIndex((t: any) => t.id === teamId);
    if (teamIndex === -1) {
      throw new NotFoundException('Team not found');
    }

    const team = business.teams[teamIndex] as any;
    const changesApplied: string[] = [];

    // Validate and apply updates
    if (updateData.name !== undefined) {
      // Check for name conflicts
      const nameConflict = business.teams.find(
        (t: any, index: number) => 
          index !== teamIndex && 
          t.name.toLowerCase() === updateData.name.toLowerCase()
      );
      
      if (nameConflict) {
        throw new Error('Team with this name already exists');
      }
      
      team.name = updateData.name;
      changesApplied.push('name');
    }

    // Update location
    if (updateData.currentLocation) {
      team.currentLocation = {
        ...team.currentLocation,
        ...updateData.currentLocation,
        timestamp: updateData.currentLocation.timestamp || new Date()
      };
      team.lastLocationUpdate = new Date();
      changesApplied.push('location');
    }

    // Update working hours
    if (updateData.workingHours) {
      // Validate time format
      if (!this.isValidTimeFormat(updateData.workingHours.start) || 
          !this.isValidTimeFormat(updateData.workingHours.end)) {
        throw new BadRequestException('Invalid time format. Use HH:MM format');
      }
      
      team.workingHours = {
        ...team.workingHours,
        ...updateData.workingHours
      };
      changesApplied.push('working hours');
    }

    // Update vehicle info
    if (updateData.vehicleInfo) {
      // Validate vehicle data
      if (updateData.vehicleInfo.capacity <= 0) {
        throw new BadRequestException('Vehicle capacity must be greater than 0');
      }
      if (updateData.vehicleInfo.avgFuelConsumption <= 0) {
        throw new BadRequestException('Average fuel consumption must be greater than 0');
      }
      if (updateData.vehicleInfo.maxRange <= 0) {
        throw new BadRequestException('Maximum range must be greater than 0');
      }
      if (updateData.vehicleInfo.currentFuelLevel !== undefined && 
          (updateData.vehicleInfo.currentFuelLevel < 0 || updateData.vehicleInfo.currentFuelLevel > 100)) {
        throw new BadRequestException('Current fuel level must be between 0 and 100');
      }

      team.vehicleInfo = {
        ...team.vehicleInfo,
        ...updateData.vehicleInfo
      };
      changesApplied.push('vehicle information');
    }

    // Update service areas
    if (updateData.serviceAreas) {
      // Validate service areas
      for (const area of updateData.serviceAreas) {
        if (area.type === 'circle' && !area.radius) {
          throw new BadRequestException('Circle service areas must have a radius');
        }
        if (area.type === 'polygon' && (!area.coordinates || area.coordinates.length < 3)) {
          throw new BadRequestException('Polygon service areas must have at least 3 coordinates');
        }
        if (area.priority < 1 || area.priority > 5) {
          throw new BadRequestException('Service area priority must be between 1 and 5');
        }
      }

      team.serviceAreas = updateData.serviceAreas;
      changesApplied.push('service areas');
    }

    // Update skills, equipment, certifications
    if (updateData.skills !== undefined) {
      team.skills = updateData.skills;
      changesApplied.push('skills');
    }
    if (updateData.equipment !== undefined) {
      team.equipment = updateData.equipment;
      changesApplied.push('equipment');
    }
    if (updateData.certifications !== undefined) {
      team.certifications = updateData.certifications;
      changesApplied.push('certifications');
    }

    // Update team status
    if (updateData.isActive !== undefined) {
      team.isActive = updateData.isActive;
      changesApplied.push('active status');
    }
    if (updateData.isAvailableForRouting !== undefined) {
      team.isAvailableForRouting = updateData.isAvailableForRouting;
      changesApplied.push('routing availability');
    }
    if (updateData.maxDailyTasks !== undefined) {
      if (updateData.maxDailyTasks <= 0) {
        throw new BadRequestException('Maximum daily tasks must be greater than 0');
      }
      team.maxDailyTasks = updateData.maxDailyTasks;
      changesApplied.push('max daily tasks');
    }
    if (updateData.maxRouteDistance !== undefined) {
      if (updateData.maxRouteDistance <= 0) {
        throw new BadRequestException('Maximum route distance must be greater than 0');
      }
      team.maxRouteDistance = updateData.maxRouteDistance;
      changesApplied.push('max route distance');
    }

    // Update performance metrics
    if (updateData.performanceMetrics) {
      team.performanceMetrics = {
        ...team.performanceMetrics,
        ...updateData.performanceMetrics,
        lastPerformanceUpdate: updateData.performanceMetrics.lastPerformanceUpdate || new Date()
      };
      changesApplied.push('performance metrics');
    }

    // Update emergency contact
    if (updateData.emergencyContact) {
      team.emergencyContact = updateData.emergencyContact;
      changesApplied.push('emergency contact');
    }

    // Update metadata
    if (updateData.metadata !== undefined) {
      team.metadata = { ...team.metadata, ...updateData.metadata };
      changesApplied.push('metadata');
    }

    // Always update the timestamp
    team.updatedAt = new Date();

    // Mark the teams array as modified for Mongoose
    business.markModified('teams');
    await business.save();

    this.logger.log(`Updated field team ${teamId} for business ${businessId}. Changes: ${changesApplied.join(', ')}`);

    return {
      success: true,
      message: `Field team updated successfully. ${changesApplied.length} changes applied.`,
      updatedTeam: team as EnhancedTeam,
      changesApplied
    };
  } catch (error) {
    this.logger.error(`Error updating field team: ${error.message}`, error.stack);
    throw error;
  }
}

// ============================================================================
// PRIVATE HELPER METHODS FOR TEAM STATS
// ============================================================================

private calculateTotalTasks(team: any): number {
  // This would typically query your task/job database
  // For now, return a calculated value based on performance metrics
  return team.performanceMetrics?.averageTasksPerDay ? 
    Math.floor(team.performanceMetrics.averageTasksPerDay * 30) : 0;
}

private calculateCompletedTasks(team: any): number {
  // Calculate based on total tasks and performance
  const totalTasks = this.calculateTotalTasks(team);
  const completionRate = team.performanceMetrics?.onTimePerformance || 100;
  return Math.floor(totalTasks * (completionRate / 100));
}

private calculateTotalDistance(team: any): number {
  // This would typically be calculated from actual route data
  // For now, estimate based on max route distance and activity
  const maxDaily = team.maxRouteDistance || 200;
  const activeDays = 20; // Assume 20 working days per month
  return maxDaily * activeDays * 0.7; // 70% utilization
}

private calculateFuelConsumption(team: any): number {
  // Calculate based on distance and vehicle efficiency
  const totalDistance = this.calculateTotalDistance(team);
  const consumption = team.vehicleInfo?.avgFuelConsumption || 8; // L/100km
  return Math.round((totalDistance / 100) * consumption);
}

private calculateActiveHours(team: any): number {
  // Calculate based on working hours and activity
  const workingHours = team.workingHours;
  if (!workingHours) return 0;
  
  const startHour = parseInt(workingHours.start.split(':')[0]);
  const endHour = parseInt(workingHours.end.split(':')[0]);
  const dailyHours = endHour - startHour;
  const activeDays = 20; // Working days per month
  
  return dailyHours * activeDays;
}

private calculateServiceAreaCoverage(team: any): number {
  // Calculate coverage based on service areas
  if (!team.serviceAreas || team.serviceAreas.length === 0) return 0;
  
  let totalCoverage = 0;
  for (const area of team.serviceAreas) {
    if (area.type === 'circle' && area.radius) {
      // Calculate circle area in km²
      totalCoverage += Math.PI * Math.pow(area.radius / 1000, 2);
    } else if (area.type === 'polygon' && area.coordinates) {
      // Rough polygon area calculation (simplified)
      totalCoverage += area.coordinates.length * 10; // Simplified calculation
    }
  }
  
  return Math.round(totalCoverage);
}

private calculateEquipmentUtilization(team: any): number {
  // Calculate based on equipment count and activity
  const equipmentCount = team.equipment?.length || 0;
  const utilizationRate = team.performanceMetrics?.onTimePerformance || 100;
  
  return Math.min(100, (equipmentCount * 10) + (utilizationRate * 0.5));
}

private getRecentActivity(team: any): Array<{
  date: Date;
  type: 'task_completed' | 'location_update' | 'status_change' | 'maintenance';
  description: string;
  metadata?: any;
}> {
  // This would typically query your activity/audit log database
  // For now, return mock recent activity
  const activities = [];
  const now = new Date();
  
  if (team.lastLocationUpdate) {
    activities.push({
      date: team.lastLocationUpdate,
      type: 'location_update' as const,
      description: 'Location updated',
      metadata: { coordinates: team.currentLocation }
    });
  }
  
  if (team.performanceMetrics?.lastPerformanceUpdate) {
    activities.push({
      date: team.performanceMetrics.lastPerformanceUpdate,
      type: 'task_completed' as const,
      description: 'Performance metrics updated',
      metadata: { rating: team.performanceMetrics.customerRating }
    });
  }
  
  if (team.updatedAt) {
    activities.push({
      date: team.updatedAt,
      type: 'status_change' as const,
      description: 'Team information updated',
      metadata: { isActive: team.isActive }
    });
  }
  
  // Sort by date (most recent first)
  return activities.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 10);
}

}