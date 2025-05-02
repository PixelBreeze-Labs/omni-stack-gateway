// src/controllers/agent-config.controller.ts
import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AgentPermissionService } from '../services/agent-permission.service';
import { AutoAssignmentAgentService } from '../services/auto-assignment-agent.service';

@ApiTags('Agent Configuration')
@Controller('agent-configuration')
export class AgentConfigController {
  constructor(
    private readonly agentPermissionService: AgentPermissionService,
    private readonly autoAssignmentService: AutoAssignmentAgentService
  ) {}

  @Get('business/:businessId')
  @ApiOperation({ summary: 'Get all agent configurations for a business' })
  async getBusinessConfigurations(
    @Param('businessId') businessId: string
  ) {
    return this.agentPermissionService.listBusinessAgentConfigurations(businessId);
  }

  @Get('business/:businessId/agent/:agentType')
  @ApiOperation({ summary: 'Get configuration for a specific agent' })
  async getAgentConfiguration(
    @Param('businessId') businessId: string,
    @Param('agentType') agentType: string
  ) {
    return this.agentPermissionService.getAgentConfiguration(businessId, agentType);
  }

  @Post('client/:clientId/business/:businessId/agent/:agentType/enable')
  @ApiOperation({ summary: 'Enable an agent for a business' })
  async enableAgent(
    @Param('clientId') clientId: string,
    @Param('businessId') businessId: string,
    @Param('agentType') agentType: string
  ) {
    const config = await this.agentPermissionService.enableAgent(clientId, businessId, agentType);
    
    // If this is the auto-assignment agent, update its cron job
    if (agentType === 'auto-assignment') {
      await this.autoAssignmentService.updateBusinessCronJob(businessId);
    }
    
    return config;
  }

  @Post('business/:businessId/agent/:agentType/disable')
  @ApiOperation({ summary: 'Disable an agent for a business' })
  async disableAgent(
    @Param('businessId') businessId: string,
    @Param('agentType') agentType: string
  ) {
    const config = await this.agentPermissionService.disableAgent(businessId, agentType);
    
    // If this is the auto-assignment agent, update its cron job
    if (agentType === 'auto-assignment') {
      await this.autoAssignmentService.updateBusinessCronJob(businessId);
    }
    
    return config;
  }

  @Put('business/:businessId/agent/:agentType/configuration')
  @ApiOperation({ summary: 'Update agent configuration' })
  async updateConfiguration(
    @Param('businessId') businessId: string,
    @Param('agentType') agentType: string,
    @Body() configData: any
  ) {
    const config = await this.agentPermissionService.updateAgentConfiguration(
      businessId, 
      agentType, 
      configData
    );
    
    // If this is the auto-assignment agent, update its cron job
    if (agentType === 'auto-assignment') {
      await this.autoAssignmentService.updateBusinessCronJob(businessId);
    }
    
    return config;
  }

  @Get('client/:clientId/agent/:agentType/businesses')
  @ApiOperation({ summary: 'List all businesses with a specific agent enabled' })
  async listBusinessesWithAgent(
    @Param('clientId') clientId: string,
    @Param('agentType') agentType: string
  ) {
    return this.agentPermissionService.listBusinessesWithAgent(clientId, agentType);
  }
}