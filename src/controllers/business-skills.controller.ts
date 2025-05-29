// src/controllers/business-skills.controller.ts
import { 
  Controller, 
  Get, 
  Put, 
  Post,
  Body, 
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
  ApiBody, 
  ApiResponse, 
  ApiQuery 
} from '@nestjs/swagger';
import { BusinessSkillsService } from '../services/business-skills.service';
import { BusinessService } from '../services/business.service';
import {
  UpdateBusinessSkillConfigDto,
  BusinessSkillConfigResponse,
  PendingSkillAssessmentResponse,
  SkillAnalyticsResponse,
  ApproveSkillAssessmentDto,
  RejectSkillAssessmentDto,
  BulkSkillAssessmentActionDto,
  SkillAssessmentFilterDto,
  BusinessConfigResponse,
  UpdateBusinessConfigDto,
  ConfigurationOptionsResponse
} from '../dtos/business-skills.dto';
import { SkillAssessment } from '../schemas/skill-assessment.schema';

@ApiTags('Business Skills Management')
@Controller('business/skills')
@ApiHeader({ 
  name: 'business-x-api-key', 
  required: true, 
  description: 'Business API key for authentication' 
})
export class BusinessSkillsController {
  private readonly logger = new Logger(BusinessSkillsController.name);

  constructor(
    private readonly businessSkillsService: BusinessSkillsService,
    private readonly businessService: BusinessService
  ) {}

  // ============================================================================
  // SKILL CONFIGURATION ENDPOINTS
  // ============================================================================

  @Get('config')
  @ApiOperation({ 
    summary: 'Get business skill configuration',
    description: 'Retrieve current skill requirements, departments, and configuration settings for the business'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Skill configuration retrieved successfully',
    type: BusinessSkillConfigResponse 
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async getSkillConfiguration(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<BusinessSkillConfigResponse> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessSkillsService.getSkillConfiguration(businessId);
    } catch (error) {
      this.logger.error(`Error getting skill configuration: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve skill configuration');
    }
  }

  @Put('config')
  @ApiOperation({ 
    summary: 'Update business skill configuration',
    description: 'Update skill requirements, custom skills, departments, and system settings. Changes may trigger skill re-assessment for employees.'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiBody({ type: UpdateBusinessSkillConfigDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Skill configuration updated successfully',
    type: BusinessSkillConfigResponse 
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid configuration data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async updateSkillConfiguration(
    @Query('businessId') businessId: string,
    @Body() updateDto: UpdateBusinessSkillConfigDto,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<BusinessSkillConfigResponse> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessSkillsService.updateSkillConfiguration(businessId, updateDto);
    } catch (error) {
      this.logger.error(`Error updating skill configuration: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update skill configuration');
    }
  }

  // ============================================================================
  // SKILL ASSESSMENT MANAGEMENT ENDPOINTS
  // ============================================================================

  @Get('assessments')
  @ApiOperation({ 
    summary: 'Get pending skill assessments',
    description: 'Retrieve skill assessments that require business approval, with filtering and pagination options'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by assessment status' })
  @ApiQuery({ name: 'trigger', required: false, description: 'Filter by assessment trigger' })
  @ApiQuery({ name: 'department', required: false, description: 'Filter by employee department' })
  @ApiQuery({ name: 'role', required: false, description: 'Filter by employee role' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of results per page (default: 50)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Number of results to skip (default: 0)' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field (createdAt, dueDate, employeeName)' })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order (asc, desc)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Skill assessments retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        assessments: {
          type: 'array',
          items: { $ref: '#/components/schemas/PendingSkillAssessmentResponse' }
        },
        total: { type: 'number' },
        hasMore: { type: 'boolean' }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async getPendingSkillAssessments(
    @Query('businessId') businessId: string,
    @Query() filters: SkillAssessmentFilterDto,
    @Headers('business-x-api-key') apiKey: string
  ) {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessSkillsService.getPendingSkillAssessments(businessId, filters);
    } catch (error) {
      this.logger.error(`Error getting skill assessments: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve skill assessments');
    }
  }

  @Put('assessments/:assessmentId/approve')
  @ApiOperation({ 
    summary: 'Approve skill assessment',
    description: 'Approve specific skills from an employee assessment and apply them to the staff profile'
  })
  @ApiParam({ name: 'assessmentId', description: 'Skill assessment ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiQuery({ name: 'reviewerId', required: true, description: 'ID of user approving the assessment' })
  @ApiBody({ type: ApproveSkillAssessmentDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Skill assessment approved successfully',
    type: SkillAssessment 
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid approval data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Skill assessment not found' })
  async approveSkillAssessment(
    @Param('assessmentId') assessmentId: string,
    @Query('businessId') businessId: string,
    @Query('reviewerId') reviewerId: string,
    @Body() approveDto: ApproveSkillAssessmentDto,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<SkillAssessment> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }
      
      if (!reviewerId) {
        throw new BadRequestException('Reviewer ID is required');
      }

      if (!approveDto.approvedSkills || approveDto.approvedSkills.length === 0) {
        throw new BadRequestException('At least one skill must be approved');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      
      return await this.businessSkillsService.approveSkillAssessment(
        assessmentId, 
        businessId, 
        approveDto, 
        reviewerId
      );
    } catch (error) {
      this.logger.error(`Error approving skill assessment: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to approve skill assessment');
    }
  }

  @Put('assessments/:assessmentId/reject')
  @ApiOperation({ 
    summary: 'Reject skill assessment',
    description: 'Reject an employee skill assessment with a reason'
  })
  @ApiParam({ name: 'assessmentId', description: 'Skill assessment ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiQuery({ name: 'reviewerId', required: true, description: 'ID of user rejecting the assessment' })
  @ApiBody({ type: RejectSkillAssessmentDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Skill assessment rejected successfully',
    type: SkillAssessment 
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid rejection data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Skill assessment not found' })
  async rejectSkillAssessment(
    @Param('assessmentId') assessmentId: string,
    @Query('businessId') businessId: string,
    @Query('reviewerId') reviewerId: string,
    @Body() rejectDto: RejectSkillAssessmentDto,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<SkillAssessment> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }
      
      if (!reviewerId) {
        throw new BadRequestException('Reviewer ID is required');
      }

      if (!rejectDto.reason) {
        throw new BadRequestException('Rejection reason is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      
      return await this.businessSkillsService.rejectSkillAssessment(
        assessmentId, 
        businessId, 
        rejectDto, 
        reviewerId
      );
    } catch (error) {
      this.logger.error(`Error rejecting skill assessment: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to reject skill assessment');
    }
  }

  @Post('assessments/bulk')
  @ApiOperation({ 
    summary: 'Bulk process skill assessments',
    description: 'Approve or reject multiple skill assessments in a single operation'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiQuery({ name: 'reviewerId', required: true, description: 'ID of user processing the assessments' })
  @ApiBody({ type: BulkSkillAssessmentActionDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Bulk processing completed',
    schema: {
      type: 'object',
      properties: {
        processed: { type: 'number' },
        failed: { type: 'number' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              success: { type: 'boolean' },
              error: { type: 'string' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid bulk action data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async bulkProcessAssessments(
    @Query('businessId') businessId: string,
    @Query('reviewerId') reviewerId: string,
    @Body() bulkDto: BulkSkillAssessmentActionDto,
    @Headers('business-x-api-key') apiKey: string
  ) {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }
      
      if (!reviewerId) {
        throw new BadRequestException('Reviewer ID is required');
      }

      if (!bulkDto.assessmentIds || bulkDto.assessmentIds.length === 0) {
        throw new BadRequestException('At least one assessment ID is required');
      }

      if (bulkDto.assessmentIds.length > 100) {
        throw new BadRequestException('Cannot process more than 100 assessments at once');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      
      return await this.businessSkillsService.bulkProcessAssessments(
        businessId, 
        bulkDto, 
        reviewerId
      );
    } catch (error) {
      this.logger.error(`Error in bulk processing: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to bulk process assessments');
    }
  }

  // ============================================================================
  // ANALYTICS AND REPORTING ENDPOINTS
  // ============================================================================

  @Get('analytics')
  @ApiOperation({ 
    summary: 'Get skill analytics',
    description: 'Retrieve comprehensive analytics about skills, assessments, and employee capabilities'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Skill analytics retrieved successfully',
    type: SkillAnalyticsResponse 
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async getSkillAnalytics(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<SkillAnalyticsResponse> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessSkillsService.getSkillAnalytics(businessId);
    } catch (error) {
      this.logger.error(`Error getting skill analytics: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve skill analytics');
    }
  }

  // ============================================================================
  // BUSINESS CONFIGURATION ENDPOINTS
  // ============================================================================

  @Get('business-config')
  @ApiOperation({ 
    summary: 'Get business configuration',
    description: 'Retrieve business profile, settings, and configuration details'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Business configuration retrieved successfully',
    type: BusinessConfigResponse 
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async getBusinessConfiguration(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<BusinessConfigResponse> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessSkillsService.getBusinessConfiguration(businessId);
    } catch (error) {
      this.logger.error(`Error getting business configuration: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve business configuration');
    }
  }

  @Put('business-config')
  @ApiOperation({ 
    summary: 'Update business configuration',
    description: 'Update business profile, settings, and operational configuration'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiBody({ type: UpdateBusinessConfigDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Business configuration updated successfully',
    type: BusinessConfigResponse 
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid configuration data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async updateBusinessConfiguration(
    @Query('businessId') businessId: string,
    @Body() updateDto: UpdateBusinessConfigDto,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<BusinessConfigResponse> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessSkillsService.updateBusinessConfiguration(businessId, updateDto);
    } catch (error) {
      this.logger.error(`Error updating business configuration: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update business configuration');
    }
  }

  @Get('business-config/options')
  @ApiOperation({ 
    summary: 'Get business configuration options',
    description: 'Get available options for business type, industry, categories, etc.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Configuration options retrieved successfully',
    type: ConfigurationOptionsResponse
  })
  async getBusinessConfigOptions(): Promise<ConfigurationOptionsResponse> {
    try {
      return await this.businessSkillsService.getConfigurationOptions();
    } catch (error) {
      this.logger.error(`Error getting configuration options: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to retrieve configuration options');
    }
  }

  // ============================================================================
  // UTILITY ENDPOINTS
  // ============================================================================

  @Get('assessments/:assessmentId')
  @ApiOperation({ 
    summary: 'Get single skill assessment details',
    description: 'Retrieve detailed information about a specific skill assessment'
  })
  @ApiParam({ name: 'assessmentId', description: 'Skill assessment ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Skill assessment retrieved successfully',
    type: SkillAssessment 
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Skill assessment not found' })
  async getSkillAssessment(
    @Param('assessmentId') assessmentId: string,
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ) {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      
      // This would be implemented in the service if needed
      // For now, return a basic response
      throw new InternalServerErrorException('Endpoint not yet implemented');
    } catch (error) {
      this.logger.error(`Error getting skill assessment: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve skill assessment');
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Validate business API key (reused from business-onboarding controller)
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