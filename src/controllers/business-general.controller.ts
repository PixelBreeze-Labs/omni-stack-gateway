// src/controllers/business-general.controller.ts
import { 
    Controller, 
    Get, 
    Param, 
    Query, 
    Headers, 
    UnauthorizedException, 
    NotFoundException, 
    Logger, 
    InternalServerErrorException,
    BadRequestException
  } from '@nestjs/common';
  import { 
    ApiTags, 
    ApiOperation, 
    ApiHeader, 
    ApiParam, 
    ApiResponse, 
    ApiQuery 
  } from '@nestjs/swagger';
  import { BusinessGeneralService } from '../services/business-general.service';
  import { BusinessService } from '../services/business.service';
  import {
    SimpleStaffProfileResponse,
    FullStaffProfileResponse,
  } from '../dtos/business-general.dto';
  
  @ApiTags('Business General Management')
  @Controller('business/general')
  @ApiHeader({ 
    name: 'business-x-api-key', 
    required: true, 
    description: 'Business API key for authentication' 
  })
  export class BusinessGeneralController {
    private readonly logger = new Logger(BusinessGeneralController.name);
  
    constructor(
      private readonly businessGeneralService: BusinessGeneralService,
      private readonly businessService: BusinessService
    ) {}
  
  
    // ============================================================================
    // INDIVIDUAL STAFF PROFILE ENDPOINTS
    // ============================================================================
  
    @Get(':staffId/profile/simple')
    @ApiOperation({ 
      summary: 'Get simple staff profile',
      description: 'Retrieve basic staff profile information including contact details, role, and basic performance metrics'
    })
    @ApiParam({ name: 'staffId', description: 'Staff Profile ID' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ 
      status: 200, 
      description: 'Simple staff profile retrieved successfully',
      type: SimpleStaffProfileResponse
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Staff profile not found' })
    async getSimpleStaffProfile(
      @Param('staffId') staffId: string,
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<SimpleStaffProfileResponse> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!staffId) {
          throw new BadRequestException('Staff ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
        return await this.businessGeneralService.getSimpleStaffProfile(staffId, businessId);
      } catch (error) {
        this.logger.error(`Error getting simple staff profile: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to retrieve staff profile');
      }
    }
  
    @Get(':staffId/profile/full')
    @ApiOperation({ 
      summary: 'Get full staff profile',
      description: 'Retrieve comprehensive staff profile including skills, work experience, performance history, goals, and all detailed information'
    })
    @ApiParam({ name: 'staffId', description: 'Staff Profile ID' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ 
      status: 200, 
      description: 'Full staff profile retrieved successfully',
      type: FullStaffProfileResponse
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Staff profile not found' })
    async getFullStaffProfile(
      @Param('staffId') staffId: string,
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<FullStaffProfileResponse> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!staffId) {
          throw new BadRequestException('Staff ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
        return await this.businessGeneralService.getFullStaffProfile(staffId, businessId);
      } catch (error) {
        this.logger.error(`Error getting full staff profile: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to retrieve full staff profile');
      }
    }
  
    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================
  
    /**
     * Validate business API key (reused from business-skills controller)
     */
    private async validateBusinessApiKey(businessId: string, apiKey: string) {
      if (!apiKey) {
        throw new UnauthorizedException('Business API key missing');
      }
      
      const business = await this.businessService.findByIdAndApiKey(businessId, apiKey);
      if (!business) {
        throw new UnauthorizedException('Invalid API key for this business');
      }
      
      return business;
    }
  }