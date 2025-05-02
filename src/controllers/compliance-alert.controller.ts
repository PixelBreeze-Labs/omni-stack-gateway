// src/controllers/compliance-alert.controller.ts
import { Controller, Get, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ComplianceMonitoringAgentService } from '../services/compliance-monitoring-agent.service';
import { ComplianceAlert, AlertStatus } from '../schemas/compliance-alert.schema';
import { RuleSeverity } from '../schemas/compliance-rule.schema';

@ApiTags('Compliance Alerts')
@Controller('compliance-alerts')
export class ComplianceAlertController {
  constructor(private readonly complianceService: ComplianceMonitoringAgentService) {}

  @Get('business/:businessId')
  @ApiOperation({ summary: 'Get compliance alerts for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'status', required: false, enum: AlertStatus })
  @ApiQuery({ name: 'severity', required: false, enum: RuleSeverity })
  @ApiQuery({ name: 'userId', required: false })
  async getBusinessAlerts(
    @Param('businessId') businessId: string,
    @Query('status') status?: AlertStatus,
    @Query('severity') severity?: RuleSeverity,
    @Query('userId') userId?: string
  ): Promise<ComplianceAlert[]> {
    return this.complianceService.getBusinessAlerts(businessId, {
      status,
      severity,
      userId
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get compliance alert by ID' })
  @ApiParam({ name: 'id', description: 'Alert ID' })
  async getAlert(@Param('id') id: string): Promise<ComplianceAlert> {
    return this.complianceService.getAlertById(id);
  }

  @Put(':id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge a compliance alert' })
  @ApiParam({ name: 'id', description: 'Alert ID' })
  async acknowledgeAlert(
    @Param('id') id: string,
    @User('_id') userId: string
  ): Promise<ComplianceAlert> {
    return this.complianceService.acknowledgeAlert(id, userId);
  }

  @Put(':id/resolve')
  @ApiOperation({ summary: 'Resolve a compliance alert' })
  @ApiParam({ name: 'id', description: 'Alert ID' })
  async resolveAlert(
    @Param('id') id: string,
    @Body() data: { notes: string },
    @User('_id') userId: string
  ): Promise<ComplianceAlert> {
    return this.complianceService.resolveAlert(id, userId, data.notes);
  }

  @Put(':id/dismiss')
  @ApiOperation({ summary: 'Dismiss a compliance alert' })
  @ApiParam({ name: 'id', description: 'Alert ID' })
  async dismissAlert(
    @Param('id') id: string,
    @Body() data: { reason: string },
    @User('_id') userId: string
  ): Promise<ComplianceAlert> {
    return this.complianceService.dismissAlert(id, userId, data.reason);
  }

  @Get('summary/business/:businessId')
  @ApiOperation({ summary: 'Get compliance summary for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  async getComplianceSummary(
    @Param('businessId') businessId: string
  ): Promise<any> {
    return this.complianceService.getComplianceSummary(businessId);
  }
}