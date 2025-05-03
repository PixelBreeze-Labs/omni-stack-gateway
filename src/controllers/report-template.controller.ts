// src/controllers/report-template.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ReportGenerationAgentService } from '../services/report-generation-agent.service';
import { ReportTemplate } from '../schemas/report-template.schema';

@ApiTags('Report Templates')
@Controller('report-templates')
export class ReportTemplateController {
  constructor(private readonly reportService: ReportGenerationAgentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new report template' })
  @ApiResponse({ status: 201, description: 'Report template created successfully' })
  async createTemplate(@Body() templateData: Partial<ReportTemplate>): Promise<ReportTemplate> {
    return this.reportService.createReportTemplate(templateData);
  }

  @Get('business/:businessId')
  @ApiOperation({ summary: 'Get report templates for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  async getBusinessTemplates(
    @Param('businessId') businessId: string,
    @Query('includeInactive') includeInactive?: string | boolean
  ): Promise<ReportTemplate[]> {
    return this.reportService.getBusinessTemplates(
      businessId,
      includeInactive === true || includeInactive === 'true'
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get report template by ID' })
  @ApiParam({ name: 'id', description: 'Template ID' })
  async getTemplate(@Param('id') id: string): Promise<ReportTemplate> {
    return this.reportService.getReportTemplateById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a report template' })
  @ApiParam({ name: 'id', description: 'Template ID' })
  async updateTemplate(
    @Param('id') id: string,
    @Body() templateData: Partial<ReportTemplate>
  ): Promise<ReportTemplate> {
    return this.reportService.updateReportTemplate(id, templateData);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a report template' })
  @ApiParam({ name: 'id', description: 'Template ID' })
  async deleteTemplate(@Param('id') id: string): Promise<ReportTemplate> {
    return this.reportService.deleteReportTemplate(id);
  }
  
  @Post(':id/run')
  @ApiOperation({ summary: 'Run a report template on demand' })
  @ApiParam({ name: 'id', description: 'Template ID' })
  async runTemplate(
    @Param('id') id: string,
    @Body() data: { startDate?: string, endDate?: string }
  ): Promise<any> {
    const startDate = data.startDate ? new Date(data.startDate) : null;
    const endDate = data.endDate ? new Date(data.endDate) : null;
    
    const report = await this.reportService.generateReportOnDemand(id, startDate, endDate);
    
    return {
      id: report._id,
      name: report.name,
      format: report.format,
      status: report.status,
      fileUrl: report.fileUrl,
      generatedAt: report.generatedAt
    };
  }
}