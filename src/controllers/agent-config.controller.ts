// src/controllers/agent-config.controller.ts
import { Controller, Get, Post, Put, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AgentPermissionService } from '../services/agent-permission.service';
import { AutoAssignmentAgentService } from '../services/auto-assignment-agent.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';

@ApiTags('Agent Configuration')
@Controller('agent-configuration')
@UseGuards(ClientAuthGuard)
@ApiBearerAuth()
export class AgentConfigController {
  constructor(
    private readonly agentPermissionService: AgentPermissionService,
    private readonly autoAssignmentService: AutoAssignmentAgentService
  ) {}

  @Get('business/:businessId')
  @ApiOperation({ summary: 'Get all agent configurations for a business' })
  async getBusinessConfigurations(
    @Param('businessId') businessId: string,
    @Req() req: Request & { client: Client }
  ) {
    // Get existing configurations
    const configurations = await this.agentPermissionService.listBusinessAgentConfigurations(businessId);
    
    // Get available agent types
    const availableAgents = await this.agentPermissionService.getAvailableAgents(businessId);
    
    return {
      configurations,
      availableAgents
    };
  }

  @Get('business/:businessId/agent/:agentType')
  @ApiOperation({ summary: 'Get configuration for a specific agent' })
  async getAgentConfiguration(
    @Param('businessId') businessId: string,
    @Param('agentType') agentType: string,
    @Req() req: Request & { client: Client }
  ) {
    return this.agentPermissionService.getAgentConfiguration(businessId, agentType);
  }

  @Post('business/:businessId/agent/:agentType/enable')
  @ApiOperation({ summary: 'Enable an agent for a business' })
  async enableAgent(
    @Param('businessId') businessId: string,
    @Param('agentType') agentType: string,
    @Req() req: Request & { client: Client }
  ) {
    // Get client ID from the request instead of URL parameter
    const clientId = req.client.id;
    
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
    @Param('agentType') agentType: string,
    @Req() req: Request & { client: Client }
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
    @Body() configData: any,
    @Req() req: Request & { client: Client }
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

  @Get('agent/:agentType/businesses')
  @ApiOperation({ summary: 'List all businesses with a specific agent enabled' })
  async listBusinessesWithAgent(
    @Param('agentType') agentType: string,
    @Req() req: Request & { client: Client }
  ) {
    // Get client ID from the request
    const clientId = req.client.id;
    return this.agentPermissionService.listBusinessesWithAgent(clientId, agentType);
  }
}