// src/controllers/communication-template.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ClientCommunicationAgentService } from '../services/client-communication-agent.service';
import { CommunicationTemplate } from '../schemas/communication-template.schema';

@ApiTags('Communication Templates')
@Controller('communication-templates')
export class CommunicationTemplateController {
  constructor(private readonly communicationService: ClientCommunicationAgentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new communication template' })
  @ApiResponse({ status: 201, description: 'Template created successfully' })
  async createTemplate(
    @Body() templateData: Partial<CommunicationTemplate>
  ): Promise<CommunicationTemplate> {
    return this.communicationService.createCommunicationTemplate(templateData);
  }

  @Get('business/:businessId')
@ApiOperation({ summary: 'Get templates for a business' })
@ApiParam({ name: 'businessId', description: 'Business ID' })
@ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
async getBusinessTemplates(
  @Param('businessId') businessId: string,
  @Query('includeInactive') includeInactive?: string | boolean
): Promise<CommunicationTemplate[]> {
  return this.communicationService.getBusinessTemplates(
    businessId,
    includeInactive === true || includeInactive === 'true'
  );
}

  @Put(':id')
  @ApiOperation({ summary: 'Update a communication template' })
  @ApiParam({ name: 'id', description: 'Template ID' })
  async updateTemplate(
    @Param('id') id: string,
    @Body() templateData: Partial<CommunicationTemplate>
  ): Promise<CommunicationTemplate> {
    return this.communicationService.updateCommunicationTemplate(id, templateData);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a communication template' })
  @ApiParam({ name: 'id', description: 'Template ID' })
  async deleteTemplate(
    @Param('id') id: string
  ): Promise<CommunicationTemplate> {
    return this.communicationService.deleteTemplate(id);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send communication using template' })
  @ApiParam({ name: 'id', description: 'Template ID' })
  async sendCommunication(
    @Param('id') id: string,
    @Body() data: { clientIds: string[], customData?: Record<string, any> }
  ): Promise<{ sent: number; failed: number; messages: string[] }> {
    return this.communicationService.sendCommunicationUsingTemplate(
      id,
      data.clientIds,
      data.customData
    );
  }
}