// src/controllers/compliance-rule.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ComplianceMonitoringAgentService } from '../services/compliance-monitoring-agent.service';
import { ComplianceRule } from '../schemas/compliance-rule.schema';

@ApiTags('Compliance Rules')
@Controller('compliance-rules')
export class ComplianceRuleController {
  constructor(private readonly complianceService: ComplianceMonitoringAgentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new compliance rule' })
  @ApiResponse({ status: 201, description: 'Compliance rule created successfully' })
  async createRule(@Body() ruleData: Partial<ComplianceRule>): Promise<ComplianceRule> {
    return this.complianceService.createRule(ruleData);
  }

  @Get('business/:businessId')
  @ApiOperation({ summary: 'Get compliance rules for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  async getBusinessRules(
    @Param('businessId') businessId: string,
    @Query('includeInactive') includeInactive?: boolean
  ): Promise<ComplianceRule[]> {
    return this.complianceService.getBusinessRules(
      businessId,
      includeInactive === 'true' || includeInactive === true
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get compliance rule by ID' })
  @ApiParam({ name: 'id', description: 'Rule ID' })
  async getRule(@Param('id') id: string): Promise<ComplianceRule> {
    return this.complianceService.getRuleById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a compliance rule' })
  @ApiParam({ name: 'id', description: 'Rule ID' })
  async updateRule(
    @Param('id') id: string,
    @Body() ruleData: Partial<ComplianceRule>
  ): Promise<ComplianceRule> {
    return this.complianceService.updateRule(id, ruleData);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a compliance rule' })
  @ApiParam({ name: 'id', description: 'Rule ID' })
  async deleteRule(@Param('id') id: string): Promise<ComplianceRule> {
    return this.complianceService.deleteRule(id);
  }

  @Post('business/:businessId/check')
  @ApiOperation({ summary: 'Run a manual compliance check for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  async runComplianceCheck(@Param('businessId') businessId: string): Promise<{ alertCount: number }> {
    const alertCount = await this.complianceService.runManualComplianceCheck(businessId);
    return { alertCount };
  }
}