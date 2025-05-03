// src/controllers/topic-classifier.controller.ts
import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ClientCommunicationAgentService } from '../services/client-communication-agent.service';
import { TopicClassifier } from '../schemas/topic-classifier.schema';

@ApiTags('Topic Classifiers')
@Controller('topic-classifiers')
export class TopicClassifierController {
  constructor(private readonly communicationService: ClientCommunicationAgentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new topic classifier' })
  @ApiResponse({ status: 201, description: 'Classifier created successfully' })
  async createClassifier(
    @Body() classifierData: Partial<TopicClassifier>
  ): Promise<TopicClassifier> {
    return this.communicationService.createTopicClassifier(classifierData);
  }

  @Get('business/:businessId')
@ApiOperation({ summary: 'Get classifiers for a business' })
@ApiParam({ name: 'businessId', description: 'Business ID' })
@ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
async getBusinessClassifiers(
  @Param('businessId') businessId: string,
  @Query('includeInactive') includeInactive?: string | boolean
): Promise<TopicClassifier[]> {
  return this.communicationService.getBusinessClassifiers(
    businessId,
    includeInactive === true || includeInactive === 'true'
  );
}

  @Put(':id')
  @ApiOperation({ summary: 'Update a topic classifier' })
  @ApiParam({ name: 'id', description: 'Classifier ID' })
  async updateClassifier(
    @Param('id') id: string,
    @Body() classifierData: Partial<TopicClassifier>
  ): Promise<TopicClassifier> {
    return this.communicationService.updateTopicClassifier(id, classifierData);
  }
}