// src/services/quality-inspection.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business, QualityInspectionConfiguration } from '../schemas/business.schema';
import { QualityInspection } from '../schemas/quality-inspection.schema';
import { Employee } from '../schemas/employee.schema';

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
}