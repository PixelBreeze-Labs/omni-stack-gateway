// src/controllers/osha-stats.controller.ts
import { 
    Controller, 
    Get, 
    Query, 
    Headers, 
    UnauthorizedException, 
    Logger, 
    InternalServerErrorException 
  } from '@nestjs/common';
  import { ApiTags, ApiOperation, ApiHeader, ApiQuery, ApiResponse } from '@nestjs/swagger';
  import { OshaStatsService } from '../services/osha-stats.service';
  import { BusinessService } from '../services/business.service';
  
  interface OshaStatsResponse {
    compliance_rate: number;
    open_violations: number;
    inspections_due: number;
    last_audit_days_ago: number;
    total_requirements: number;
    overdue_inspections: number;
    by_category: {
      [category: string]: number;
    };
    by_status: {
      compliant: number;
      non_compliant: number;
      pending: number;
    };
    by_priority: {
      high: number;
      medium: number;
      low: number;
    };
    equipment_certifications_expiring: number;
    recent_inspections: Array<{
      id: string;
      title: string;
      date: string;
      result: string;
    }>;
  }
  
  @ApiTags('OSHA Statistics')
  @Controller('osha/stats')
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class OshaStatsController {
    private readonly logger = new Logger(OshaStatsController.name);
  
    constructor(
      private readonly oshaStatsService: OshaStatsService,
      private readonly businessService: BusinessService
    ) {}
  
    @Get()
    @ApiOperation({ summary: 'Get OSHA compliance statistics for dashboard' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'constructionSiteId', required: false, description: 'Filter by construction site' })
    @ApiQuery({ name: 'dateFrom', required: false, description: 'Start date filter (YYYY-MM-DD)' })
    @ApiQuery({ name: 'dateTo', required: false, description: 'End date filter (YYYY-MM-DD)' })
    @ApiResponse({ status: 200, description: 'OSHA statistics retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async getStats(
      @Query('businessId') businessId: string,
      @Query('constructionSiteId') constructionSiteId: string,
      @Query('dateFrom') dateFrom: string,
      @Query('dateTo') dateTo: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<OshaStatsResponse> {
      try {
        // Validate business API key
        await this.validateBusinessApiKey(businessId, apiKey);
        
        const filters = {
          businessId,
          constructionSiteId,
          dateFrom: dateFrom ? new Date(dateFrom) : undefined,
          dateTo: dateTo ? new Date(dateTo) : undefined,
        };
        
        return await this.oshaStatsService.getComplianceStats(filters);
      } catch (error) {
        this.logger.error(`Error fetching OSHA statistics: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to fetch OSHA statistics');
      }
    }
  
    @Get('summary')
    @ApiOperation({ summary: 'Get quick summary of OSHA compliance status' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ status: 200, description: 'OSHA summary retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async getSummary(
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<{
      overall_compliance: number;
      critical_issues: number;
      upcoming_inspections: number;
      status: 'good' | 'warning' | 'critical';
    }> {
      try {
        // Validate business API key
        await this.validateBusinessApiKey(businessId, apiKey);
        
        return await this.oshaStatsService.getComplianceSummary(businessId);
      } catch (error) {
        this.logger.error(`Error fetching OSHA summary: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to fetch OSHA summary');
      }
    }
  
    @Get('trends')
    @ApiOperation({ summary: 'Get OSHA compliance trends over time' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'period', required: false, description: 'Period for trends (30d, 90d, 1y)', enum: ['30d', '90d', '1y'] })
    @ApiResponse({ status: 200, description: 'OSHA trends retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async getTrends(
      @Query('businessId') businessId: string,
      @Query('period') period: '30d' | '90d' | '1y' = '30d',
      @Headers('business-x-api-key') apiKey: string
    ): Promise<{
      compliance_trend: Array<{
        date: string;
        compliance_rate: number;
        violations: number;
        inspections: number;
      }>;
      period: string;
    }> {
      try {
        // Validate business API key
        await this.validateBusinessApiKey(businessId, apiKey);
        
        return await this.oshaStatsService.getComplianceTrends(businessId, period);
      } catch (error) {
        this.logger.error(`Error fetching OSHA trends: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to fetch OSHA trends');
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