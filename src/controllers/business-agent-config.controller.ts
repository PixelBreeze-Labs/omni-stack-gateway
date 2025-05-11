// src/controllers/business-agent-config.controller.ts
import { Controller, Get, Put, Body, Param, Headers, UnauthorizedException, NotFoundException, Logger, InternalServerErrorException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger';
import { AgentPermissionService } from '../services/agent-permission.service';
import { AutoAssignmentAgentService } from '../services/auto-assignment-agent.service';
import { BusinessService } from '../services/business.service';
import { AgentConfiguration } from '../schemas/agent-configuration.schema';

@ApiTags('Business Agent Configuration')
@Controller('business-agent-config')
@ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
export class BusinessAgentConfigController {
  private readonly logger = new Logger(BusinessAgentConfigController.name);

  constructor(
    private readonly agentPermissionService: AgentPermissionService,
    private readonly autoAssignmentService: AutoAssignmentAgentService,
    private readonly businessService: BusinessService
  ) {}

  @Get(':businessId')
  @ApiOperation({ summary: 'Get all agent configurations for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiResponse({ status: 200, description: 'Returns all agent configurations for the business' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async getBusinessConfigurations(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ) {
    try {
      // Verify API key is valid for this business
      await this.validateBusinessApiKey(businessId, apiKey);
      
      // Get existing configurations
      const configurations = await this.agentPermissionService.listBusinessAgentConfigurations(businessId);
      
      // Get available agent types
      const availableAgents = await this.agentPermissionService.getAvailableAgents(businessId);
      
      return {
        success: true,
        configurations,
        availableAgents
      };
    } catch (error) {
      this.logger.error(`Error getting business configurations: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      } else if (error instanceof NotFoundException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to get business configurations');
      }
    }
  }

  @Get(':businessId/agent/:agentType')
  @ApiOperation({ summary: 'Get configuration for a specific agent' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiParam({ name: 'agentType', description: 'Agent type (e.g., auto-assignment, compliance-monitoring)' })
  @ApiResponse({ status: 200, description: 'Returns the agent configuration' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or agent configuration not found' })
  async getAgentConfiguration(
    @Param('businessId') businessId: string,
    @Param('agentType') agentType: string,
    @Headers('business-x-api-key') apiKey: string
  ) {
    try {
      // Verify API key is valid for this business
      await this.validateBusinessApiKey(businessId, apiKey);
      
      // Check if business has access to this agent type
      const hasAccess = await this.agentPermissionService.hasAgentAccess(businessId, agentType);
      if (!hasAccess) {
        return {
          success: false,
          isEnabled: false,
          message: 'This agent is not available for your subscription tier.'
        };
      }
      
      const config = await this.agentPermissionService.getAgentConfiguration(businessId, agentType);
      return {
        success: true,
        config
      };
    } catch (error) {
      this.logger.error(`Error getting agent configuration: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      } else if (error instanceof NotFoundException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to get agent configuration');
      }
    }
  }

  @Put(':businessId/agent/:agentType/configuration')
  @ApiOperation({ summary: 'Update agent configuration for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiParam({ name: 'agentType', description: 'Agent type (e.g., auto-assignment, compliance-monitoring)' })
  @ApiBody({ description: 'Agent configuration data' })
  @ApiResponse({ status: 200, description: 'Agent configuration updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or agent configuration not found' })
  async updateConfiguration(
    @Param('businessId') businessId: string,
    @Param('agentType') agentType: string,
    @Body() configData: Partial<AgentConfiguration>,
    @Headers('business-x-api-key') apiKey: string
  ) {
    try {
      // Verify API key is valid for this business
      await this.validateBusinessApiKey(businessId, apiKey);
      
      // Check if business has access to this agent type
      const hasAccess = await this.agentPermissionService.hasAgentAccess(businessId, agentType);
      if (!hasAccess) {
        return {
          success: false,
          message: 'This agent is not available for your subscription tier.'
        };
      }
      
      // Ensure isEnabled cannot be changed here (only through enable/disable endpoints)
      if (configData.hasOwnProperty('isEnabled')) {
        delete configData.isEnabled;
      }
      
      // Remove any properties that shouldn't be updated
      delete configData.businessId;
      delete configData.clientId;
      delete configData.agentType;
      
      const config = await this.agentPermissionService.updateAgentConfiguration(
        businessId, 
        agentType, 
        configData
      );
      
      // If this is the auto-assignment agent, update its cron job
      if (agentType === 'auto-assignment') {
        await this.autoAssignmentService.updateBusinessCronJob(businessId);
      }
      
      return {
        success: true,
        message: 'Configuration updated successfully',
        config
      };
    } catch (error) {
      this.logger.error(`Error updating agent configuration: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      } else if (error instanceof NotFoundException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to update agent configuration');
      }
    }
  }

  @Put(':businessId/agent/:agentType/enable')
  @ApiOperation({ summary: 'Enable an agent for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiParam({ name: 'agentType', description: 'Agent type (e.g., auto-assignment, compliance-monitoring)' })
  @ApiResponse({ status: 200, description: 'Agent enabled successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or agent configuration not found' })
  async enableAgent(
    @Param('businessId') businessId: string,
    @Param('agentType') agentType: string,
    @Headers('business-x-api-key') apiKey: string
  ) {
    try {
      // Verify API key is valid for this business
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      
      // Check if business has access to this agent type
      const hasAccess = await this.agentPermissionService.hasAgentAccess(businessId, agentType);
      if (!hasAccess) {
        return {
          success: false,
          message: 'This agent is not available for your subscription tier.'
        };
      }
      
      const config = await this.agentPermissionService.enableAgent(business.clientId, businessId, agentType);
      
      // If this is the auto-assignment agent, update its cron job
      if (agentType === 'auto-assignment') {
        await this.autoAssignmentService.updateBusinessCronJob(businessId);
      }
      
      return {
        success: true,
        message: 'Agent enabled successfully',
        config
      };
    } catch (error) {
      this.logger.error(`Error enabling agent: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      } else if (error instanceof NotFoundException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to enable agent');
      }
    }
  }

  @Put(':businessId/agent/:agentType/disable')
  @ApiOperation({ summary: 'Disable an agent for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiParam({ name: 'agentType', description: 'Agent type (e.g., auto-assignment, compliance-monitoring)' })
  @ApiResponse({ status: 200, description: 'Agent disabled successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or agent configuration not found' })
  async disableAgent(
    @Param('businessId') businessId: string,
    @Param('agentType') agentType: string,
    @Headers('business-x-api-key') apiKey: string
  ) {
    try {
      // Verify API key is valid for this business
      await this.validateBusinessApiKey(businessId, apiKey);
      
      const config = await this.agentPermissionService.disableAgent(businessId, agentType);
      
      // If this is the auto-assignment agent, update its cron job
      if (agentType === 'auto-assignment') {
        await this.autoAssignmentService.updateBusinessCronJob(businessId);
      }
      
      return {
        success: true,
        message: 'Agent disabled successfully',
        config
      };
    } catch (error) {
      this.logger.error(`Error disabling agent: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      } else if (error instanceof NotFoundException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to disable agent');
      }
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