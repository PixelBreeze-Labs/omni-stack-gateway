// src/services/business-skills.service.ts (Updated with Address Support)
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { 
  Business,
  BusinessIndustry,
  BusinessOperationType,
  BusinessSkillRequirement,
  BusinessSubCategory,
  BusinessType,
  AgentFeatureFlag,
  SubscriptionStatus
} from '../schemas/business.schema';
import { Address } from '../schemas/address.schema';
import { Country } from '../schemas/country.schema';
import { State } from '../schemas/state.schema';
import { City } from '../schemas/city.schema';
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
  SkillAssessmentItemDto,
  ConfigurationOptionsResponse,
  UpdateBusinessConfigDto,
  BusinessConfigResponse,
  SkillsConfigurationDto,
  AddressResponse,
  AddressDto
} from '../dtos/business-skills.dto';
import { Currency } from 'src/enums/currency.enum';

@Injectable()
export class BusinessSkillsService {
  private readonly logger = new Logger(BusinessSkillsService.name);

  constructor(
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(Address.name) private addressModel: Model<Address>,
    @InjectModel(Country.name) private countryModel: Model<Country>,
    @InjectModel(State.name) private stateModel: Model<State>,
    @InjectModel(City.name) private cityModel: Model<City>,
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

      // Ensure skillsConfiguration has default values
      const defaultSkillsConfig = {
        enablePerformanceTracking: true,
        enablePeerReviews: false,
        enableSelfAssessment: true,
        skillDecayMonths: 12,
        mandatorySkillsReview: false,
        reviewFrequencyMonths: 6
      };

      return {
        businessId: business._id.toString(),
        name: business.name,
        industry: business.industry,
        subCategory: business.subCategory,
        skillRequirements: business.skillRequirements || [],
        customSkills: business.customSkills || [],
        autoInferSkills: business.autoInferSkills ?? true,
        requireSkillApproval: business.requireSkillApproval ?? true,
        skillsConfiguration: {
          ...defaultSkillsConfig,
          ...business.skillsConfiguration
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

      // Validate custom skills if provided
      if (updateDto.customSkills) {
        // Remove duplicates and trim whitespace
        updateDto.customSkills = [...new Set(updateDto.customSkills.map(skill => skill.trim()).filter(Boolean))];
      }

      // Validate skillsConfiguration if provided
      if (updateDto.skillsConfiguration) {
        const config = updateDto.skillsConfiguration;
        
        // Validate skillDecayMonths
        if (config.skillDecayMonths !== undefined && (config.skillDecayMonths < 1 || config.skillDecayMonths > 60)) {
          throw new BadRequestException('Skill decay months must be between 1 and 60');
        }

        // Validate reviewFrequencyMonths
        if (config.reviewFrequencyMonths !== undefined && (config.reviewFrequencyMonths < 1 || config.reviewFrequencyMonths > 24)) {
          throw new BadRequestException('Review frequency months must be between 1 and 24');
        }
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
  // ADDRESS MANAGEMENT
  // ============================================================================

  /**
   * Get business address with populated location data
   */
  private async getBusinessAddress(addressId: string): Promise<AddressResponse | null> {
    if (!addressId) return null;

    try {
      const address = await this.addressModel.findById(addressId);
      if (!address) return null;

      const addressResponse: AddressResponse = {
        id: address._id.toString(),
        street: address.addressLine1,
        addressLine2: address.addressLine2,
        postcode: address.postcode
      };

      // Populate location data if available
      if (address.cityId) {
        const city = await this.cityModel.findById(address.cityId);
        if (city) {
          addressResponse.city = {
            id: city._id.toString(),
            name: city.name
          };
        }
      }

      if (address.stateId) {
        const state = await this.stateModel.findById(address.stateId);
        if (state) {
          addressResponse.state = {
            id: state._id.toString(),
            name: state.name
          };
        }
      }

      if (address.countryId) {
        const country = await this.countryModel.findById(address.countryId);
        if (country) {
          addressResponse.country = {
            id: country._id.toString(),
            name: country.name,
            code: country.code
          };
        }
      }

      return addressResponse;
    } catch (error) {
      this.logger.error(`Error getting business address: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Create or update business address
   */
  private async updateBusinessAddress(
    businessId: string, 
    addressData: AddressDto, 
    existingAddressId?: string
  ): Promise<string> {
    try {
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      // Validate location IDs if provided
      if (addressData.countryId) {
        const country = await this.countryModel.findById(addressData.countryId);
        if (!country) {
          throw new BadRequestException('Invalid country ID');
        }
      }

      if (addressData.stateId) {
        const state = await this.stateModel.findById(addressData.stateId);
        if (!state) {
          throw new BadRequestException('Invalid state ID');
        }
      }

      if (addressData.cityId) {
        const city = await this.cityModel.findById(addressData.cityId);
        if (!city) {
          throw new BadRequestException('Invalid city ID');
        }
      }

      const addressUpdateData = {
        addressLine1: addressData.street || '',
        addressLine2: addressData.addressLine2 || '',
        cityId: addressData.cityId || null,
        stateId: addressData.stateId || null,
        countryId: addressData.countryId || null,
        postcode: addressData.postcode || '',
        businessId: business._id,
        clientId: business.clientId,
        updatedAt: new Date()
      };

      let addressId: string;

      if (existingAddressId) {
        // Update existing address
        const updatedAddress = await this.addressModel.findByIdAndUpdate(
          existingAddressId,
          addressUpdateData,
          { new: true }
        );
        
        if (!updatedAddress) {
          throw new NotFoundException('Address not found');
        }
        
        addressId = updatedAddress._id.toString();
        this.logger.log(`Updated existing address ${addressId} for business ${businessId}`);
      } else {
        // Create new address
        const newAddress = await this.addressModel.create(addressUpdateData);
        addressId = newAddress._id.toString();
        
        // Link address to business
        await this.businessModel.findByIdAndUpdate(
          businessId,
          { $set: { addressId: newAddress._id } }
        );
        
        this.logger.log(`Created new address ${addressId} for business ${businessId}`);
      }

      return addressId;
    } catch (error) {
      this.logger.error(`Error updating business address: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================================================
  // BUSINESS CONFIGURATION MANAGEMENT (Updated)
  // ============================================================================

  /**
   * Get complete business configuration with address
   */
  async getBusinessConfiguration(businessId: string): Promise<BusinessConfigResponse> {
    try {
      const business = await this.businessModel.findById(businessId);
      
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      // Get address information
      const address = await this.getBusinessAddress(business.addressId);

      return {
        id: business._id.toString(),
        name: business.name,
        email: business.email,
        phone: business.phone,
        type: business.type,
        industry: business.industry,
        subCategory: business.subCategory,
        operationType: business.operationType,
        currency: business.currency,
        taxId: business.taxId,
        vatNumber: business.vatNumber,
        includedFeatures: business.includedFeatures,
        employeeCapabilities: {
          allowClockInOut: business.allow_clockinout,
          hasAppAccess: business.has_app_access,
          allowCheckIn: business.allow_checkin
        },
        subscriptionInfo: {
          status: business.subscriptionStatus,
          endDate: business.subscriptionEndDate,
          details: business.subscriptionDetails
        },
        departments: business.departments || [],
        address: address,
        metadata: business.metadata || new Map()
      };
    } catch (error) {
      this.logger.error(`Error getting business configuration: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update business configuration with address support
   */
  async updateBusinessConfiguration(
    businessId: string, 
    updateDto: UpdateBusinessConfigDto
  ): Promise<BusinessConfigResponse> {
    try {
      const business = await this.businessModel.findById(businessId);
      
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      // Validate business type if provided
      if (updateDto.type && !Object.values(BusinessType).includes(updateDto.type)) {
        throw new BadRequestException('Invalid business type');
      }

      // Validate industry if provided
      if (updateDto.industry && !Object.values(BusinessIndustry).includes(updateDto.industry)) {
        throw new BadRequestException('Invalid business industry');
      }

      // Validate subcategory if provided
      if (updateDto.subCategory && !Object.values(BusinessSubCategory).includes(updateDto.subCategory)) {
        throw new BadRequestException('Invalid business subcategory');
      }

      // Handle address update separately
      let addressUpdated = false;
      if (updateDto.address) {
        // Check if any address fields are provided
        const hasAddressData = Object.values(updateDto.address).some(value => value && value.trim() !== '');
        
        if (hasAddressData) {
          await this.updateBusinessAddress(businessId, updateDto.address, business.addressId);
          addressUpdated = true;
          this.logger.log(`Address updated for business ${businessId}`);
        }
      }

      // Prepare business update data (exclude address from main update)
      const { address, ...businessUpdateData } = updateDto;

      // Map field names for employee capabilities
      const updateData: any = { ...businessUpdateData };
      if (updateDto.allowClockInOut !== undefined) {
        updateData.allow_clockinout = updateDto.allowClockInOut;
        delete updateData.allowClockInOut;
      }
      if (updateDto.hasAppAccess !== undefined) {
        updateData.has_app_access = updateDto.hasAppAccess;
        delete updateData.hasAppAccess;
      }
      if (updateDto.allowCheckIn !== undefined) {
        updateData.allow_checkin = updateDto.allowCheckIn;
        delete updateData.allowCheckIn;
      }

      // Update business with new configuration
      const updatedBusiness = await this.businessModel.findByIdAndUpdate(
        businessId,
        {
          ...updateData,
          updatedAt: new Date()
        },
        { new: true }
      );

      this.logger.log(`Business configuration updated for ${businessId}${addressUpdated ? ' (including address)' : ''}`);

      return this.getBusinessConfiguration(businessId);
    } catch (error) {
      this.logger.error(`Error updating business configuration: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================================================
  // SKILL ASSESSMENT MANAGEMENT (Keeping existing methods)
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
  // ANALYTICS AND REPORTING (Keeping existing methods)
  // ============================================================================

  /**
   * Get comprehensive skill analytics for business
   */
  async getSkillAnalytics(businessId: string): Promise<SkillAnalyticsResponse> {
    try {
      // Convert string to ObjectId for MongoDB query
      const mongoose = require('mongoose');
      const businessObjectId = new mongoose.Types.ObjectId(businessId);
      
      // Basic employee and assessment counts
      const [
        totalEmployees,
        pendingAssessments,
        completedAssessments,
        rejectedAssessments
      ] = await Promise.all([
        this.staffProfileModel.countDocuments({ businessId: businessObjectId }),
        this.skillAssessmentModel.countDocuments({ 
          businessId: businessObjectId, 
          status: AssessmentStatus.PENDING_REVIEW 
        }),
        this.skillAssessmentModel.countDocuments({ 
          businessId: businessObjectId, 
          status: { $in: [AssessmentStatus.APPROVED, AssessmentStatus.PARTIALLY_APPROVED] }
        }),
        this.skillAssessmentModel.countDocuments({ 
          businessId: businessObjectId, 
          status: AssessmentStatus.REJECTED 
        })
      ]);

      // Fixed skill aggregation
      const skillAggregation = await this.staffProfileModel.aggregate([
        { $match: { businessId: businessObjectId } },
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
          if (item.level && skillLevelDistribution.hasOwnProperty(item.level)) {
            skillLevelDistribution[item.level as keyof typeof skillLevelDistribution]++;
          }
        });
      }

      // Department breakdown
      const departmentBreakdown = await this.staffProfileModel.aggregate([
        { $match: { businessId: businessObjectId } },
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

      // Business configuration
      const business = await this.businessModel.findById(businessObjectId);
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
          partiallyApproved: 0
        },
        averageAssessmentTime: 0,
        missingCriticalSkills
      };
    } catch (error) {
      this.logger.error(`Error getting skill analytics: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get configuration options for dropdowns
   */
  async getConfigurationOptions(): Promise<ConfigurationOptionsResponse> {
    try {
      return {
        businessTypes: Object.values(BusinessType),
        industries: Object.values(BusinessIndustry),
        subCategories: Object.values(BusinessSubCategory),
        operationTypes: Object.values(BusinessOperationType),
        currencies: Object.values(Currency),
        agentFeatures: Object.values(AgentFeatureFlag),
        subscriptionStatuses: Object.values(SubscriptionStatus)
      };
    } catch (error) {
      this.logger.error(`Error getting configuration options: ${error.message}`, error.stack);
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