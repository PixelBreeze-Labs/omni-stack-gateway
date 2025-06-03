// src/services/business-general.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class BusinessGeneralService {
  private readonly logger = new Logger(BusinessGeneralService.name);

  constructor(
    @InjectModel(StaffProfile.name) private staffProfileModel: Model<StaffProfile>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(User.name) private userModel: Model<User>,
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
}