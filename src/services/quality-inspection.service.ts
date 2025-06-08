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
  ): Promise<{ success: boolean; message: string; qualityTeam: any[] }> {
    try {
      this.logger.log(`Assigning quality role ${role} to user ${userId} in business: ${businessId}`);

      // Find business
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      // Validate role
      this.validateRole(role);

      // Find employee by user_id and businessId
      const employee = await this.employeeModel.findOne({ 
        user_id: userId, 
        businessId,
        isDeleted: { $ne: true }
      });

      if (!employee) {
        throw new NotFoundException('Employee not found in this business');
      }

      // Update employee's quality role in metadata
      await this.employeeModel.updateOne(
        { user_id: userId, businessId },
        { 
          $set: { 
            'metadata.qualityRole': role,
            'metadata.qualityAssignedDate': new Date(),
            'metadata.qualityPermissions': this.getDefaultPermissions(role)
          } 
        }
      );

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
      throw error;
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
      type?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ inspections: any[]; total: number; page: number; totalPages: number }> {
    try {
      this.logger.log(`Getting inspections for inspector: ${inspectorId}`);
  
      const { status, type, page = 1, limit = 10 } = filters;
      const skip = (page - 1) * limit;
  
      // Build filter
      const filter: any = {
        inspectorId,
        businessId,
        isDeleted: { $ne: true }
      };
  
      if (status) filter.status = status;
      if (type) filter.type = type;
  
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
}