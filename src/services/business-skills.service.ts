// src/services/business-skills.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { 
  Business,
  BusinessSkillRequirement
} from '../schemas/business.schema';
import { 
  StaffProfile,
  SkillData,
  SkillLevel,
  SkillSource
} from '../schemas/staff-profile.schema';
import { 
  SkillAssessment,
  AssessmentStatus,
  AssessmentTrigger
} from '../schemas/skill-assessment.schema';
import {
  UpdateBusinessSkillConfigDto,
  BusinessSkillConfigResponse,
  PendingSkillAssessmentResponse,
  SkillAnalyticsResponse,
  ApproveSkillAssessmentDto,
  RejectSkillAssessmentDto,
  BulkSkillAssessmentActionDto,
  SkillAssessmentFilterDto,
  SkillAssessmentItemDto
} from '../dtos/business-skills.dto';

@Injectable()
export class BusinessSkillsService {
  private readonly logger = new Logger(BusinessSkillsService.name);

  constructor(
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(StaffProfile.name) private staffProfileModel: Model<StaffProfile>,
    @InjectModel(SkillAssessment.name) private skillAssessmentModel: Model<SkillAssessment>,
  ) {}

  // ============================================================================
  // SKILL CONFIGURATION MANAGEMENT
  // ============================================================================

  /**
   * Get business skill configuration
   */
  async getSkillConfiguration(businessId: string): Promise<BusinessSkillConfigResponse> {
    try {
      const business = await this.businessModel.findById(businessId);
      
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      return {
        businessId: business._id.toString(),
        name: business.name,
        industry: business.industry,
        subCategory: business.subCategory,
        skillRequirements: business.skillRequirements || [],
        customSkills: business.customSkills || [],
        autoInferSkills: business.autoInferSkills ?? true,
        requireSkillApproval: business.requireSkillApproval ?? true,
        skillsConfiguration: business.skillsConfiguration || {
          enablePerformanceTracking: true,
          enablePeerReviews: false,
          enableSelfAssessment: true,
          skillDecayMonths: 12,
          mandatorySkillsReview: false,
          reviewFrequencyMonths: 6
        },
        departments: business.departments || []
      };
    } catch (error) {
      this.logger.error(`Error getting skill configuration: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update business skill configuration
   */
  async updateSkillConfiguration(
    businessId: string, 
    updateDto: UpdateBusinessSkillConfigDto
  ): Promise<BusinessSkillConfigResponse> {
    try {
      const business = await this.businessModel.findById(businessId);
      
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      // Update business with new configuration
      const updatedBusiness = await this.businessModel.findByIdAndUpdate(
        businessId,
        {
          ...updateDto,
          updatedAt: new Date()
        },
        { new: true }
      );

      // If skill requirements changed, trigger re-assessment for affected employees
      if (updateDto.skillRequirements || updateDto.departments) {
        await this.triggerSkillReassessment(businessId, 'configuration_change');
      }

      return this.getSkillConfiguration(businessId);
    } catch (error) {
      this.logger.error(`Error updating skill configuration: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================================================
  // SKILL ASSESSMENT MANAGEMENT
  // ============================================================================

  /**
   * Get pending skill assessments with filtering and pagination
   */
  async getPendingSkillAssessments(
    businessId: string,
    filters: SkillAssessmentFilterDto
  ): Promise<{
    assessments: PendingSkillAssessmentResponse[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const query: any = { 
        businessId,
        status: filters.status || { $in: [AssessmentStatus.PENDING_REVIEW, AssessmentStatus.NEEDS_REVISION] }
      };

      if (filters.trigger) {
        query.trigger = filters.trigger;
      }

      // Build aggregation pipeline for filtering by employee attributes
      const pipeline: any[] = [
        { $match: query },
        {
          $lookup: {
            from: 'staffprofiles',
            localField: 'staffProfileId',
            foreignField: '_id',
            as: 'staffProfile'
          }
        },
        {
          $unwind: '$staffProfile'
        }
      ];

      // Add filters for department and role
      if (filters.department) {
        pipeline.push({
          $match: { 'staffProfile.department': filters.department }
        });
      }

      if (filters.role) {
        pipeline.push({
          $match: { 'staffProfile.role': filters.role }
        });
      }

      // Add sorting
      const sortField = filters.sortBy === 'employeeName' ? 'staffProfile.name' : filters.sortBy;
      const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;
      pipeline.push({
        $sort: { [sortField]: sortOrder }
      });

      // Add pagination
      pipeline.push(
        { $skip: filters.offset || 0 },
        { $limit: filters.limit || 50 }
      );

      const assessments = await this.skillAssessmentModel.aggregate(pipeline);
      
      // Get total count for pagination
      const totalPipeline = pipeline.slice(0, -2); // Remove skip and limit
      totalPipeline.push({ $count: "total" });
      const totalResult = await this.skillAssessmentModel.aggregate(totalPipeline);
      const total = totalResult[0]?.total || 0;

      const mappedAssessments: PendingSkillAssessmentResponse[] = assessments.map(assessment => {
        const daysPending = Math.floor(
          (new Date().getTime() - new Date(assessment.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
          id: assessment._id.toString(),
          employeeName: assessment.staffProfile.name,
          employeeEmail: assessment.staffProfile.email,
          employeeRole: assessment.staffProfile.role,
          employeeDepartment: assessment.staffProfile.department,
          trigger: assessment.trigger,
          status: assessment.status,
          proposedSkills: this.mapProposedSkills(assessment.proposedSkills),
          createdAt: assessment.createdAt,
          dueDate: assessment.dueDate,
          daysPending
        };
      });

      return {
        assessments: mappedAssessments,
        total,
        hasMore: (filters.offset || 0) + mappedAssessments.length < total
      };
    } catch (error) {
      this.logger.error(`Error getting pending assessments: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Approve skill assessment
   */
  async approveSkillAssessment(
    assessmentId: string,
    businessId: string,
    approveDto: ApproveSkillAssessmentDto,
    reviewerId: string
  ): Promise<SkillAssessment> {
    try {
      const assessment = await this.skillAssessmentModel.findOne({
        _id: assessmentId,
        businessId
      });

      if (!assessment) {
        throw new NotFoundException('Skill assessment not found');
      }

      // Create final skills object with approved skills
      const finalSkills: Record<string, any> = {};
      
      approveDto.approvedSkills.forEach(skillName => {
        if (assessment.proposedSkills[skillName]) {
          finalSkills[skillName] = {
            ...assessment.proposedSkills[skillName],
            verified: true,
            verifiedBy: reviewerId,
            verifiedAt: new Date()
          };
        }
      });

      // Record business adjustments for rejected skills
      const businessAdjustments = [];
      if (approveDto.rejectedSkills && approveDto.rejectedSkills.length > 0) {
        approveDto.rejectedSkills.forEach(skillName => {
          businessAdjustments.push({
            skillName,
            action: 'remove',
            reason: 'Rejected during approval process',
            adjustedBy: reviewerId,
            adjustedAt: new Date()
          });
        });
      }

      // Update assessment status
      const newStatus = approveDto.rejectedSkills && approveDto.rejectedSkills.length > 0
        ? AssessmentStatus.PARTIALLY_APPROVED
        : AssessmentStatus.APPROVED;

      const updatedAssessment = await this.skillAssessmentModel.findByIdAndUpdate(
        assessmentId,
        {
          status: newStatus,
          finalSkills,
          businessAdjustments,
          reviewNotes: approveDto.notes,
          reviewerId,
          reviewedAt: new Date(),
          approvedAt: newStatus === AssessmentStatus.APPROVED ? new Date() : undefined,
          $push: {
            workflowHistory: {
              action: 'approved',
              performedBy: reviewerId,
              performedAt: new Date(),
              notes: approveDto.notes,
              previousStatus: assessment.status,
              newStatus
            }
          }
        },
        { new: true }
      );

      // Apply approved skills to staff profile
      await this.applySkillsToStaffProfile(assessment.staffProfileId, finalSkills);

      this.logger.log(`Skill assessment ${assessmentId} approved by ${reviewerId}`);
      return updatedAssessment;
    } catch (error) {
      this.logger.error(`Error approving skill assessment: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Reject skill assessment
   */
  async rejectSkillAssessment(
    assessmentId: string,
    businessId: string,
    rejectDto: RejectSkillAssessmentDto,
    reviewerId: string
  ): Promise<SkillAssessment> {
    try {
      const assessment = await this.skillAssessmentModel.findOne({
        _id: assessmentId,
        businessId
      });

      if (!assessment) {
        throw new NotFoundException('Skill assessment not found');
      }

      const updatedAssessment = await this.skillAssessmentModel.findByIdAndUpdate(
        assessmentId,
        {
          status: AssessmentStatus.REJECTED,
          rejectionReason: rejectDto.reason,
          reviewerId,
          reviewedAt: new Date(),
          $push: {
            workflowHistory: {
              action: 'rejected',
              performedBy: reviewerId,
              performedAt: new Date(),
              notes: rejectDto.reason,
              previousStatus: assessment.status,
              newStatus: AssessmentStatus.REJECTED
            }
          }
        },
        { new: true }
      );

      this.logger.log(`Skill assessment ${assessmentId} rejected by ${reviewerId}`);
      return updatedAssessment;
    } catch (error) {
      this.logger.error(`Error rejecting skill assessment: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Bulk process skill assessments
   */
  async bulkProcessAssessments(
    businessId: string,
    bulkDto: BulkSkillAssessmentActionDto,
    reviewerId: string
  ): Promise<{
    processed: number;
    failed: number;
    results: { id: string; success: boolean; error?: string }[];
  }> {
    try {
      const results = [];
      let processed = 0;
      let failed = 0;

      for (const assessmentId of bulkDto.assessmentIds) {
        try {
          if (bulkDto.action === 'approve') {
            // For bulk approval, approve all proposed skills
            const assessment = await this.skillAssessmentModel.findOne({
              _id: assessmentId,
              businessId
            });

            if (assessment) {
              const approveDto: ApproveSkillAssessmentDto = {
                approvedSkills: Object.keys(assessment.proposedSkills),
                notes: bulkDto.notes
              };

              await this.approveSkillAssessment(assessmentId, businessId, approveDto, reviewerId);
            }
          } else {
            const rejectDto: RejectSkillAssessmentDto = {
              reason: bulkDto.notes || 'Bulk rejection'
            };

            await this.rejectSkillAssessment(assessmentId, businessId, rejectDto, reviewerId);
          }

          results.push({ id: assessmentId, success: true });
          processed++;
        } catch (error) {
          results.push({ id: assessmentId, success: false, error: error.message });
          failed++;
        }
      }

      this.logger.log(`Bulk processed ${processed} assessments, ${failed} failed`);
      
      return { processed, failed, results };
    } catch (error) {
      this.logger.error(`Error in bulk processing: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================================================
  // ANALYTICS AND REPORTING
  // ============================================================================

  /**
   * Get comprehensive skill analytics for business
   */
  async getSkillAnalytics(businessId: string): Promise<SkillAnalyticsResponse> {
    try {
      // Basic employee and assessment counts
      const [
        totalEmployees,
        pendingAssessments,
        completedAssessments,
        rejectedAssessments
      ] = await Promise.all([
        this.staffProfileModel.countDocuments({ businessId }),
        this.skillAssessmentModel.countDocuments({ 
          businessId, 
          status: AssessmentStatus.PENDING_REVIEW 
        }),
        this.skillAssessmentModel.countDocuments({ 
          businessId, 
          status: { $in: [AssessmentStatus.APPROVED, AssessmentStatus.PARTIALLY_APPROVED] }
        }),
        this.skillAssessmentModel.countDocuments({ 
          businessId, 
          status: AssessmentStatus.REJECTED 
        })
      ]);

      // Skill aggregations
      const skillAggregation = await this.staffProfileModel.aggregate([
        { $match: { businessId: businessId } },
        {
          $project: {
            skillsArray: { $objectToArray: '$skills' }
          }
        },
        { $unwind: '$skillsArray' },
        {
          $group: {
            _id: null,
            totalSkills: { $sum: 1 },
            uniqueSkills: { $addToSet: '$skillsArray.k' },
            skillCounts: {
              $push: {
                skill: '$skillsArray.k',
                level: '$skillsArray.v.level'
              }
            }
          }
        }
      ]);

      // Calculate top skills and skill level distribution
      const topSkills: Record<string, number> = {};
      const skillLevelDistribution = {
        novice: 0,
        intermediate: 0,
        advanced: 0,
        expert: 0
      };

      if (skillAggregation.length > 0) {
        skillAggregation[0].skillCounts.forEach((item: any) => {
          topSkills[item.skill] = (topSkills[item.skill] || 0) + 1;
          skillLevelDistribution[item.level as keyof typeof skillLevelDistribution]++;
        });
      }

      // Department breakdown
      const departmentBreakdown = await this.staffProfileModel.aggregate([
        { $match: { businessId: businessId } },
        {
          $group: {
            _id: '$department',
            count: { $sum: 1 }
          }
        }
      ]);

      const departmentCounts: Record<string, number> = {};
      departmentBreakdown.forEach(dept => {
        if (dept._id) {
          departmentCounts[dept._id] = dept.count;
        }
      });

      // Assessment timing analytics
      const avgAssessmentTime = await this.skillAssessmentModel.aggregate([
        {
          $match: {
            businessId: businessId,
            status: { $in: [AssessmentStatus.APPROVED, AssessmentStatus.PARTIALLY_APPROVED] },
            createdAt: { $exists: true },
            reviewedAt: { $exists: true }
          }
        },
        {
          $project: {
            timeDiff: {
              $divide: [
                { $subtract: ['$reviewedAt', '$createdAt'] },
                1000 * 60 * 60 // Convert to hours
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            avgTime: { $avg: '$timeDiff' }
          }
        }
      ]);

      // Business configuration to identify missing critical skills
      const business = await this.businessModel.findById(businessId);
      const requiredSkills = business?.skillRequirements
        ?.filter(req => req.level === 'required')
        ?.map(req => req.name) || [];

      const missingCriticalSkills = requiredSkills.filter(skill => 
        !Object.keys(topSkills).includes(skill)
      );

      return {
        totalEmployees,
        averageSkillsPerEmployee: totalEmployees > 0 
          ? Math.round((skillAggregation[0]?.totalSkills || 0) / totalEmployees) 
          : 0,
        pendingAssessments,
        completedAssessments,
        rejectedAssessments,
        topSkills: Object.fromEntries(
          Object.entries(topSkills)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
        ),
        departmentBreakdown: departmentCounts,
        skillLevelDistribution,
        assessmentStatusBreakdown: {
          pending: pendingAssessments,
          approved: completedAssessments,
          rejected: rejectedAssessments,
          partiallyApproved: 0 // Could be calculated separately if needed
        },
        averageAssessmentTime: Math.round(avgAssessmentTime[0]?.avgTime || 0),
        missingCriticalSkills
      };
    } catch (error) {
      this.logger.error(`Error getting skill analytics: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Map proposed skills to DTO format
   */
  private mapProposedSkills(proposedSkills: Record<string, any>): SkillAssessmentItemDto[] {
    return Object.entries(proposedSkills).map(([skillName, skillData]) => ({
      skillName,
      level: skillData.level,
      yearsExperience: skillData.yearsExperience,
      source: skillData.source,
      confidence: skillData.confidence,
      reasoning: skillData.reasoning
    }));
  }

  /**
   * Apply approved skills to staff profile
   */
  private async applySkillsToStaffProfile(
    staffProfileId: string,
    finalSkills: Record<string, any>
  ): Promise<void> {
    try {
      const staffProfile = await this.staffProfileModel.findById(staffProfileId);
      
      if (!staffProfile) {
        throw new NotFoundException('Staff profile not found');
      }

      // Merge with existing skills
      const updatedSkills = { ...staffProfile.skills };
      
      Object.entries(finalSkills).forEach(([skillName, skillData]) => {
        updatedSkills[skillName] = skillData;
      });

      await this.staffProfileModel.findByIdAndUpdate(
        staffProfileId,
        { 
          skills: updatedSkills,
          updatedAt: new Date()
        }
      );

      this.logger.log(`Applied ${Object.keys(finalSkills).length} skills to staff profile ${staffProfileId}`);
    } catch (error) {
      this.logger.error(`Error applying skills to staff profile: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Trigger skill re-assessment for business employees
   */
  private async triggerSkillReassessment(
    businessId: string,
    reason: string
  ): Promise<void> {
    try {
      // This would typically create new skill assessments
      // Implementation depends on your specific business logic
      this.logger.log(`Triggering skill re-assessment for business ${businessId}: ${reason}`);
      
      // Could create new assessments for all employees
      // or mark existing skills for review
      
    } catch (error) {
      this.logger.error(`Error triggering skill re-assessment: ${error.message}`, error.stack);
    }
  }
}