// src/services/quality-inspection.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business, QualityInspectionConfiguration } from '../schemas/business.schema';
import { QualityInspection } from '../schemas/quality-inspection.schema';
import { Employee } from '../schemas/employee.schema';

// DTOs for inspection creation
export interface CreateDetailedInspectionDto {
    appProjectId: string;
    appClientId: string;
    constructionSiteId?: string;
    location: string;
    inspectionCategory?: string;
    checklistItems: any[];
    photos?: string[];
    signature?: string;
    notes?: string;
  }
  
  export interface CreateSimpleInspectionDto {
    appProjectId: string;
    appClientId: string;
    constructionSiteId?: string;
    location: string;
    overallRating: number;
    remarks: string;
    improvementSuggestions?: string;
    notes?: string;
  }
  
  export interface UpdateInspectionDto {
    location?: string;
    inspectionCategory?: string;
    checklistItems?: any[];
    photos?: string[];
    signature?: string;
    notes?: string;
    overallRating?: number;
    remarks?: string;
    improvementSuggestions?: string;
  }

  // DTOs for reviewer actions
export interface ApproveInspectionDto {
    notes?: string;
    reviewComments?: string;
  }
  
  export interface RejectInspectionDto {
    reason: string;
    feedback: string;
    requiredChanges?: string[];
  }
  
  export interface RequestRevisionDto {
    feedback: string;
    requiredChanges: string[];
    priority?: 'low' | 'medium' | 'high';
  }

  // DTOs for final approver actions
export interface FinalApprovalDto {
    notes?: string;
    clientNotificationRequired?: boolean;
    scheduledCompletionDate?: Date;
  }
  
  export interface OverrideDecisionDto {
    decision: 'approve' | 'reject';
    reason: string;
    justification: string;
    overridePreviousReview?: boolean;
  }

  // DTOs for client actions
export interface ClientReviewDto {
    feedback: string;
    rating?: number; // 1-5 client satisfaction rating
    concerns?: string[];
    requestedChanges?: string[];
  }
  
  export interface ClientApprovalDto {
    approved: boolean;
    clientSignature?: string;
    notes?: string;
    satisfactionRating?: number; // 1-5
  }
  
  export interface ClientRejectionDto {
    reason: string;
    requestedChanges: string[];
    priority?: 'low' | 'medium' | 'high';
    scheduledRevisitDate?: Date;
  }
  
  
@Injectable()
export class QualityInspectionService {
  private readonly logger = new Logger(QualityInspectionService.name);

  constructor(
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(QualityInspection.name) private qualityInspectionModel: Model<QualityInspection>,
    @InjectModel(Employee.name) private employeeModel: Model<Employee>
  ) {}

  /**
   * Update quality inspection configuration for a business
   */
  async updateQualityInspectionConfig(
    businessId: string, 
    config: QualityInspectionConfiguration
  ): Promise<{ success: boolean; message: string; config: QualityInspectionConfiguration }> {
    try {
      this.logger.log(`Updating quality inspection config for business: ${businessId}`);

      // Find business
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      // Validate configuration
      this.validateConfiguration(config);

      // Update business with new configuration
      const updatedBusiness = await this.businessModel.findByIdAndUpdate(
        businessId,
        { 
          $set: { 
            qualityInspectionConfig: config,
            updatedAt: new Date()
          } 
        },
        { new: true }
      );

      this.logger.log(`Successfully updated quality inspection config for business: ${businessId}`);

      return {
        success: true,
        message: 'Quality inspection configuration updated successfully',
        config: updatedBusiness.qualityInspectionConfig
      };
    } catch (error) {
      this.logger.error(`Error updating quality inspection config: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get quality inspection configuration for a business
   */
  async getQualityInspectionConfig(businessId: string): Promise<QualityInspectionConfiguration> {
    try {
      this.logger.log(`Getting quality inspection config for business: ${businessId}`);

      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      // Return config or default values
      const config = business.qualityInspectionConfig || this.getDefaultConfiguration();

      return config;
    } catch (error) {
      this.logger.error(`Error getting quality inspection config: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
 * Assign quality role to a user in a business
 */
async assignQualityRole(
  businessId: string, 
  userId: string, 
  role: string
): Promise<{ success: boolean; message: string; qualityTeam?: any[]; error?: any }> {
  try {
    this.logger.log(`Assigning quality role ${role} to user ${userId} in business: ${businessId}`);

    // Validate inputs
    if (!businessId || !userId || !role) {
      return {
        success: false,
        message: 'Missing required parameters: businessId, userId, and role are required',
        error: {
          code: 'MISSING_PARAMETERS',
          details: {
            businessId: !businessId ? 'required' : 'provided',
            userId: !userId ? 'required' : 'provided',
            role: !role ? 'required' : 'provided'
          }
        }
      };
    }

    // Validate role first
    try {
      this.validateRole(role);
    } catch (roleError) {
      return {
        success: false,
        message: roleError.message,
        error: {
          code: 'INVALID_ROLE',
          details: { providedRole: role, validRoles: [
            'team_leader',
            'quality_staff', 
            'site_supervisor',
            'project_manager',
            'operations_manager'
          ]}
        }
      };
    }

    // Find business
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      return {
        success: false,
        message: 'Business not found',
        error: {
          code: 'BUSINESS_NOT_FOUND',
          details: { businessId }
        }
      };
    }

    // Find employee by user_id and businessId
    const employee = await this.employeeModel.findOne({ 
      user_id: userId, 
      businessId,
      isDeleted: { $ne: true }
    });

    if (!employee) {
      return {
        success: false,
        message: 'Employee not found in this business',
        error: {
          code: 'EMPLOYEE_NOT_FOUND',
          details: { 
            userId, 
            businessId,
            searchCriteria: 'user_id + businessId + not deleted'
          }
        }
      };
    }

    // Update employee's quality role in metadata
    const updateResult = await this.employeeModel.updateOne(
      { user_id: userId, businessId },
      { 
        $set: { 
          'metadata.qualityRole': role,
          'metadata.qualityAssignedDate': new Date(),
          'metadata.qualityPermissions': this.getDefaultPermissions(role)
        } 
      }
    );

    // Check if update was successful
    if (updateResult.matchedCount === 0) {
      return {
        success: false,
        message: 'Failed to update employee - no matching record found',
        error: {
          code: 'UPDATE_FAILED_NO_MATCH',
          details: { 
            userId, 
            businessId, 
            updateResult 
          }
        }
      };
    }

    if (updateResult.modifiedCount === 0) {
      return {
        success: false,
        message: 'Employee found but no changes were made (possibly already has this role)',
        error: {
          code: 'UPDATE_FAILED_NO_CHANGES',
          details: { 
            userId, 
            businessId, 
            role,
            // @ts-ignore
            currentRole: employee.metadata?.qualityRole,
            updateResult 
          }
        }
      };
    }

    this.logger.log(`Successfully assigned quality role ${role} to employee: ${employee._id}`);

    // Get updated quality team
    const qualityTeam = await this.getQualityTeam(businessId);
    
    return {
      success: true,
      message: `Successfully assigned ${role} role to user`,
      qualityTeam
    };

  } catch (error) {
    this.logger.error(`Error assigning quality role: ${error.message}`, error.stack);
    
    // Return detailed error information
    return {
      success: false,
      message: `Failed to assign quality role: ${error.message}`,
      error: {
        code: 'INTERNAL_ERROR',
        details: {
          errorName: error.name,
          errorMessage: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
          parameters: { businessId, userId, role }
        }
      }
    };
  }
}
  /**
   * Remove quality role from a user in a business
   */
  async removeQualityRole(
    businessId: string, 
    userId: string
  ): Promise<{ success: boolean; message: string; qualityTeam: any[] }> {
    try {
      this.logger.log(`Removing quality role from user ${userId} in business: ${businessId}`);

      // Find business
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      // Find employee by user_id and businessId
      const employee = await this.employeeModel.findOne({ 
        user_id: userId, 
        businessId,
        isDeleted: { $ne: true }
      });

      if (!employee) {
        throw new NotFoundException('Employee not found in this business');
      }

      // Check if employee has a quality role
      if (!employee.metadata?.get('qualityRole')) {
        throw new NotFoundException('Employee does not have a quality role assigned');
      }

      // Remove quality role from employee metadata
      await this.employeeModel.updateOne(
        { user_id: userId, businessId },
        { 
          $unset: { 
            'metadata.qualityRole': '',
            'metadata.qualityAssignedDate': '',
            'metadata.qualityPermissions': ''
          } 
        }
      );

      this.logger.log(`Successfully removed quality role from employee: ${employee._id}`);

      // Get updated quality team
      const qualityTeam = await this.getQualityTeam(businessId);
      
      return {
        success: true,
        message: 'Successfully removed user from quality team',
        qualityTeam
      };
    } catch (error) {
      this.logger.error(`Error removing quality role: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
 * Get quality team for a business
 */
async getQualityTeam(businessId: string): Promise<any[]> {
    try {
      this.logger.log(`Getting quality team for business: ${businessId}`);
  
      // Find business
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }
  
      // Find all employees with quality roles assigned
      const qualityEmployees = await this.employeeModel.find({
        businessId,
        isDeleted: { $ne: true },
        'metadata.qualityRole': { $exists: true }
      }).populate('user_id', 'name surname email');
  
      // Format the quality team response
      const qualityTeam = qualityEmployees.map(employee => {
        const user = employee.user_id as any;
        return {
          employeeId: employee._id,
          userId: user?._id,
          name: employee.name,
          email: employee.email,
          user: user ? {
            _id: user._id,
            name: user.name,
            surname: user.surname,
            email: user.email,
            fullName: user.surname ? `${user.name} ${user.surname}` : user.name
          } : null,
          qualityRole: employee.metadata?.get('qualityRole'),
          qualityAssignedDate: employee.metadata?.get('qualityAssignedDate'),
          qualityPermissions: employee.metadata?.get('qualityPermissions'),
          mainRole: employee.metadata?.get('role') || 'business_staff', // ← Fixed: from metadata
          isActive: true
        };
      });
  
      return qualityTeam;
    } catch (error) {
      this.logger.error(`Error getting quality team: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Validate quality inspection configuration
   */
  private validateConfiguration(config: QualityInspectionConfiguration): void {
    if (!config.canInspect || !Array.isArray(config.canInspect) || config.canInspect.length === 0) {
      throw new BadRequestException('canInspect must be a non-empty array');
    }

    if (!config.canReview || !Array.isArray(config.canReview) || config.canReview.length === 0) {
      throw new BadRequestException('canReview must be a non-empty array');
    }

    if (!config.finalApprover || typeof config.finalApprover !== 'string') {
      throw new BadRequestException('finalApprover must be a non-empty string');
    }

    // Validate boolean fields
    if (typeof config.allowSelfReview !== 'boolean') {
      throw new BadRequestException('allowSelfReview must be a boolean');
    }

    if (typeof config.requireClientSignoff !== 'boolean') {
      throw new BadRequestException('requireClientSignoff must be a boolean');
    }

    if (typeof config.requirePhotos !== 'boolean') {
      throw new BadRequestException('requirePhotos must be a boolean');
    }

    if (typeof config.requireSignature !== 'boolean') {
      throw new BadRequestException('requireSignature must be a boolean');
    }

    if (typeof config.useDetailedInspections !== 'boolean') {
      throw new BadRequestException('useDetailedInspections must be a boolean');
    }
  }

  /**
   * Validate role
   */
  private validateRole(role: string): void {
    const validRoles = [
      'team_leader',
      'quality_staff', 
      'site_supervisor',
      'project_manager',
      'operations_manager'
    ];

    if (!validRoles.includes(role)) {
      throw new BadRequestException(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }
  }

  /**
   * Get default configuration
   */
  private getDefaultConfiguration(): QualityInspectionConfiguration {
    return {
      canInspect: ['team_leader', 'quality_staff'],
      canReview: ['team_leader', 'project_manager'],
      finalApprover: 'operations_manager',
      allowSelfReview: true,
      requireClientSignoff: false,
      requirePhotos: true,
      requireSignature: true,
      useDetailedInspections: true
    };
  }

  /**
   * Get default permissions for a role
   */
  private getDefaultPermissions(role: string): any {
    const permissions = {
      team_leader: {
        canCreate: true,
        canReview: true,
        canApprove: false,
        canOverride: false,
        canViewAll: false,
        canExport: false,
        canDelete: false,
        restrictToOwnProjects: true
      },
      quality_staff: {
        canCreate: true,
        canReview: false,
        canApprove: false,
        canOverride: false,
        canViewAll: false,
        canExport: false,
        canDelete: false,
        restrictToOwnProjects: true
      },
      site_supervisor: {
        canCreate: true,
        canReview: true,
        canApprove: false,
        canOverride: false,
        canViewAll: true,
        canExport: false,
        canDelete: false,
        restrictToOwnProjects: false
      },
      project_manager: {
        canCreate: false,
        canReview: true,
        canApprove: true,
        canOverride: false,
        canViewAll: true,
        canExport: true,
        canDelete: false,
        restrictToOwnProjects: false
      },
      operations_manager: {
        canCreate: false,
        canReview: true,
        canApprove: true,
        canOverride: true,
        canViewAll: true,
        canExport: true,
        canDelete: true,
        restrictToOwnProjects: false
      }
    };

    return permissions[role] || permissions.quality_staff;
  }

  /**
 * Create detailed inspection (construction with photos/signature)
 */
async createDetailedInspection(
    businessId: string,
    inspectorId: string,
    inspectionData: CreateDetailedInspectionDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Creating detailed inspection for business: ${businessId}, inspector: ${inspectorId}`);
  
      // Validate inspector has permission
      await this.validateInspectorPermissions(businessId, inspectorId, 'detailed');
  
      // Calculate passed/failed items from checklist
      const totalItems = inspectionData.checklistItems?.length || 0;
      const passedItems = inspectionData.checklistItems?.filter(item => item.status === 'pass').length || 0;
      const failedItems = inspectionData.checklistItems?.filter(item => item.status === 'fail').length || 0;
      const hasCriticalIssues = inspectionData.checklistItems?.some(item => 
        item.status === 'fail' && item.critical === true
      ) || false;
  
      // Create inspection record
      const inspection = await this.qualityInspectionModel.create({
        businessId,
        appProjectId: inspectionData.appProjectId,
        appClientId: inspectionData.appClientId,
        constructionSiteId: inspectionData.constructionSiteId,
        inspectorId,
        type: 'detailed',
        status: 'draft',
        location: inspectionData.location,
        inspectionCategory: inspectionData.inspectionCategory,
        passedItems,
        failedItems,
        totalItems,
        hasPhotos: (inspectionData.photos?.length || 0) > 0,
        hasSignature: !!inspectionData.signature,
        hasCriticalIssues,
        inspectionDate: new Date(),
        metadata: {
          checklistItems: JSON.stringify(inspectionData.checklistItems || []),
          photos: JSON.stringify(inspectionData.photos || []),
          signature: inspectionData.signature || '',
          notes: inspectionData.notes || ''
        }
      });
  
      this.logger.log(`Successfully created detailed inspection: ${inspection._id}`);
  
      return {
        success: true,
        message: 'Detailed inspection created successfully',
        inspection
      };
    } catch (error) {
      this.logger.error(`Error creating detailed inspection: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Create simple inspection (basic quality review)
   */
  async createSimpleInspection(
    businessId: string,
    inspectorId: string,
    inspectionData: CreateSimpleInspectionDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Creating simple inspection for business: ${businessId}, inspector: ${inspectorId}`);
  
      // Validate inspector has permission
      await this.validateInspectorPermissions(businessId, inspectorId, 'simple');
  
      // Create inspection record
      const inspection = await this.qualityInspectionModel.create({
        businessId,
        appProjectId: inspectionData.appProjectId,
        appClientId: inspectionData.appClientId,
        constructionSiteId: inspectionData.constructionSiteId,
        inspectorId,
        type: 'simple',
        status: 'draft',
        location: inspectionData.location,
        overallRating: inspectionData.overallRating,
        hasPhotos: false,
        hasSignature: false,
        hasCriticalIssues: inspectionData.overallRating <= 2, // Rating 1-2 considered critical
        inspectionDate: new Date(),
        metadata: {
          remarks: inspectionData.remarks,
          improvementSuggestions: inspectionData.improvementSuggestions || '',
          notes: inspectionData.notes || ''
        }
      });
  
      this.logger.log(`Successfully created simple inspection: ${inspection._id}`);
  
      return {
        success: true,
        message: 'Simple inspection created successfully',
        inspection
      };
    } catch (error) {
      this.logger.error(`Error creating simple inspection: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Get inspections for a specific inspector
   */
  async getMyInspections(
    inspectorId: string,
    businessId: string,
    filters: {
      status?: string;
      constructionSiteId?: string;
      type?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ inspections: any[]; total: number; page: number; totalPages: number }> {
    try {
      this.logger.log(`Getting inspections for inspector: ${inspectorId}`);
  
      const { status, type, constructionSiteId, page = 1, limit = 10 } = filters;
      const skip = (page - 1) * limit;
  
      // Build filter
      const filter: any = {
        inspectorId,
        businessId,
        isDeleted: { $ne: true }
      };
  
      if (status) filter.status = status;
      if (type) filter.type = type;
      if (constructionSiteId) filter.constructionSiteId = constructionSiteId;

      // Get total count
      const total = await this.qualityInspectionModel.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);
  
      // Get inspections
      const inspections = await this.qualityInspectionModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('appProjectId', 'name')
        .populate('appClientId', 'name')
        .populate('constructionSiteId', 'name location status type')
        .populate('reviewerId', 'name surname email')
        .populate('approverId', 'name surname email');
  
      return {
        inspections,
        total,
        page,
        totalPages
      };
    } catch (error) {
      this.logger.error(`Error getting inspector inspections: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Update inspection
   */
  async updateInspection(
    inspectionId: string,
    inspectorId: string,
    updates: UpdateInspectionDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Updating inspection: ${inspectionId} by inspector: ${inspectorId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel.findById(inspectionId);
      if (!inspection) {
        throw new NotFoundException('Inspection not found');
      }
  
      // Verify inspector owns this inspection
      if (inspection.inspectorId !== inspectorId) {
        throw new BadRequestException('You can only update your own inspections');
      }
  
      // Verify inspection is still editable
      if (inspection.status !== 'draft' && inspection.status !== 'rejected') {
        throw new BadRequestException('Cannot update inspection in current status');
      }
  
      // Prepare update data
      const updateData: any = {};
      const metadataUpdates: any = { ...inspection.metadata };
  
      // Update basic fields
      if (updates.location) updateData.location = updates.location;
      if (updates.inspectionCategory) updateData.inspectionCategory = updates.inspectionCategory;
      if (updates.overallRating) updateData.overallRating = updates.overallRating;
  
      // Update metadata
      if (updates.checklistItems) {
        // Recalculate stats for detailed inspections
        const totalItems = updates.checklistItems.length;
        const passedItems = updates.checklistItems.filter(item => item.status === 'pass').length;
        const failedItems = updates.checklistItems.filter(item => item.status === 'fail').length;
        const hasCriticalIssues = updates.checklistItems.some(item => 
          item.status === 'fail' && item.critical === true
        );
  
        updateData.totalItems = totalItems;
        updateData.passedItems = passedItems;
        updateData.failedItems = failedItems;
        updateData.hasCriticalIssues = hasCriticalIssues;
        metadataUpdates.checklistItems = JSON.stringify(updates.checklistItems);
      }
  
      if (updates.photos) {
        updateData.hasPhotos = updates.photos.length > 0;
        metadataUpdates.photos = JSON.stringify(updates.photos);
      }
  
      if (updates.signature) {
        updateData.hasSignature = true;
        metadataUpdates.signature = updates.signature;
      }
  
      if (updates.notes) metadataUpdates.notes = updates.notes;
      if (updates.remarks) metadataUpdates.remarks = updates.remarks;
      if (updates.improvementSuggestions) metadataUpdates.improvementSuggestions = updates.improvementSuggestions;
  
      updateData.metadata = metadataUpdates;
  
      // Update inspection
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        updateData,
        { new: true }
      );
  
      this.logger.log(`Successfully updated inspection: ${inspectionId}`);
  
      return {
        success: true,
        message: 'Inspection updated successfully',
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error updating inspection: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Submit inspection for review
   */
  async submitInspectionForReview(
    inspectionId: string,
    inspectorId: string
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Submitting inspection for review: ${inspectionId} by inspector: ${inspectorId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel.findById(inspectionId);
      if (!inspection) {
        throw new NotFoundException('Inspection not found');
      }
  
      // Verify inspector owns this inspection
      if (inspection.inspectorId !== inspectorId) {
        throw new BadRequestException('You can only submit your own inspections');
      }
  
      // Verify inspection is in draft status
      if (inspection.status !== 'draft') {
        throw new BadRequestException('Only draft inspections can be submitted for review');
      }
  
      // Get business config to check requirements
      const business = await this.businessModel.findById(inspection.businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }
  
      const config = business.qualityInspectionConfig || this.getDefaultConfiguration();
  
      // Validate inspection completeness based on config
      if (config.requirePhotos && inspection.type === 'detailed' && !inspection.hasPhotos) {
        throw new BadRequestException('Photos are required for this inspection');
      }
  
      if (config.requireSignature && inspection.type === 'detailed' && !inspection.hasSignature) {
        throw new BadRequestException('Signature is required for this inspection');
      }
  
      // Update inspection status
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        { 
          status: 'pending',
          metadata: {
            ...inspection.metadata,
            submittedForReviewAt: new Date().toISOString()
          }
        },
        { new: true }
      );
  
      this.logger.log(`Successfully submitted inspection for review: ${inspectionId}`);
  
      return {
        success: true,
        message: 'Inspection submitted for review successfully',
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error submitting inspection for review: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Validate inspector permissions
   */
  private async validateInspectorPermissions(
    businessId: string,
    inspectorId: string,
    inspectionType: 'detailed' | 'simple'
  ): Promise<void> {
    // Get business config
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }
  
    const config = business.qualityInspectionConfig || this.getDefaultConfiguration();
  
    // Find employee/inspector
    const employee = await this.employeeModel.findOne({
      user_id: inspectorId,
      businessId,
      isDeleted: { $ne: true }
    });
  
    if (!employee) {
      throw new NotFoundException('Inspector not found in business');
    }
  
    // Get inspector's quality role
    const qualityRole = employee.metadata?.get('qualityRole');
    const mainRole = employee.metadata?.get('role') || 'business_staff';
  
    // Check if inspector has permission to create inspections
    const canInspect = config.canInspect.includes(qualityRole) || config.canInspect.includes(mainRole);
  
    if (!canInspect) {
      throw new BadRequestException('You do not have permission to create inspections');
    }
  
    // Check specific inspection type requirements
    if (inspectionType === 'detailed' && !config.useDetailedInspections) {
      throw new BadRequestException('Detailed inspections are not enabled for this business');
    }
  }

  /**
 * Get inspections assigned for review
 */
async getInspectionsForReview(
    reviewerId: string,
    businessId: string,
    filters: {
      status?: string;
      type?: string;
      priority?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ inspections: any[]; total: number; page: number; totalPages: number }> {
    try {
      this.logger.log(`Getting inspections for review by: ${reviewerId}`);
  
      // Validate reviewer has permission
      await this.validateReviewerPermissions(businessId, reviewerId);
  
      const { status = 'pending', type, priority, page = 1, limit = 10 } = filters;
      const skip = (page - 1) * limit;
  
      // Build filter for inspections pending review
      const filter: any = {
        businessId,
        status: { $in: ['pending', 'under_review'] },
        isDeleted: { $ne: true }
      };
  
      // Add additional filters
      if (status && status !== 'pending') filter.status = status;
      if (type) filter.type = type;
      if (priority) filter['metadata.priority'] = priority;
  
      // Get business config to check self-review policy
      const business = await this.businessModel.findById(businessId);
      const config = business?.qualityInspectionConfig || this.getDefaultConfiguration();
  
      // If self-review is not allowed, exclude own inspections
      if (!config.allowSelfReview) {
        filter.inspectorId = { $ne: reviewerId };
      }
  
      // Get total count
      const total = await this.qualityInspectionModel.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);
  
      // Get inspections
      const inspections = await this.qualityInspectionModel
        .find(filter)
        .sort({ 
          'metadata.priority': -1, // High priority first
          createdAt: 1 // Oldest first
        })
        .skip(skip)
        .limit(limit)
        .populate('inspectorId', 'name surname email')
        .populate('appProjectId', 'name description')
        .populate('appClientId', 'name type')
        .populate('constructionSiteId', 'name location status type')
        .populate('reviewerId', 'name surname email');
  
      return {
        inspections,
        total,
        page,
        totalPages
      };
    } catch (error) {
      this.logger.error(`Error getting inspections for review: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Approve inspection
   */
  async approveInspection(
    inspectionId: string,
    reviewerId: string,
    approvalData: ApproveInspectionDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Approving inspection: ${inspectionId} by reviewer: ${reviewerId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel.findById(inspectionId);
      if (!inspection) {
        throw new NotFoundException('Inspection not found');
      }
  
      // Validate reviewer has permission
      await this.validateReviewerPermissions(inspection.businessId, reviewerId);
  
      // Verify inspection can be reviewed
      if (!['pending', 'under_review'].includes(inspection.status)) {
        throw new BadRequestException('Inspection cannot be reviewed in current status');
      }
  
      // Check self-review policy
      const business = await this.businessModel.findById(inspection.businessId);
      const config = business?.qualityInspectionConfig || this.getDefaultConfiguration();
  
      if (!config.allowSelfReview && inspection.inspectorId === reviewerId) {
        throw new BadRequestException('Self-review is not allowed');
      }
  
      // Update inspection
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        {
          status: 'approved',
          reviewerId,
          reviewedDate: new Date(),
          metadata: {
            ...inspection.metadata,
            reviewNotes: approvalData.notes || '',
            reviewComments: approvalData.reviewComments || '',
            reviewAction: 'approved',
            reviewedAt: new Date().toISOString(),
            reviewerId: reviewerId
          }
        },
        { new: true }
      );
  
      this.logger.log(`Successfully approved inspection: ${inspectionId}`);
  
      return {
        success: true,
        message: 'Inspection approved successfully',
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error approving inspection: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Reject inspection
   */
  async rejectInspection(
    inspectionId: string,
    reviewerId: string,
    rejectionData: RejectInspectionDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Rejecting inspection: ${inspectionId} by reviewer: ${reviewerId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel.findById(inspectionId);
      if (!inspection) {
        throw new NotFoundException('Inspection not found');
      }
  
      // Validate reviewer has permission
      await this.validateReviewerPermissions(inspection.businessId, reviewerId);
  
      // Verify inspection can be reviewed
      if (!['pending', 'under_review'].includes(inspection.status)) {
        throw new BadRequestException('Inspection cannot be reviewed in current status');
      }
  
      // Check self-review policy
      const business = await this.businessModel.findById(inspection.businessId);
      const config = business?.qualityInspectionConfig || this.getDefaultConfiguration();
  
      if (!config.allowSelfReview && inspection.inspectorId === reviewerId) {
        throw new BadRequestException('Self-review is not allowed');
      }
  
      // Validate rejection data
      if (!rejectionData.reason || !rejectionData.feedback) {
        throw new BadRequestException('Reason and feedback are required for rejection');
      }
  
      // Update inspection
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        {
          status: 'rejected',
          reviewerId,
          reviewedDate: new Date(),
          metadata: {
            ...inspection.metadata,
            rejectionReason: rejectionData.reason,
            rejectionFeedback: rejectionData.feedback,
            requiredChanges: rejectionData.requiredChanges || [],
            reviewAction: 'rejected',
            reviewedAt: new Date().toISOString(),
            reviewerId: reviewerId
          }
        },
        { new: true }
      );
  
      this.logger.log(`Successfully rejected inspection: ${inspectionId}`);
  
      return {
        success: true,
        message: 'Inspection rejected successfully',
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error rejecting inspection: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Request inspection revision
   */
  async requestInspectionRevision(
    inspectionId: string,
    reviewerId: string,
    revisionData: RequestRevisionDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Requesting revision for inspection: ${inspectionId} by reviewer: ${reviewerId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel.findById(inspectionId);
      if (!inspection) {
        throw new NotFoundException('Inspection not found');
      }
  
      // Validate reviewer has permission
      await this.validateReviewerPermissions(inspection.businessId, reviewerId);
  
      // Verify inspection can be reviewed
      if (!['pending', 'under_review'].includes(inspection.status)) {
        throw new BadRequestException('Inspection cannot be reviewed in current status');
      }
  
      // Check self-review policy
      const business = await this.businessModel.findById(inspection.businessId);
      const config = business?.qualityInspectionConfig || this.getDefaultConfiguration();
  
      if (!config.allowSelfReview && inspection.inspectorId === reviewerId) {
        throw new BadRequestException('Self-review is not allowed');
      }
  
      // Validate revision data
      if (!revisionData.feedback || !revisionData.requiredChanges?.length) {
        throw new BadRequestException('Feedback and required changes are required for revision request');
      }
  
      // Update inspection - set back to draft for inspector to fix
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        {
          status: 'draft',
          reviewerId,
          reviewedDate: new Date(),
          metadata: {
            ...inspection.metadata,
            revisionFeedback: revisionData.feedback,
            requiredChanges: revisionData.requiredChanges,
            revisionPriority: revisionData.priority || 'medium',
            reviewAction: 'revision_requested',
            reviewedAt: new Date().toISOString(),
            reviewerId: reviewerId,
            revisionCount: (inspection.metadata?.revisionCount || 0) + 1
          }
        },
        { new: true }
      );
  
      this.logger.log(`Successfully requested revision for inspection: ${inspectionId}`);
  
      return {
        success: true,
        message: 'Inspection revision requested successfully',
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error requesting inspection revision: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Assign inspection to reviewer (for workflow management)
   */
  async assignInspectionToReviewer(
    inspectionId: string,
    reviewerId: string,
    assignedBy: string
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Assigning inspection ${inspectionId} to reviewer: ${reviewerId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel.findById(inspectionId);
      if (!inspection) {
        throw new NotFoundException('Inspection not found');
      }
  
      // Validate assignedBy has permission (could be admin or operations manager)
      await this.validateReviewerPermissions(inspection.businessId, assignedBy);
  
      // Verify inspection is pending
      if (inspection.status !== 'pending') {
        throw new BadRequestException('Only pending inspections can be assigned');
      }
  
      // Update inspection
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        {
          status: 'under_review',
          reviewerId,
          metadata: {
            ...inspection.metadata,
            assignedToReviewerAt: new Date().toISOString(),
            assignedBy: assignedBy
          }
        },
        { new: true }
      );
  
      this.logger.log(`Successfully assigned inspection to reviewer: ${reviewerId}`);
  
      return {
        success: true,
        message: 'Inspection assigned to reviewer successfully',
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error assigning inspection to reviewer: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Validate reviewer permissions
   */
  private async validateReviewerPermissions(
    businessId: string,
    reviewerId: string
  ): Promise<void> {
    // Get business config
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }
  
    const config = business.qualityInspectionConfig || this.getDefaultConfiguration();
  
    // Find employee/reviewer
    const employee = await this.employeeModel.findOne({
      user_id: reviewerId,
      businessId,
      isDeleted: { $ne: true }
    });
  
    if (!employee) {
      throw new NotFoundException('Reviewer not found in business');
    }
  
    // Get reviewer's quality role and main role
    const qualityRole = employee.metadata?.get('qualityRole');
    const mainRole = employee.metadata?.get('role') || 'business_staff';
  
    // Check if reviewer has permission to review inspections
    const canReview = config.canReview.includes(qualityRole) || config.canReview.includes(mainRole);
  
    if (!canReview) {
      throw new BadRequestException('You do not have permission to review inspections');
    }
  }

  /**
 * Get inspections requiring final approval
 */
async getInspectionsForFinalApproval(
    approverId: string,
    businessId: string,
    filters: {
      status?: string;
      type?: string;
      priority?: string;
      hasCriticalIssues?: boolean;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ inspections: any[]; total: number; page: number; totalPages: number }> {
    try {
      this.logger.log(`Getting inspections for final approval by: ${approverId}`);
  
      // Validate approver has permission
      await this.validateFinalApproverPermissions(businessId, approverId);
  
      const { 
        status = 'approved', 
        type, 
        priority, 
        hasCriticalIssues, 
        page = 1, 
        limit = 10 
      } = filters;
      const skip = (page - 1) * limit;
  
      // Build filter for inspections requiring final approval
      const filter: any = {
        businessId,
        status: 'approved', // Only approved inspections need final approval
        isDeleted: { $ne: true },
        completedDate: { $exists: false } // Not yet finally completed
      };
  
      // Add additional filters
      if (type) filter.type = type;
      if (priority) filter['metadata.priority'] = priority;
      if (hasCriticalIssues !== undefined) filter.hasCriticalIssues = hasCriticalIssues;
  
      // Get total count
      const total = await this.qualityInspectionModel.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);
  
      // Get inspections - prioritize critical issues and oldest first
      const inspections = await this.qualityInspectionModel
        .find(filter)
        .sort({ 
          hasCriticalIssues: -1, // Critical issues first
          'metadata.priority': -1, // High priority first
          reviewedDate: 1 // Oldest reviewed first
        })
        .skip(skip)
        .limit(limit)
        .populate('inspectorId', 'name surname email')
        .populate('reviewerId', 'name surname email')
        .populate('appProjectId', 'name description status')
        .populate('appClientId', 'name type contact_person')
        .populate('constructionSiteId', 'name location status type')
        .populate('approverId', 'name surname email');
  
      return {
        inspections,
        total,
        page,
        totalPages
      };
    } catch (error) {
      this.logger.error(`Error getting inspections for final approval: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Give final approval to inspection
   */
  async giveInspectionFinalApproval(
    inspectionId: string,
    approverId: string,
    approvalData: FinalApprovalDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Giving final approval to inspection: ${inspectionId} by approver: ${approverId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel.findById(inspectionId);
      if (!inspection) {
        throw new NotFoundException('Inspection not found');
      }
  
      // Validate approver has permission
      await this.validateFinalApproverPermissions(inspection.businessId, approverId);
  
      // Verify inspection can receive final approval
      if (inspection.status !== 'approved') {
        throw new BadRequestException('Only approved inspections can receive final approval');
      }
  
      if (inspection.completedDate) {
        throw new BadRequestException('Inspection has already received final approval');
      }
  
      // Update inspection with final approval
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        {
          status: 'complete',
          approverId,
          approvedDate: new Date(),
          completedDate: new Date(),
          metadata: {
            ...inspection.metadata,
            finalApprovalNotes: approvalData.notes || '',
            clientNotificationRequired: approvalData.clientNotificationRequired || false,
            scheduledCompletionDate: approvalData.scheduledCompletionDate,
            finalApprovedAt: new Date().toISOString(),
            finalApproverId: approverId,
            finalApprovalAction: 'approved'
          }
        },
        { new: true }
      );
  
      this.logger.log(`Successfully gave final approval to inspection: ${inspectionId}`);
  
      // If client notification is required, mark it for notification
      if (approvalData.clientNotificationRequired) {
        // This could trigger a notification service or email
        this.logger.log(`Client notification required for inspection: ${inspectionId}`);
      }
  
      return {
        success: true,
        message: 'Final approval given successfully',
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error giving final approval: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Override previous review decision
   */
  async overrideInspectionDecision(
    inspectionId: string,
    approverId: string,
    overrideData: OverrideDecisionDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Overriding inspection decision: ${inspectionId} by approver: ${approverId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel.findById(inspectionId);
      if (!inspection) {
        throw new NotFoundException('Inspection not found');
      }
  
      // Validate approver has permission
      await this.validateFinalApproverPermissions(inspection.businessId, approverId);
  
      // Verify approver has override permission
      const hasOverridePermission = await this.validateOverridePermission(inspection.businessId, approverId);
      if (!hasOverridePermission) {
        throw new BadRequestException('You do not have permission to override decisions');
      }
  
      // Validate override data
      if (!overrideData.reason || !overrideData.justification) {
        throw new BadRequestException('Reason and justification are required for override');
      }
  
      // Determine new status based on override decision
      const newStatus = overrideData.decision === 'approve' ? 'complete' : 'rejected';
      const updateData: any = {
        status: newStatus,
        approverId,
        metadata: {
          ...inspection.metadata,
          overrideReason: overrideData.reason,
          overrideJustification: overrideData.justification,
          overridePreviousReview: overrideData.overridePreviousReview || false,
          overriddenAt: new Date().toISOString(),
          overriddenBy: approverId,
          originalStatus: inspection.status,
          originalReviewerId: inspection.reviewerId
        }
      };
  
      // Set appropriate date fields
      if (overrideData.decision === 'approve') {
        updateData.approvedDate = new Date();
        updateData.completedDate = new Date();
        updateData.metadata.finalApprovalAction = 'override_approved';
      } else {
        updateData.metadata.finalApprovalAction = 'override_rejected';
      }
  
      // Update inspection
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        updateData,
        { new: true }
      );
  
      this.logger.log(`Successfully overrode inspection decision: ${inspectionId} to ${overrideData.decision}`);
  
      return {
        success: true,
        message: `Inspection decision overridden to ${overrideData.decision}`,
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error overriding inspection decision: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Get inspection approval history and analytics
   */
  async getApprovalAnalytics(
    businessId: string,
    approverId: string,
    dateRange?: { startDate: Date; endDate: Date }
  ): Promise<any> {
    try {
      this.logger.log(`Getting approval analytics for business: ${businessId}`);
  
      // Validate approver has permission
      await this.validateFinalApproverPermissions(businessId, approverId);
  
      // Build date filter
      const dateFilter: any = {};
      if (dateRange) {
        dateFilter.completedDate = {
          $gte: dateRange.startDate,
          $lte: dateRange.endDate
        };
      }
  
      // Base filter
      const baseFilter = {
        businessId,
        isDeleted: { $ne: true },
        ...dateFilter
      };
  
      // Get overall statistics
      const [
        totalInspections,
        completedInspections,
        pendingApproval,
        criticalIssues,
        overriddenDecisions
      ] = await Promise.all([
        this.qualityInspectionModel.countDocuments(baseFilter),
        this.qualityInspectionModel.countDocuments({ ...baseFilter, status: 'complete' }),
        this.qualityInspectionModel.countDocuments({ 
          businessId, 
          status: 'approved', 
          completedDate: { $exists: false } 
        }),
        this.qualityInspectionModel.countDocuments({ ...baseFilter, hasCriticalIssues: true }),
        this.qualityInspectionModel.countDocuments({ 
          ...baseFilter, 
          'metadata.overriddenBy': { $exists: true } 
        })
      ]);
  
      // Get inspections by type
      const inspectionsByType = await this.qualityInspectionModel.aggregate([
        { $match: baseFilter },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]);
  
      // Get average approval time
      const avgApprovalTime = await this.qualityInspectionModel.aggregate([
        { 
          $match: { 
            ...baseFilter, 
            status: 'complete',
            reviewedDate: { $exists: true },
            completedDate: { $exists: true }
          } 
        },
        {
          $addFields: {
            approvalTimeHours: {
              $divide: [
                { $subtract: ['$completedDate', '$reviewedDate'] },
                1000 * 60 * 60
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            avgHours: { $avg: '$approvalTimeHours' }
          }
        }
      ]);
  
      return {
        summary: {
          totalInspections,
          completedInspections,
          pendingApproval,
          criticalIssues,
          overriddenDecisions,
          completionRate: totalInspections > 0 ? Math.round((completedInspections / totalInspections) * 100) : 0
        },
        inspectionsByType: inspectionsByType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        averageApprovalTimeHours: avgApprovalTime[0]?.avgHours || 0,
        dateRange: dateRange || { startDate: null, endDate: null }
      };
    } catch (error) {
      this.logger.error(`Error getting approval analytics: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Validate final approver permissions
   */
  private async validateFinalApproverPermissions(
    businessId: string,
    approverId: string
  ): Promise<void> {
    // Get business config
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }
  
    const config = business.qualityInspectionConfig || this.getDefaultConfiguration();
  
    // Find employee/approver
    const employee = await this.employeeModel.findOne({
      user_id: approverId,
      businessId,
      isDeleted: { $ne: true }
    });
  
    if (!employee) {
      throw new NotFoundException('Approver not found in business');
    }
  
    // Get approver's quality role and main role
    const qualityRole = employee.metadata?.get('qualityRole');
    const mainRole = employee.metadata?.get('role') || 'business_staff';
  
    // Check if approver is the designated final approver
    const isFinalApprover = config.finalApprover === qualityRole || config.finalApprover === mainRole;
  
    if (!isFinalApprover) {
      throw new BadRequestException('You do not have permission to give final approval');
    }
  }
  
  /**
   * Validate override permission
   */
  private async validateOverridePermission(
    businessId: string,
    approverId: string
  ): Promise<boolean> {
    // Find employee/approver
    const employee = await this.employeeModel.findOne({
      user_id: approverId,
      businessId,
      isDeleted: { $ne: true }
    });
  
    if (!employee) {
      return false;
    }
  
    // Get approver's quality role
    const qualityRole = employee.metadata?.get('qualityRole');
    const mainRole = employee.metadata?.get('role') || 'business_staff';
  
    // Only operations managers and above can override decisions
    const canOverride = [
      'operations_manager', 
      'general_manager', 
      'business_admin'
    ].includes(qualityRole) || [
      'operations_manager', 
      'general_manager', 
      'business_admin'
    ].includes(mainRole);
  
    return canOverride;
  }


  /**
 * Get inspections for a specific client
 */
async getClientInspections(
    clientId: string,
    appProjectId?: string,
    filters: {
      status?: string;
      type?: string;
      dateRange?: { startDate: Date; endDate: Date };
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ inspections: any[]; total: number; page: number; totalPages: number }> {
    try {
      this.logger.log(`Getting inspections for client: ${clientId}`);
  
      const { status, type, dateRange, page = 1, limit = 10 } = filters;
      const skip = (page - 1) * limit;
  
      // Build filter for client inspections
      const filter: any = {
        appClientId: clientId,
        isDeleted: { $ne: true },
        status: { $in: ['complete', 'approved'] } // Only show completed or approved inspections to client
      };
  
      // Add project filter if specified
      if (appProjectId) filter.appProjectId = appProjectId;
  
      // Add additional filters
      if (status) filter.status = status;
      if (type) filter.type = type;
      
      // Add date range filter
      if (dateRange) {
        filter.completedDate = {
          $gte: dateRange.startDate,
          $lte: dateRange.endDate
        };
      }
  
      // Get total count
      const total = await this.qualityInspectionModel.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);
  
      // Get inspections - most recent first
      const inspections = await this.qualityInspectionModel
        .find(filter)
        .sort({ completedDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('inspectorId', 'name surname email')
        .populate('reviewerId', 'name surname email')
        .populate('approverId', 'name surname email')
        .populate('appProjectId', 'name description status')
        .populate('constructionSiteId', 'name location status type')
        .select('-metadata.checklistItems -metadata.photos') // Hide detailed technical data from client
        .lean();
  
      // Format inspections for client view (simplified data)
      const clientFormattedInspections = inspections.map(inspection => ({
        _id: inspection._id,
        type: inspection.type,
        status: inspection.status,
        location: inspection.location,
        inspectionCategory: inspection.inspectionCategory,
        overallRating: inspection.overallRating,
        passRate: inspection.totalItems > 0 ? Math.round((inspection.passedItems / inspection.totalItems) * 100) : null,
        hasCriticalIssues: inspection.hasCriticalIssues,
        inspectionDate: inspection.inspectionDate,
        completedDate: inspection.completedDate,
        project: inspection.appProjectId,
        inspector: inspection.inspectorId,
        reviewer: inspection.reviewerId,
        approver: inspection.approverId,
        clientFeedback: inspection.metadata?.clientFeedback,
        clientRating: inspection.metadata?.clientRating,
        summary: inspection.metadata?.remarks || inspection.metadata?.notes || 'No summary available'
      }));
  
      return {
        inspections: clientFormattedInspections,
        total,
        page,
        totalPages
      };
    } catch (error) {
      this.logger.error(`Error getting client inspections: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Get detailed inspection for client review
   */
  async getInspectionDetailsForClient(
    inspectionId: string,
    clientId: string
  ): Promise<any> {
    try {
      this.logger.log(`Getting inspection details for client: ${clientId}, inspection: ${inspectionId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel
        .findOne({
          _id: inspectionId,
          appClientId: clientId,
          isDeleted: { $ne: true }
        })
        .populate('inspectorId', 'name surname email')
        .populate('reviewerId', 'name surname email')
        .populate('approverId', 'name surname email')
        .populate('appProjectId', 'name description status')
        .lean();
  
      if (!inspection) {
        throw new NotFoundException('Inspection not found or access denied');
      }
  
      // Format for client view - show summary but hide technical details
      const clientView = {
        _id: inspection._id,
        type: inspection.type,
        status: inspection.status,
        location: inspection.location,
        inspectionCategory: inspection.inspectionCategory,
        overallRating: inspection.overallRating,
        passedItems: inspection.passedItems,
        failedItems: inspection.failedItems,
        totalItems: inspection.totalItems,
        passRate: inspection.totalItems > 0 ? Math.round((inspection.passedItems / inspection.totalItems) * 100) : null,
        hasCriticalIssues: inspection.hasCriticalIssues,
        inspectionDate: inspection.inspectionDate,
        completedDate: inspection.completedDate,
        project: inspection.appProjectId,
        inspector: inspection.inspectorId,
        reviewer: inspection.reviewerId,
        approver: inspection.approverId,
        
        // Summary information
        summary: inspection.metadata?.remarks || inspection.metadata?.notes || 'No summary available',
        improvementSuggestions: inspection.metadata?.improvementSuggestions,
        
        // Client-specific data
        clientFeedback: inspection.metadata?.clientFeedback,
        clientRating: inspection.metadata?.clientRating,
        clientApproved: inspection.metadata?.clientApproved,
        clientApprovedAt: inspection.metadata?.clientApprovedAt,
        
        // Photos (if any) - filtered for client viewing
        hasPhotos: inspection.hasPhotos,
        photoCount: inspection.metadata?.photos ? JSON.parse(inspection.metadata.photos).length : 0,
        
        // Status history (simplified)
        timeline: {
          created: inspection.createdAt,
          completed: inspection.completedDate,
          clientReviewed: inspection.metadata?.clientReviewedAt
        }
      };
  
      return clientView;
    } catch (error) {
      this.logger.error(`Error getting inspection details for client: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Client review of inspection
   */
  async reviewInspectionByClient(
    inspectionId: string,
    clientId: string,
    reviewData: ClientReviewDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Client reviewing inspection: ${inspectionId} by client: ${clientId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel.findOne({
        _id: inspectionId,
        appClientId: clientId,
        isDeleted: { $ne: true }
      });
  
      if (!inspection) {
        throw new NotFoundException('Inspection not found or access denied');
      }
  
      // Verify inspection is complete and can be reviewed by client
      if (inspection.status !== 'complete') {
        throw new BadRequestException('Only completed inspections can be reviewed by client');
      }
  
      // Validate review data
      if (!reviewData.feedback) {
        throw new BadRequestException('Feedback is required for client review');
      }
  
      // Update inspection with client review
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        {
          metadata: {
            ...inspection.metadata,
            clientFeedback: reviewData.feedback,
            clientRating: reviewData.rating,
            clientConcerns: reviewData.concerns || [],
            clientRequestedChanges: reviewData.requestedChanges || [],
            clientReviewedAt: new Date().toISOString(),
            clientReviewStatus: 'reviewed'
          }
        },
        { new: true }
      );
  
      this.logger.log(`Successfully recorded client review for inspection: ${inspectionId}`);
  
      return {
        success: true,
        message: 'Client review recorded successfully',
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error recording client review: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Client approval of inspection
   */
  async approveInspectionByClient(
    inspectionId: string,
    clientId: string,
    approvalData: ClientApprovalDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Client ${approvalData.approved ? 'approving' : 'handling'} inspection: ${inspectionId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel.findOne({
        _id: inspectionId,
        appClientId: clientId,
        isDeleted: { $ne: true }
      });
  
      if (!inspection) {
        throw new NotFoundException('Inspection not found or access denied');
      }
  
      // Verify inspection is complete
      if (inspection.status !== 'complete') {
        throw new BadRequestException('Only completed inspections can be approved by client');
      }
  
      // Update inspection with client approval
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        {
          metadata: {
            ...inspection.metadata,
            clientApproved: approvalData.approved,
            clientSignature: approvalData.clientSignature,
            clientApprovalNotes: approvalData.notes,
            clientSatisfactionRating: approvalData.satisfactionRating,
            clientApprovedAt: new Date().toISOString(),
            clientReviewStatus: approvalData.approved ? 'approved' : 'pending_changes'
          }
        },
        { new: true }
      );
  
      const message = approvalData.approved 
        ? 'Inspection approved by client successfully'
        : 'Client approval status updated successfully';
  
      this.logger.log(`Client approval recorded for inspection: ${inspectionId} - ${approvalData.approved ? 'APPROVED' : 'NOT APPROVED'}`);
  
      return {
        success: true,
        message,
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error recording client approval: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Client rejection with requested changes
   */
  async rejectInspectionByClient(
    inspectionId: string,
    clientId: string,
    rejectionData: ClientRejectionDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Client rejecting inspection: ${inspectionId} by client: ${clientId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel.findOne({
        _id: inspectionId,
        appClientId: clientId,
        isDeleted: { $ne: true }
      });
  
      if (!inspection) {
        throw new NotFoundException('Inspection not found or access denied');
      }
  
      // Verify inspection is complete
      if (inspection.status !== 'complete') {
        throw new BadRequestException('Only completed inspections can be rejected by client');
      }
  
      // Validate rejection data
      if (!rejectionData.reason || !rejectionData.requestedChanges?.length) {
        throw new BadRequestException('Reason and requested changes are required for client rejection');
      }
  
      // Update inspection - this should trigger a new inspection or rework
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        {
          metadata: {
            ...inspection.metadata,
            clientApproved: false,
            clientRejectionReason: rejectionData.reason,
            clientRequestedChanges: rejectionData.requestedChanges,
            clientRejectionPriority: rejectionData.priority || 'medium',
            scheduledRevisitDate: rejectionData.scheduledRevisitDate,
            clientRejectedAt: new Date().toISOString(),
            clientReviewStatus: 'rejected',
            requiresRework: true
          }
        },
        { new: true }
      );
  
      this.logger.log(`Client rejection recorded for inspection: ${inspectionId}`);
  
      return {
        success: true,
        message: 'Inspection rejected by client - rework required',
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error recording client rejection: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Get client inspection summary and statistics
   */
  async getClientInspectionSummary(
    clientId: string,
    appProjectId?: string
  ): Promise<any> {
    try {
      this.logger.log(`Getting inspection summary for client: ${clientId}`);
  
      // Base filter
      const baseFilter: any = {
        appClientId: clientId,
        isDeleted: { $ne: true }
      };
  
      if (appProjectId) baseFilter.appProjectId = appProjectId;
  
      // Get summary statistics
      const [
        totalInspections,
        completedInspections,
        clientApprovedCount,
        criticalIssuesCount,
        avgClientRating
      ] = await Promise.all([
        this.qualityInspectionModel.countDocuments(baseFilter),
        this.qualityInspectionModel.countDocuments({ ...baseFilter, status: 'complete' }),
        this.qualityInspectionModel.countDocuments({ 
          ...baseFilter, 
          'metadata.clientApproved': true 
        }),
        this.qualityInspectionModel.countDocuments({ 
          ...baseFilter, 
          hasCriticalIssues: true 
        }),
        this.qualityInspectionModel.aggregate([
          { $match: { ...baseFilter, 'metadata.clientRating': { $exists: true } } },
          { $group: { _id: null, avgRating: { $avg: '$metadata.clientRating' } } }
        ])
      ]);
  
      // Get inspections by status
      const inspectionsByStatus = await this.qualityInspectionModel.aggregate([
        { $match: baseFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);
  
      // Get recent activity
      const recentInspections = await this.qualityInspectionModel
        .find(baseFilter)
        .sort({ completedDate: -1 })
        .limit(5)
        .populate('appProjectId', 'name')
        .select('type status location completedDate overallRating appProjectId')
        .lean();
  
      return {
        summary: {
          totalInspections,
          completedInspections,
          clientApprovedCount,
          criticalIssuesCount,
          approvalRate: completedInspections > 0 ? Math.round((clientApprovedCount / completedInspections) * 100) : 0,
          averageClientRating: avgClientRating[0]?.avgRating || 0
        },
        inspectionsByStatus: inspectionsByStatus.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        recentActivity: recentInspections,
        projectFilter: appProjectId || 'all'
      };
    } catch (error) {
      this.logger.error(`Error getting client inspection summary: ${error.message}`, error.stack);
      throw error;
    }
  }
}