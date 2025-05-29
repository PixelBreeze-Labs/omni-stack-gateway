// src/services/business-general.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StaffProfile } from '../schemas/staff-profile.schema';
import { Business } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import {
  SimpleStaffProfileResponse,
  FullStaffProfileResponse,
} from '../dtos/business-general.dto';

@Injectable()
export class BusinessGeneralService {
  private readonly logger = new Logger(BusinessGeneralService.name);

  constructor(
    @InjectModel(StaffProfile.name) private staffProfileModel: Model<StaffProfile>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(User.name) private userModel: Model<User>,
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