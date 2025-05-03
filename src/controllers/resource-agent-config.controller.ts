// src/controllers/resource-agent-config.controller.ts
import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ResourceRequestAgentService } from '../services/resource-request-agent.service';
import { AgentConfiguration } from '../schemas/agent-configuration.schema';

@ApiTags('Resource Agent Configuration')
@Controller('resource-agent-config')
export class ResourceAgentConfigController {
  constructor(private readonly resourceService: ResourceRequestAgentService) {}

  @Get('business/:businessId')
  @ApiOperation({ summary: 'Get resource agent configuration for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  async getBusinessConfiguration(
    @Param('businessId') businessId: string
  ): Promise<AgentConfiguration> {
    return this.resourceService.getBusinessConfiguration(businessId);
  }

  @Put('business/:businessId')
  @ApiOperation({ summary: 'Update resource agent configuration for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiResponse({ status: 200, description: 'Configuration updated successfully' })
  async updateBusinessConfiguration(
    @Param('businessId') businessId: string,
    @Body() configData: Partial<AgentConfiguration>
  ): Promise<AgentConfiguration> {
    return this.resourceService.updateBusinessConfiguration(businessId, configData);
  }
}