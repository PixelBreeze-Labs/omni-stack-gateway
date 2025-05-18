// src/controllers/ai/ml-testing.controller.ts
import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { AIModelService } from '../../services/ai/ai-model.service';
import { AIPredictionService } from '../../services/ai/ai-prediction.service';
import { AIInsightService } from '../../services/ai/ai-insight.service';
import { AIFeatureService } from '../../services/ai/ai-feature.service';
import { AIAgentService } from '../../services/ai/ai-agent.service';

@Controller('ai-test')
export class AITestController {
  constructor(
    private aiModelService: AIModelService,
    private aiPredictionService: AIPredictionService,
    private aiInsightService: AIInsightService,
    private aiFeatureService: AIFeatureService,
    private aiAgentService: AIAgentService
  ) {}

  @Get('status')
  getStatus() {
    return {
      status: 'operational',
      services: [
        'AIModelService',
        'AIPredictionService', 
        'AIInsightService',
        'AIFeatureService',
        'AIAgentService'
      ]
    };
  }

  // FEATURE ENDPOINTS
  @Post('features/save')
  async saveFeatures(@Body() data: any) {
    return this.aiFeatureService.saveFeatures(
      data.entityId,
      data.entityType,
      data.featureSetName,
      data.features,
      data.businessId
    );
  }

  @Get('features/:entityType/:entityId/:featureSetName')
  async getFeatures(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Param('featureSetName') featureSetName: string
  ) {
    return this.aiFeatureService.getFeatures(
      entityId, 
      entityType, 
      featureSetName
    );
  }

  // MODEL ENDPOINTS
  @Post('models/register')
  async registerModel(@Body() modelData: any) {
    return this.aiModelService.registerModel(modelData);
  }

  @Get('models')
  async getModels() {
    return this.aiModelService.findAllModels();
  }

  @Get('models/:modelId')
  async getModel(@Param('modelId') modelId: string) {
    return this.aiModelService.findModelById(modelId);
  }

  // PREDICTION ENDPOINTS
  @Post('predict')
  async makePrediction(@Body() data: any) {
    return this.aiPredictionService.predict(
      data.modelName,
      data.entityType,
      data.entityId,
      data.features,
      data.businessId,
      data.userId
    );
  }

  @Post('feedback')
  async provideFeedback(@Body() data: any) {
    return this.aiPredictionService.provideFeedback(
      data.predictionId,
      data.isCorrect,
      data.actualOutcome
    );
  }

  // INSIGHT ENDPOINTS
  @Get('insights/:entityType/:entityId')
  async getInsights(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query('insightType') insightType?: string
  ) {
    return this.aiInsightService.getInsights(
      entityId,
      entityType,
      insightType
    );
  }

  @Post('insights/generate')
  async generateInsights(@Body() data: any) {
    return this.aiInsightService.generateInsights(
      data.entityId,
      data.entityType,
      data.insightType,
      data.features,
      data.businessId
    );
  }

  // AGENT ENDPOINTS
  @Post('agents/auto-assign')
  async autoAssignTask(@Body() data: any) {
    return this.aiAgentService.autoAssignTask(
      data.taskId,
      data.businessId
    );
  }

  @Get('agents/compliance/:businessId')
  async scanCompliance(@Param('businessId') businessId: string) {
    return this.aiAgentService.scanComplianceIssues(businessId);
  }

  @Post('agents/report')
  async generateReport(@Body() data: any) {
    return this.aiAgentService.generateReport(
      data.businessId,
      data.reportType,
      data.options
    );
  }
}