// src/controllers/generated-report.controller.ts
import { Controller, Get, Post, Param, Query, Body, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ReportGenerationAgentService } from '../services/report-generation-agent.service';
import { ReportStatus } from '../schemas/generated-report.schema';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@ApiTags('Generated Reports')
@Controller('generated-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GeneratedReportController {
  constructor(private readonly reportService: ReportGenerationAgentService) {}

  @Get('business/:businessId')
  @ApiOperation({ summary: 'Get generated reports for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'templateId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ReportStatus })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @Roles('admin', 'business_admin', 'manager')
  async getBusinessReports(
    @Param('businessId') businessId: string,
    @Query('templateId') templateId?: string,
    @Query('status') status?: ReportStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.reportService.getBusinessReports(businessId, {
      templateId,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get generated report by ID' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @Roles('admin', 'business_admin', 'manager')
  async getReport(@Param('id') id: string) {
    return this.reportService.getGeneratedReportById(id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download a generated report' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @Roles('admin', 'business_admin', 'manager')
  async downloadReport(@Param('id') id: string, @Res() res: Response) {
    const { filePath, fileName, format } = await this.reportService.getReportFile(id);
    
    // Set content type based on format
    let contentType = 'application/octet-stream';
    switch (format) {
      case 'pdf':
        contentType = 'application/pdf';
        break;
      case 'excel':
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      case 'csv':
        contentType = 'text/csv';
        break;
      case 'json':
        contentType = 'application/json';
        break;
      case 'html':
        contentType = 'text/html';
        break;
    }
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send a generated report to recipients' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @Roles('admin', 'business_admin', 'manager')
  async sendReport(
    @Param('id') id: string,
    @Body() data: { recipientEmails: string[] }
  ) {
    return this.reportService.sendReportToRecipients(id, data.recipientEmails);
  }
}