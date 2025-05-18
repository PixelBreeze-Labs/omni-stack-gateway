// src/ai/services/ai-prediction.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PredictionLogRepository } from '../../repositories/ai/prediction-log.repository';
import { AIModelService } from './ai-model.service';
import { CreatePredictionLogDto } from '../../dtos/ai/prediction-log.dto';

@Injectable()
export class AIPredictionService {
  private readonly logger = new Logger(AIPredictionService.name);

  constructor(
    private predictionLogRepository: PredictionLogRepository,
    private aiModelService: AIModelService
  ) {}

  /**
   * Make a prediction and log it for future learning/evaluation
   */
  async predict(
    modelName: string,
    entityType: string,
    entityId: string,
    features: Record<string, any>,
    businessId?: string,
    userId?: string
  ): Promise<any> {
    try {
      // Use the model service to make the prediction
      const predictionResult = await this.aiModelService.predict(modelName, features);
      
      // Get the model info to find its ID
      const modelInfo = await this.aiModelService.getModelInfo(modelName);
      
      if (!modelInfo) {
        throw new Error(`Model info not found for ${modelName}`);
      }
      
      // Create the prediction log
      const predictionLog: CreatePredictionLogDto = {
        modelId: modelInfo.id,
        entityType,
        entityId,
        input: features,
        output: this.formatPredictionOutput(predictionResult, modelInfo.type),
        businessId,
        userId,
        confidence: this.calculateConfidence(predictionResult, modelInfo.type)
      };
      
      // Save the prediction log
      const savedLog = await this.predictionLogRepository.create(predictionLog);
      
      // Return the prediction result and log ID
      return {
        prediction: predictionLog.output,
        logId: savedLog.id,
        confidence: predictionLog.confidence
      };
    } catch (error) {
      this.logger.error(`Prediction error for ${modelName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Provide feedback on a prediction (for continual learning)
   */
  async provideFeedback(
    predictionId: string,
    isCorrect: boolean,
    actualOutcome?: Record<string, any>
  ): Promise<any> {
    try {
      return this.predictionLogRepository.provideFeedback(
        predictionId,
        isCorrect,
        actualOutcome
      );
    } catch (error) {
      this.logger.error(`Error providing feedback: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get prediction history for an entity
   */
  async getPredictionHistory(
    entityId: string,
    entityType: string,
    limit: number = 10
  ): Promise<any[]> {
    try {
      const predictions = await this.predictionLogRepository.findByEntityId(entityId, entityType);
      
      // Sort by date descending and limit
      return predictions
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
        .map(p => ({
          id: p.id,
          modelId: p.modelId,
          timestamp: p.createdAt,
          input: p.input,
          output: p.output,
          confidence: p.confidence,
          feedbackProvided: p.feedbackProvided,
          feedbackCorrect: p.feedbackCorrect,
          actualOutcome: p.actualOutcome
        }));
    } catch (error) {
      this.logger.error(`Error fetching prediction history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get model performance metrics
   */
  async getModelPerformance(modelId: string): Promise<any> {
    try {
      const { total, correct, accuracy } = await this.predictionLogRepository.getModelAccuracy(modelId);
      
      // Get prediction logs with feedback
      const logs = await this.predictionLogRepository.findAll({
        modelId, 
        feedbackProvided: true
      });
      
      // Calculate additional metrics if needed
      // For example, categorize by entity type
      const entityTypeStats = {};
      
      logs.forEach(log => {
        if (!entityTypeStats[log.entityType]) {
          entityTypeStats[log.entityType] = {
            total: 0,
            correct: 0
          };
        }
        
        entityTypeStats[log.entityType].total++;
        if (log.feedbackCorrect) {
          entityTypeStats[log.entityType].correct++;
        }
      });
      
      // Calculate accuracy for each entity type
      Object.keys(entityTypeStats).forEach(key => {
        const stats = entityTypeStats[key];
        stats.accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
      });
      
      return {
        overall: {
          total,
          correct,
          accuracy
        },
        byEntityType: entityTypeStats,
        // Add more metrics as needed
      };
    } catch (error) {
      this.logger.error(`Error calculating model performance: ${error.message}`);
      throw error;
    }
  }

  /**
   * Format prediction output based on model type
   */
  private formatPredictionOutput(result: any, modelType: string): Record<string, any> {
    switch (modelType) {
      case 'classification':
        // For binary classification, result is typically a single probability
        if (result.length === 1) {
          return { probability: result[0] };
        }
        // For multi-class, result is an array of probabilities
        else {
          const probabilities = {};
          for (let i = 0; i < result.length; i++) {
            probabilities[`class_${i}`] = result[i];
          }
          return { probabilities };
        }
        
      case 'regression':
        // For regression, result is typically a single numerical value
        return { value: result[0] };
        
      case 'clustering':
        // For clustering, result is typically a cluster assignment
        return { cluster: Math.round(result[0]) };
        
      case 'timeseries':
        // For time series, result could be an array of future values
        return { predictions: result };
        
      default:
        // Default case
        return { result };
    }
  }

  /**
   * Calculate confidence based on model type and prediction result
   */
  private calculateConfidence(result: any, modelType: string): number {
    switch (modelType) {
      case 'classification':
        // For binary classification, confidence is the probability (or its complement)
        if (result.length === 1) {
          const prob = result[0];
          return prob > 0.5 ? prob : 1 - prob; // Distance from decision boundary
        }
        // For multi-class, confidence is the max probability
        else {
          return Math.max(...result);
        }
        
      case 'regression':
        // For regression, we don't have an inherent confidence metric
        // Could use a preset value or model-specific calculation
        return 0.8; // Default value
        
      case 'clustering':
        // For clustering, confidence could be distance to cluster center
        // But we would need additional info from the model
        return 0.7; // Default value
        
      default:
        return 0.5; // Default fallback
    }
  }
}