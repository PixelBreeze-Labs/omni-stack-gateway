// src/controllers/osha-reports.controller.ts
import { 
    Controller, 
    Get, 
    Query, 
    Headers, 
    Res, 
    UnauthorizedException, 
    Logger, 
    InternalServerErrorException 
  } from '@nestjs/common';
  import { ApiTags, ApiOperation, ApiHeader, ApiQuery, ApiResponse } from '@nestjs/swagger';
  import { Response } from 'express';
  import { OshaReportsService } from '../services/osha-reports.service';
  import { BusinessService } from '../services/business.service';
  
  @ApiTags('OSHA Reports')
  @Controller('osha/reports')
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class OshaReportsController {
    private readonly logger = new Logger(OshaReportsController.name);
  
    constructor(
      private readonly oshaReportsService: OshaReportsService,
      private readonly businessService: BusinessService
    ) {}
  
    @Get('download')
    @ApiOperation({ summary: 'Download OSHA compliance report as PDF' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'constructionSiteId', required: false, description: 'Filter by construction site' })
    @ApiQuery({ name: 'reportType', required: false, description: 'Type of report', enum: ['summary', 'detailed', 'violations'] })
    @ApiQuery({ name: 'dateFrom', required: false, description: 'Start date filter (YYYY-MM-DD)' })
    @ApiQuery({ name: 'dateTo', required: false, description: 'End date filter (YYYY-MM-DD)' })
    @ApiResponse({ status: 200, description: 'PDF report generated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async downloadReport(
      @Query('businessId') businessId: string,
      @Query('constructionSiteId') constructionSiteId: string,
      @Query('reportType') reportType: 'summary' | 'detailed' | 'violations' = 'summary',
      @Query('dateFrom') dateFrom: string,
      @Query('dateTo') dateTo: string,
      @Headers('business-x-api-key') apiKey: string,
      @Res() res: Response
    ): Promise<void> {
      try {
        // Validate business API key
        const business = await this.validateBusinessApiKey(businessId, apiKey);
        
        const filters = {
          businessId,
          constructionSiteId,
          reportType,
          dateFrom: dateFrom ? new Date(dateFrom) : undefined,
          dateTo: dateTo ? new Date(dateTo) : undefined,
        };
        
        const reportBuffer = await this.oshaReportsService.generatePdfReport(filters);
        
        // Set response headers
        const fileName = `osha-compliance-report-${business.name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': reportBuffer.length.toString(),
        });
        
        res.send(reportBuffer);
      } catch (error) {
        this.logger.error(`Error generating OSHA report: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to generate OSHA report');
      }
    }
  
    @Get('excel')
    @ApiOperation({ summary: 'Download OSHA compliance data as Excel file' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'constructionSiteId', required: false, description: 'Filter by construction site' })
    @ApiQuery({ name: 'includeInspections', required: false, description: 'Include inspection data' })
    @ApiQuery({ name: 'includeViolations', required: false, description: 'Include violation data' })
    @ApiResponse({ status: 200, description: 'Excel file generated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async downloadExcel(
      @Query('businessId') businessId: string,
      @Query('constructionSiteId') constructionSiteId: string,
      @Query('includeInspections') includeInspections: boolean = false,
      @Query('includeViolations') includeViolations: boolean = false,
      @Headers('business-x-api-key') apiKey: string,
      @Res() res: Response
    ): Promise<void> {
      try {
        // Validate business API key
        const business = await this.validateBusinessApiKey(businessId, apiKey);
        
        const filters = {
          businessId,
          constructionSiteId,
          includeInspections,
          includeViolations,
        };
        
        const excelBuffer = await this.oshaReportsService.generateExcelReport(filters);
        
        // Set response headers
        const fileName = `osha-compliance-data-${business.name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`;
        res.set({
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': excelBuffer.length.toString(),
        });
        
        res.send(excelBuffer);
      } catch (error) {
        this.logger.error(`Error generating OSHA Excel report: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to generate OSHA Excel report');
      }
    }
  
    @Get('preview')
    @ApiOperation({ summary: 'Preview OSHA compliance report data' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'constructionSiteId', required: false, description: 'Filter by construction site' })
    @ApiQuery({ name: 'reportType', required: false, description: 'Type of report', enum: ['summary', 'detailed', 'violations'] })
    @ApiResponse({ status: 200, description: 'Report preview data retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async previewReport(
      @Query('businessId') businessId: string,
      @Query('constructionSiteId') constructionSiteId: string,
      @Query('reportType') reportType: 'summary' | 'detailed' | 'violations' = 'summary',
      @Headers('business-x-api-key') apiKey: string
    ): Promise<{
      title: string;
      generated_at: string;
      business_name: string;
      site_name?: string;
      summary: {
        total_requirements: number;
        compliant: number;
        non_compliant: number;
        pending: number;
      };
      data: any[];
    }> {
      try {
        // Validate business API key
        const business = await this.validateBusinessApiKey(businessId, apiKey);
        
        const filters = {
          businessId,
          constructionSiteId,
          reportType,
        };
        
        return await this.oshaReportsService.getReportPreview(filters);
      } catch (error) {
        this.logger.error(`Error generating OSHA report preview: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to generate OSHA report preview');
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