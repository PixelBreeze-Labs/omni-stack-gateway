// src/controllers/business-checkin-config.controller.ts
import { 
    Controller, 
    Get, 
    Put, 
    Post,
    Delete,
    Body, 
    Query,
    Param,
    UseGuards,
    Request,
    Logger,
    BadRequestException,
    NotFoundException,
    InternalServerErrorException
  } from '@nestjs/common';
  import { 
    ApiTags, 
    ApiOperation, 
    ApiHeader, 
    ApiQuery, 
    ApiBody, 
    ApiResponse,
    ApiParam
  } from '@nestjs/swagger';
  import { BusinessAuthGuard } from '../guards/business-auth.guard';
  import { CheckInConfigService } from '../services/checkin-config.service';
  import { CheckInConfiguration, RoleCheckInSettings, SiteOverrideSettings } from '../schemas/business.schema';
  
  // DTOs
  class UpdateCheckInConfigDto {
    enabled: boolean;
    defaultJobSiteRadius: number;
    autoCheckInTimeout: number;
    allowFallbackWithoutLocation: boolean;
    requireLocationOverride: boolean;
    roleSettings: RoleCheckInSettings[];
    siteOverrides: SiteOverrideSettings[];
    allowManualLocationEntry: boolean;
    requireReasonForOverride: boolean;
    logAllAttempts: boolean;
    enableOfflineMode: boolean;
    syncFrequencyMinutes: number;
    enableLocationHistory: boolean;
    maxLocationHistoryDays: number;
  }
  
  class UpdateRoleSettingsDto {
    roleName: string;
    methods: {
      appButton: string;
      qrCode: string;
      nfcTap: string;
      autoGeofence: string;
    };
    locationRequirement: string;
    primaryMethod: string;
    terminology: string;
    enhancedVerification: boolean;
    allowOverride: boolean;
  }
  
  class CreateSiteOverrideDto {
    siteId: string;
    siteName: string;
    overrides: {
      forceMethod?: string;
      locationAccuracy?: number;
      requirePhoto?: boolean;
      requireSignature?: boolean;
      customRadius?: number;
    };
  }
  
  @ApiTags('Business Check-In Configuration - Admin')
  @Controller('business/checkin-config')
  @UseGuards(BusinessAuthGuard)
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class BusinessCheckInConfigController {
    private readonly logger = new Logger(BusinessCheckInConfigController.name);
  
    constructor(
      private readonly checkInConfigService: CheckInConfigService
    ) {}
  
    @Get()
    @ApiOperation({ summary: 'Get complete check-in configuration' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ status: 200, description: 'Configuration retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getCheckInConfig(
      @Query('businessId') businessId: string,
      @Request() req: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Getting check-in config for business: ${businessId}`);
  
        const adminUserId = req.business?.adminUserId;
        const config = await this.checkInConfigService.getCheckInConfig(
          businessId,
          adminUserId,
          req
        );
  
        return {
          status: 'success',
          message: 'Check-in configuration retrieved successfully',
          data: { config }
        };
      } catch (error) {
        this.logger.error(`Error getting check-in config: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get check-in configuration');
      }
    }
  
    @Put()
    @ApiOperation({ summary: 'Update complete check-in configuration' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiBody({ type: UpdateCheckInConfigDto })
    @ApiResponse({ status: 200, description: 'Configuration updated successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid configuration' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async updateCheckInConfig(
      @Query('businessId') businessId: string,
      @Body() configData: UpdateCheckInConfigDto,
      @Request() req: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Updating check-in config for business: ${businessId}`);
  
        const adminUserId = req.business?.adminUserId;
        const result = await this.checkInConfigService.updateCheckInConfig(
          businessId,
          configData as CheckInConfiguration,
          adminUserId,
          req
        );
  
        if (!result.success) {
          this.logger.warn(`Check-in config update failed: ${result.message}`, result.error);
          
          if (result.error?.code === 'BUSINESS_NOT_FOUND') {
            throw new NotFoundException(result.message);
          } else if (result.error?.code === 'VALIDATION_ERROR') {
            throw new BadRequestException(result.message);
          } else {
            throw new InternalServerErrorException(result.message);
          }
        }
  
        return {
          status: 'success',
          message: result.message,
          data: { config: result.config }
        };
      } catch (error) {
        this.logger.error(`Error updating check-in config: ${error.message}`, error.stack);
        if (error instanceof BadRequestException || 
            error instanceof NotFoundException || 
            error instanceof InternalServerErrorException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to update check-in configuration');
      }
    }
  
    @Put('role-settings')
    @ApiOperation({ summary: 'Update role-specific check-in settings' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiBody({ type: UpdateRoleSettingsDto })
    @ApiResponse({ status: 200, description: 'Role settings updated successfully' })
    async updateRoleSettings(
      @Query('businessId') businessId: string,
      @Body() roleData: UpdateRoleSettingsDto,
      @Request() req: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Updating role settings for business: ${businessId}, role: ${roleData.roleName}`);
  
        const adminUserId = req.business?.adminUserId;
        const result = await this.checkInConfigService.updateRoleSettings(
          businessId,
          roleData as RoleCheckInSettings,
          adminUserId,
          req
        );
  
        if (!result.success) {
          if (result.error?.code === 'BUSINESS_NOT_FOUND') {
            throw new NotFoundException(result.message);
          } else if (result.error?.code === 'ROLE_NOT_FOUND') {
            throw new NotFoundException(result.message);
          } else if (result.error?.code === 'VALIDATION_ERROR') {
            throw new BadRequestException(result.message);
          } else {
            throw new InternalServerErrorException(result.message);
          }
        }
  
        return {
          status: 'success',
          message: result.message,
          data: { roleSettings: result.roleSettings }
        };
      } catch (error) {
        this.logger.error(`Error updating role settings: ${error.message}`, error.stack);
        if (error instanceof BadRequestException || 
            error instanceof NotFoundException || 
            error instanceof InternalServerErrorException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to update role settings');
      }
    }
  
    @Post('site-override')
    @ApiOperation({ summary: 'Create site-specific override settings' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiBody({ type: CreateSiteOverrideDto })
    @ApiResponse({ status: 201, description: 'Site override created successfully' })
    async createSiteOverride(
      @Query('businessId') businessId: string,
      @Body() siteData: CreateSiteOverrideDto,
      @Request() req: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Creating site override for business: ${businessId}, site: ${siteData.siteId}`);
  
        const adminUserId = req.business?.adminUserId;
        const result = await this.checkInConfigService.createSiteOverride(
          businessId,
          siteData as SiteOverrideSettings,
          adminUserId,
          req
        );
  
        if (!result.success) {
          if (result.error?.code === 'BUSINESS_NOT_FOUND') {
            throw new NotFoundException(result.message);
          } else if (result.error?.code === 'SITE_ALREADY_EXISTS') {
            throw new BadRequestException(result.message);
          } else if (result.error?.code === 'VALIDATION_ERROR') {
            throw new BadRequestException(result.message);
          } else {
            throw new InternalServerErrorException(result.message);
          }
        }
  
        return {
          status: 'success',
          message: result.message,
          data: { siteOverride: result.siteOverride }
        };
      } catch (error) {
        this.logger.error(`Error creating site override: ${error.message}`, error.stack);
        if (error instanceof BadRequestException || 
            error instanceof NotFoundException || 
            error instanceof InternalServerErrorException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to create site override');
      }
    }
  
    @Delete('site-override/:siteId')
    @ApiOperation({ summary: 'Delete site-specific override settings' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiParam({ name: 'siteId', description: 'Site ID to remove override for' })
    @ApiResponse({ status: 200, description: 'Site override deleted successfully' })
    async deleteSiteOverride(
      @Query('businessId') businessId: string,
      @Param('siteId') siteId: string,
      @Request() req: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!siteId) {
          throw new BadRequestException('Site ID is required');
        }
  
        this.logger.log(`Deleting site override for business: ${businessId}, site: ${siteId}`);
  
        const adminUserId = req.business?.adminUserId;
        const result = await this.checkInConfigService.deleteSiteOverride(
          businessId,
          siteId,
          adminUserId,
          req
        );
  
        if (!result.success) {
          if (result.error?.code === 'BUSINESS_NOT_FOUND') {
            throw new NotFoundException(result.message);
          } else if (result.error?.code === 'SITE_OVERRIDE_NOT_FOUND') {
            throw new NotFoundException(result.message);
          } else {
            throw new InternalServerErrorException(result.message);
          }
        }
  
        return {
          status: 'success',
          message: result.message,
          data: { remainingSiteOverrides: result.siteOverrides }
        };
      } catch (error) {
        this.logger.error(`Error deleting site override: ${error.message}`, error.stack);
        if (error instanceof BadRequestException || 
            error instanceof NotFoundException || 
            error instanceof InternalServerErrorException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to delete site override');
      }
    }
  
    @Get('defaults')
    @ApiOperation({ summary: 'Get default configuration template' })
    @ApiResponse({ status: 200, description: 'Default configuration retrieved successfully' })
    async getDefaultConfig() {
      try {
        this.logger.log('Getting default check-in configuration template');
  
        const defaultConfig = await this.checkInConfigService.getDefaultConfiguration();
  
        return {
          status: 'success',
          message: 'Default configuration retrieved successfully',
          data: { defaultConfig }
        };
      } catch (error) {
        this.logger.error(`Error getting default config: ${error.message}`, error.stack);
        throw new InternalServerErrorException('Failed to get default configuration');
      }
    }
  }