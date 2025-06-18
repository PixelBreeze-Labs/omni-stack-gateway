// src/services/checkin-config.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business } from '../schemas/business.schema';
import { 
  CheckInConfiguration, 
  RoleCheckInSettings, 
  SiteOverrideSettings,
  CheckInMethod,
  CheckInRequirement,
  LocationRequirement,
  UserTerminology
} from '../schemas/business.schema';
import { AuditLogService } from './audit-log.service';
import { AuditAction, ResourceType, AuditSeverity } from '../schemas/audit-log.schema';

@Injectable()
export class CheckInConfigService {
  private readonly logger = new Logger(CheckInConfigService.name);

  constructor(
    @InjectModel(Business.name) private businessModel: Model<Business>,
    private readonly auditLogService: AuditLogService
  ) {}

  /**
   * Get check-in configuration for a business
   */
  async getCheckInConfig(
    businessId: string,
    adminUserId?: string,
    req?: any
  ): Promise<CheckInConfiguration> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');

    try {
      this.logger.log(`Getting check-in config for business: ${businessId}`);

      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      const config = business.checkInConfig || this.getDefaultConfiguration();

      // Log configuration access
      await this.auditLogService.createAuditLog({
        businessId,
        userId: adminUserId,
        action: AuditAction.BUSINESS_CONFIG_VIEWED,
        resourceType: ResourceType.BUSINESS,
        resourceId: businessId,
        resourceName: `Check-in Configuration`,
        success: true,
        severity: AuditSeverity.LOW,
        ipAddress,
        userAgent,
        metadata: {
          configType: 'check_in_configuration',
          hasCustomConfig: !!business.checkInConfig,
          roleCount: config.roleSettings?.length || 0,
          siteOverrideCount: config.siteOverrides?.length || 0
        }
      });

      return config;
    } catch (error) {
      this.logger.error(`Error getting check-in config: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update check-in configuration for a business
   */
  async updateCheckInConfig(
    businessId: string,
    configData: CheckInConfiguration,
    adminUserId?: string,
    req?: any
  ): Promise<{ success: boolean; message: string; config?: CheckInConfiguration; error?: any }> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      this.logger.log(`Updating check-in config for business: ${businessId}`);

      // Validate business exists
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        return {
          success: false,
          message: 'Business not found',
          error: { code: 'BUSINESS_NOT_FOUND', details: { businessId } }
        };
      }

      // Validate configuration
      const validationResult = this.validateConfiguration(configData);
      if (!validationResult.isValid) {
        await this.auditLogService.createAuditLog({
          businessId,
          userId: adminUserId,
          action: AuditAction.BUSINESS_CONFIG_UPDATED,
          resourceType: ResourceType.BUSINESS,
          resourceId: businessId,
          resourceName: `Check-in Configuration Update`,
          success: false,
          errorMessage: validationResult.error,
          severity: AuditSeverity.MEDIUM,
          ipAddress,
          userAgent,
          metadata: {
            configType: 'check_in_configuration',
            validationErrors: validationResult.details,
            operationDuration: Date.now() - startTime
          }
        });

        return {
          success: false,
          message: validationResult.error,
          error: { 
            code: 'VALIDATION_ERROR', 
            details: validationResult.details 
          }
        };
      }

      // Store old configuration for audit
      const oldConfig = business.checkInConfig;

      // Update configuration
      const updateResult = await this.businessModel.findByIdAndUpdate(
        businessId,
        { $set: { checkInConfig: configData } },
        { new: true, runValidators: true }
      );

      if (!updateResult) {
        return {
          success: false,
          message: 'Failed to update configuration',
          error: { code: 'UPDATE_FAILED', details: { businessId } }
        };
      }

      // Log successful update
      await this.auditLogService.createAuditLog({
        businessId,
        userId: adminUserId,
        action: AuditAction.BUSINESS_CONFIG_UPDATED,
        resourceType: ResourceType.BUSINESS,
        resourceId: businessId,
        resourceName: `Check-in Configuration Updated`,
        success: true,
        severity: AuditSeverity.MEDIUM,
        ipAddress,
        userAgent,
        oldValues: oldConfig,
        newValues: configData,
        changedFields: this.getChangedFields(oldConfig, configData),
        metadata: {
          configType: 'check_in_configuration',
          businessName: business.name,
          roleSettingsCount: configData.roleSettings?.length || 0,
          siteOverrideCount: configData.siteOverrides?.length || 0,
          enabledFeatures: {
            geofencing: configData.roleSettings?.some(r => 
              r.methods.autoGeofence === CheckInRequirement.REQUIRE || 
              r.methods.autoGeofence === CheckInRequirement.ALLOW
            ),
            qrCode: configData.roleSettings?.some(r => 
              r.methods.qrCode === CheckInRequirement.REQUIRE || 
              r.methods.qrCode === CheckInRequirement.ALLOW
            ),
            nfc: configData.roleSettings?.some(r => 
              r.methods.nfcTap === CheckInRequirement.REQUIRE || 
              r.methods.nfcTap === CheckInRequirement.ALLOW
            )
          },
          operationDuration: Date.now() - startTime
        }
      });

      this.logger.log(`Successfully updated check-in config for business: ${businessId}`);

      return {
        success: true,
        message: 'Check-in configuration updated successfully',
        config: updateResult.checkInConfig
      };

    } catch (error) {
      // Log error
      await this.auditLogService.createAuditLog({
        businessId,
        userId: adminUserId,
        action: AuditAction.BUSINESS_CONFIG_UPDATED,
        resourceType: ResourceType.BUSINESS,
        resourceId: businessId,
        resourceName: `Check-in Configuration Update`,
        success: false,
        errorMessage: 'Unexpected error during configuration update',
        severity: AuditSeverity.HIGH,
        ipAddress,
        userAgent,
        metadata: {
          configType: 'check_in_configuration',
          errorReason: 'unexpected_error',
          errorName: error.name,
          errorMessage: error.message,
          operationDuration: Date.now() - startTime
        }
      });

      this.logger.error(`Error updating check-in config: ${error.message}`, error.stack);
      
      return {
        success: false,
        message: `Failed to update check-in configuration: ${error.message}`,
        error: {
          code: 'INTERNAL_ERROR',
          details: { errorName: error.name, errorMessage: error.message }
        }
      };
    }
  }

  /**
   * Update role-specific settings
   */
  async updateRoleSettings(
    businessId: string,
    roleSettings: RoleCheckInSettings,
    adminUserId?: string,
    req?: any
  ): Promise<{ success: boolean; message: string; roleSettings?: RoleCheckInSettings[]; error?: any }> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      this.logger.log(`Updating role settings for business: ${businessId}, role: ${roleSettings.roleName}`);

      const business = await this.businessModel.findById(businessId);
      if (!business) {
        return {
          success: false,
          message: 'Business not found',
          error: { code: 'BUSINESS_NOT_FOUND', details: { businessId } }
        };
      }

      // Get current config or default
      const currentConfig = business.checkInConfig || this.getDefaultConfiguration();
      
      // Find and update the role settings
      const roleIndex = currentConfig.roleSettings.findIndex(r => r.roleName === roleSettings.roleName);
      
      if (roleIndex === -1) {
        // Add new role settings
        currentConfig.roleSettings.push(roleSettings);
      } else {
        // Update existing role settings
        currentConfig.roleSettings[roleIndex] = roleSettings;
      }

      // Update the business
      const updateResult = await this.businessModel.findByIdAndUpdate(
        businessId,
        { $set: { checkInConfig: currentConfig } },
        { new: true, runValidators: true }
      );

      if (!updateResult) {
        return {
          success: false,
          message: 'Failed to update role settings',
          error: { code: 'UPDATE_FAILED', details: { businessId } }
        };
      }

      // Log successful update
      await this.auditLogService.createAuditLog({
        businessId,
        userId: adminUserId,
        action: AuditAction.BUSINESS_CONFIG_UPDATED,
        resourceType: ResourceType.BUSINESS,
        resourceId: businessId,
        resourceName: `Role Check-in Settings: ${roleSettings.roleName}`,
        success: true,
        severity: AuditSeverity.MEDIUM,
        ipAddress,
        userAgent,
        metadata: {
          configType: 'role_checkin_settings',
          roleName: roleSettings.roleName,
          enabledMethods: Object.entries(roleSettings.methods)
            .filter(([_, requirement]) => requirement !== CheckInRequirement.DISABLE)
            .map(([method, _]) => method),
          locationRequirement: roleSettings.locationRequirement,
          primaryMethod: roleSettings.primaryMethod,
          terminology: roleSettings.terminology,
          operationDuration: Date.now() - startTime
        }
      });

      return {
        success: true,
        message: `Successfully updated check-in settings for role: ${roleSettings.roleName}`,
        roleSettings: updateResult.checkInConfig.roleSettings
      };

    } catch (error) {
      this.logger.error(`Error updating role settings: ${error.message}`, error.stack);
      
      return {
        success: false,
        message: `Failed to update role settings: ${error.message}`,
        error: {
          code: 'INTERNAL_ERROR',
          details: { errorName: error.name, errorMessage: error.message }
        }
      };
    }
  }

  /**
   * Create site-specific override
   */
  async createSiteOverride(
    businessId: string,
    siteOverride: SiteOverrideSettings,
    adminUserId?: string,
    req?: any
  ): Promise<{ success: boolean; message: string; siteOverride?: SiteOverrideSettings; error?: any }> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      this.logger.log(`Creating site override for business: ${businessId}, site: ${siteOverride.siteId}`);

      const business = await this.businessModel.findById(businessId);
      if (!business) {
        return {
          success: false,
          message: 'Business not found',
          error: { code: 'BUSINESS_NOT_FOUND', details: { businessId } }
        };
      }

      // Get current config or default
      const currentConfig = business.checkInConfig || this.getDefaultConfiguration();
      
      // Check if site override already exists
      const existingIndex = currentConfig.siteOverrides.findIndex(s => s.siteId === siteOverride.siteId);
      
      if (existingIndex !== -1) {
        return {
          success: false,
          message: `Site override already exists for site: ${siteOverride.siteId}`,
          error: { 
            code: 'SITE_ALREADY_EXISTS', 
            details: { siteId: siteOverride.siteId } 
          }
        };
      }

      // Add new site override
      currentConfig.siteOverrides.push(siteOverride);

      // Update the business
      const updateResult = await this.businessModel.findByIdAndUpdate(
        businessId,
        { $set: { checkInConfig: currentConfig } },
        { new: true, runValidators: true }
      );

      if (!updateResult) {
        return {
          success: false,
          message: 'Failed to create site override',
          error: { code: 'UPDATE_FAILED', details: { businessId } }
        };
      }

      // Log successful creation
      await this.auditLogService.createAuditLog({
        businessId,
        userId: adminUserId,
        action: AuditAction.BUSINESS_CONFIG_UPDATED,
        resourceType: ResourceType.BUSINESS,
        resourceId: businessId,
        resourceName: `Site Override Created: ${siteOverride.siteName}`,
        success: true,
        severity: AuditSeverity.MEDIUM,
        ipAddress,
        userAgent,
        metadata: {
          configType: 'site_override_created',
          siteId: siteOverride.siteId,
          siteName: siteOverride.siteName,
          overrides: siteOverride.overrides,
          operationDuration: Date.now() - startTime
        }
      });

      return {
        success: true,
        message: `Successfully created site override for: ${siteOverride.siteName}`,
        siteOverride
      };

    } catch (error) {
      this.logger.error(`Error creating site override: ${error.message}`, error.stack);
      
      return {
        success: false,
        message: `Failed to create site override: ${error.message}`,
        error: {
          code: 'INTERNAL_ERROR',
          details: { errorName: error.name, errorMessage: error.message }
        }
      };
    }
  }

  /**
   * Delete site-specific override
   */
  async deleteSiteOverride(
    businessId: string,
    siteId: string,
    adminUserId?: string,
    req?: any
  ): Promise<{ success: boolean; message: string; siteOverrides?: SiteOverrideSettings[]; error?: any }> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      this.logger.log(`Deleting site override for business: ${businessId}, site: ${siteId}`);

      const business = await this.businessModel.findById(businessId);
      if (!business) {
        return {
          success: false,
          message: 'Business not found',
          error: { code: 'BUSINESS_NOT_FOUND', details: { businessId } }
        };
      }

      // Get current config
      const currentConfig = business.checkInConfig || this.getDefaultConfiguration();
      
      // Find site override
      const siteIndex = currentConfig.siteOverrides.findIndex(s => s.siteId === siteId);
      
      if (siteIndex === -1) {
        return {
          success: false,
          message: `Site override not found for site: ${siteId}`,
          error: { 
            code: 'SITE_OVERRIDE_NOT_FOUND', 
            details: { siteId } 
          }
        };
      }

      // Store deleted site info for audit
      const deletedSite = currentConfig.siteOverrides[siteIndex];
      
      // Remove site override
      currentConfig.siteOverrides.splice(siteIndex, 1);

      // Update the business
      const updateResult = await this.businessModel.findByIdAndUpdate(
        businessId,
        { $set: { checkInConfig: currentConfig } },
        { new: true, runValidators: true }
      );

      if (!updateResult) {
        return {
          success: false,
          message: 'Failed to delete site override',
          error: { code: 'UPDATE_FAILED', details: { businessId } }
        };
      }

      // Log successful deletion
      await this.auditLogService.createAuditLog({
        businessId,
        userId: adminUserId,
        action: AuditAction.BUSINESS_CONFIG_UPDATED,
        resourceType: ResourceType.BUSINESS,
        resourceId: businessId,
        resourceName: `Site Override Deleted: ${deletedSite.siteName}`,
        success: true,
        severity: AuditSeverity.MEDIUM,
        ipAddress,
        userAgent,
        metadata: {
          configType: 'site_override_deleted',
          deletedSiteId: deletedSite.siteId,
          deletedSiteName: deletedSite.siteName,
          deletedOverrides: deletedSite.overrides,
          remainingOverrides: updateResult.checkInConfig.siteOverrides.length,
          operationDuration: Date.now() - startTime
        }
      });

      return {
        success: true,
        message: `Successfully deleted site override for: ${deletedSite.siteName}`,
        siteOverrides: updateResult.checkInConfig.siteOverrides
      };

    } catch (error) {
      this.logger.error(`Error deleting site override: ${error.message}`, error.stack);
      
      return {
        success: false,
        message: `Failed to delete site override: ${error.message}`,
        error: {
          code: 'INTERNAL_ERROR',
          details: { errorName: error.name, errorMessage: error.message }
        }
      };
    }
  }

 /**
 * Get default configuration template
 */
getDefaultConfiguration(): CheckInConfiguration {
    return {
      enabled: true,
      defaultJobSiteRadius: 100,
      autoCheckInTimeout: 15,
      allowFallbackWithoutLocation: true,
      requireLocationOverride: false,
      roleSettings: [
        {
          roleName: 'field_worker',
          methods: {
            appButton: CheckInRequirement.REQUIRE,
            qrCode: CheckInRequirement.ALLOW,
            nfcTap: CheckInRequirement.ALLOW,
            autoGeofence: CheckInRequirement.ALLOW
          },
          locationRequirement: LocationRequirement.ALWAYS,
          primaryMethod: CheckInMethod.APP_BUTTON,
          terminology: UserTerminology.CLOCK_IN,
          enhancedVerification: false,
          allowOverride: true
        },
        {
          roleName: 'office_worker',
          methods: {
            appButton: CheckInRequirement.REQUIRE,
            qrCode: CheckInRequirement.DISABLE,
            nfcTap: CheckInRequirement.DISABLE,
            autoGeofence: CheckInRequirement.DISABLE
          },
          locationRequirement: LocationRequirement.OPTIONAL,
          primaryMethod: CheckInMethod.APP_BUTTON,
          terminology: UserTerminology.CHECK_IN,
          enhancedVerification: false,
          allowOverride: true
        },
        {
          roleName: 'project_manager',
          methods: {
            appButton: CheckInRequirement.REQUIRE,
            qrCode: CheckInRequirement.ALLOW,
            nfcTap: CheckInRequirement.ALLOW,
            autoGeofence: CheckInRequirement.ALLOW
          },
          locationRequirement: LocationRequirement.OPTIONAL,
          primaryMethod: CheckInMethod.APP_BUTTON,
          terminology: UserTerminology.CHECK_IN,
          enhancedVerification: false,
          allowOverride: true
        },
        {
          roleName: 'operations_manager',
          methods: {
            appButton: CheckInRequirement.REQUIRE,
            qrCode: CheckInRequirement.ALLOW,
            nfcTap: CheckInRequirement.ALLOW,
            autoGeofence: CheckInRequirement.ALLOW
          },
          locationRequirement: LocationRequirement.OPTIONAL,
          primaryMethod: CheckInMethod.APP_BUTTON,
          terminology: UserTerminology.CHECK_IN,
          enhancedVerification: true,
          allowOverride: true
        }
      ],
      siteOverrides: [],
      allowManualLocationEntry: true,
      requireReasonForOverride: false,
      logAllAttempts: true,
      enableOfflineMode: true,
      syncFrequencyMinutes: 15,
      enableLocationHistory: true,
      maxLocationHistoryDays: 30
    };
  }

  /**
   * Validate configuration
   */
  private validateConfiguration(config: CheckInConfiguration): { isValid: boolean; error?: string; details?: any } {
    const errors = [];

    // Validate required fields
    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    if (!config.defaultJobSiteRadius || config.defaultJobSiteRadius < 10 || config.defaultJobSiteRadius > 1000) {
      errors.push('defaultJobSiteRadius must be between 10 and 1000 meters');
    }

    if (!config.autoCheckInTimeout || config.autoCheckInTimeout < 1 || config.autoCheckInTimeout > 60) {
      errors.push('autoCheckInTimeout must be between 1 and 60 minutes');
    }

    // Validate role settings
    if (!config.roleSettings || !Array.isArray(config.roleSettings)) {
      errors.push('roleSettings must be an array');
    } else {
      config.roleSettings.forEach((role, index) => {
        if (!role.roleName) {
          errors.push(`roleSettings[${index}].roleName is required`);
        }
        
        if (!role.methods) {
          errors.push(`roleSettings[${index}].methods is required`);
        } else {
          const validRequirements = Object.values(CheckInRequirement);
          Object.entries(role.methods).forEach(([method, requirement]) => {
            if (!validRequirements.includes(requirement as CheckInRequirement)) {
              errors.push(`roleSettings[${index}].methods.${method} must be one of: ${validRequirements.join(', ')}`);
            }
          });
        }

        if (!Object.values(LocationRequirement).includes(role.locationRequirement)) {
          errors.push(`roleSettings[${index}].locationRequirement must be one of: ${Object.values(LocationRequirement).join(', ')}`);
        }

        if (!Object.values(CheckInMethod).includes(role.primaryMethod)) {
          errors.push(`roleSettings[${index}].primaryMethod must be one of: ${Object.values(CheckInMethod).join(', ')}`);
        }

        if (!Object.values(UserTerminology).includes(role.terminology)) {
          errors.push(`roleSettings[${index}].terminology must be one of: ${Object.values(UserTerminology).join(', ')}`);
        }
      });
    }

    // Validate site overrides
    if (config.siteOverrides && Array.isArray(config.siteOverrides)) {
      config.siteOverrides.forEach((site, index) => {
        if (!site.siteId) {
          errors.push(`siteOverrides[${index}].siteId is required`);
        }
        if (!site.siteName) {
          errors.push(`siteOverrides[${index}].siteName is required`);
        }
      });
    }

    if (errors.length > 0) {
      return {
        isValid: false,
        error: `Configuration validation failed: ${errors.join(', ')}`,
        details: errors
      };
    }

    return { isValid: true };
  }

  /**
   * Helper method to extract IP address from request
   */
  private extractIpAddress(req: any): string {
    return (
      req?.headers?.['x-forwarded-for'] ||
      req?.headers?.['x-real-ip'] ||
      req?.connection?.remoteAddress ||
      req?.socket?.remoteAddress ||
      'unknown'
    ).split(',')[0].trim();
  }

  /**
   * Helper method to identify changed fields
   */
  private getChangedFields(oldConfig: any, newConfig: any): string[] {
    const changedFields = [];
    
    if (!oldConfig) return ['entire_configuration'];

    // Compare top-level fields
    const topLevelFields = [
      'enabled', 'defaultJobSiteRadius', 'autoCheckInTimeout', 
      'allowFallbackWithoutLocation', 'requireLocationOverride',
      'allowManualLocationEntry', 'requireReasonForOverride',
      'logAllAttempts', 'enableOfflineMode', 'syncFrequencyMinutes',
      'enableLocationHistory', 'maxLocationHistoryDays'
    ];

    topLevelFields.forEach(field => {
      if (oldConfig[field] !== newConfig[field]) {
        changedFields.push(field);
      }
    });

    // Compare role settings
    if (JSON.stringify(oldConfig.roleSettings) !== JSON.stringify(newConfig.roleSettings)) {
      changedFields.push('roleSettings');
    }

    // Compare site overrides
    if (JSON.stringify(oldConfig.siteOverrides) !== JSON.stringify(newConfig.siteOverrides)) {
      changedFields.push('siteOverrides');
    }

    return changedFields;
  }
}