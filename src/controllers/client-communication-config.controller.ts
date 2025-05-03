// src/controllers/client-communication-config.controller.ts
import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ClientCommunicationAgentService } from '../services/client-communication-agent.service';
import { AgentConfiguration } from '../schemas/agent-configuration.schema';

@ApiTags('Client Communication Configuration')
@Controller('client-communication-config')
export class ClientCommunicationConfigController {
  constructor(private readonly communicationService: ClientCommunicationAgentService) {}

  @Get('business/:businessId')
  @ApiOperation({ summary: 'Get communication configuration for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  async getBusinessConfiguration(
    @Param('businessId') businessId: string
  ): Promise<AgentConfiguration> {
    return this.communicationService.getBusinessConfiguration(businessId);
  }

  @Put('business/:businessId')
  @ApiOperation({ summary: 'Update communication configuration for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiResponse({ status: 200, description: 'Configuration updated successfully' })
  async updateBusinessConfiguration(
    @Param('businessId') businessId: string,
    @Body() configData: Partial<AgentConfiguration>
  ): Promise<AgentConfiguration> {
    return this.communicationService.updateBusinessConfiguration(businessId, configData);
  }
}