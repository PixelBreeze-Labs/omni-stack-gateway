// src/controllers/osha-audit.controller.ts - NEW CONTROLLER FILE
import { 
    Controller, 
    Post, 
    Get,
    Body, 
    Query, 
    Headers, 
    UnauthorizedException, 
    Logger, 
    InternalServerErrorException 
  } from '@nestjs/common';
  import { ApiTags, ApiOperation, ApiHeader, ApiQuery, ApiBody, ApiResponse } from '@nestjs/swagger';
  import { OshaComplianceService } from '../services/osha-compliance.service';
  import { BusinessService } from '../services/business.service';
  
  interface RunAuditDto {
    businessId: string;
    constructionSiteId?: string;
  }
  
  @ApiTags('OSHA Audit & Tasks')
  @Controller('osha')
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class OshaAuditController {
    private readonly logger = new Logger(OshaAuditController.name);
  
    constructor(
      private readonly oshaComplianceService: OshaComplianceService,
      private readonly businessService: BusinessService
    ) {}
  
    @Post('audit')
    @ApiOperation({ summary: 'Run OSHA compliance audit' })
    @ApiBody({ 
      schema: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          constructionSiteId: { type: 'string', description: 'Optional construction site ID' }
        },
        required: ['businessId']
      }
    })
    @ApiResponse({ status: 200, description: 'Audit completed successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async runAudit(
      @Body() auditDto: RunAuditDto,
      @Headers('business-x-api-key') apiKey: string
    ) {
      try {
        // Validate business API key
        await this.validateBusinessApiKey(auditDto.businessId, apiKey);
        
        const auditResults = await this.oshaComplianceService.runComplianceAudit(
          auditDto.businessId, 
          auditDto.constructionSiteId
        );
        
        return {
          success: true,
          message: 'OSHA compliance audit completed successfully',
          results: auditResults
        };
      } catch (error) {
        this.logger.error(`Error running OSHA audit: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to run OSHA compliance audit');
      }
    }
  
    @Get('upcoming-tasks')
    @ApiOperation({ summary: 'Get upcoming OSHA compliance tasks' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'constructionSiteId', required: false, description: 'Filter by construction site' })
    @ApiQuery({ name: 'days', required: false, description: 'Number of days to look ahead (default: 30)' })
    @ApiResponse({ status: 200, description: 'Upcoming tasks retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async getUpcomingTasks(
      @Query('businessId') businessId: string,
      @Query('constructionSiteId') constructionSiteId: string,
      @Query('days') days: number = 30,
      @Headers('business-x-api-key') apiKey: string
    ) {
      try {
        // Validate business API key
        await this.validateBusinessApiKey(businessId, apiKey);
        
        const upcomingTasks = await this.oshaComplianceService.getUpcomingTasks(
          businessId, 
          constructionSiteId,
          Number(days) || 30
        );
        
        return {
          success: true,
          data: upcomingTasks
        };
      } catch (error) {
        this.logger.error(`Error fetching upcoming OSHA tasks: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to fetch upcoming OSHA tasks');
      }
    }
  
    @Get('overdue-inspections')
    @ApiOperation({ summary: 'Get overdue OSHA inspections' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'constructionSiteId', required: false, description: 'Filter by construction site' })
    @ApiResponse({ status: 200, description: 'Overdue inspections retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async getOverdueInspections(
      @Query('businessId') businessId: string,
      @Query('constructionSiteId') constructionSiteId: string,
      @Headers('business-x-api-key') apiKey: string
    ) {
      try {
        // Validate business API key
        await this.validateBusinessApiKey(businessId, apiKey);
        
        const overdueInspections = await this.oshaComplianceService.getOverdueInspections(
          businessId, 
          constructionSiteId
        );
        
        return {
          success: true,
          data: overdueInspections
        };
      } catch (error) {
        this.logger.error(`Error fetching overdue OSHA inspections: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to fetch overdue OSHA inspections');
      }
    }
  
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