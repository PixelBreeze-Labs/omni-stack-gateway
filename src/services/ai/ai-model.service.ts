import { Injectable, Logger } from '@nestjs/common';
import { MLRegistryRepository } from '../../repositories/ai/ml-registry.repository';
import { CreateMLRegistryDto } from '../../dtos/ai/ml-registry.dto';

@Injectable()
export class AIModelService {
  private readonly logger = new Logger(AIModelService.name);
  private models: Map<string, any> = new Map();

  constructor(private mlRegistryRepository: MLRegistryRepository) {
    this.loadActiveModels();
  }

  private async loadActiveModels() {
    try {
      const activeModels = await this.mlRegistryRepository.findAll({ status: 'active' });
      
      for (const modelInfo of activeModels) {
        try {
          // Instead of loading TensorFlow models, we're just storing model info
          // and will use mock predictions for testing purposes
          this.models.set(modelInfo.modelName, { 
            info: modelInfo,
            mockModel: true
          });
          this.logger.log(`Registered model info: ${modelInfo.modelName}`);
        } catch (error) {
          this.logger.error(`Failed to register model ${modelInfo.modelName}: ${error.message}`);
        }
      }
      
      this.logger.log(`Registered ${this.models.size} active models`);
    } catch (error) {
      this.logger.error(`Error loading active models: ${error.message}`);
    }
  }

  async registerModel(createDto: CreateMLRegistryDto): Promise<any> {
    // If this is a new active model, deactivate previous active models with the same name
    if (createDto.status === 'active') {
      await this.mlRegistryRepository.updateModelStatus(createDto.modelName, 'active');
    }
    
    // Create the new model registry entry
    const modelRegistry = await this.mlRegistryRepository.create(createDto);
    
    // Store model info in memory
    if (createDto.status === 'active') {
      this.models.set(createDto.modelName, { 
        info: modelRegistry,
        mockModel: true
      });
    }
    
    return modelRegistry;
  }

  async predict(modelName: string, features: Record<string, any>): Promise<any> {
    let modelEntry = this.models.get(modelName);
    
    if (!modelEntry) {
      this.logger.warn(`Model ${modelName} not found in memory, attempting to load info`);
      
      // Try to find the model from the database
      const modelInfo = await this.mlRegistryRepository.getActiveModel(modelName);
      
      if (!modelInfo) {
        throw new Error(`No active model found for ${modelName}`);
      }
      
      // Register the model info
      this.models.set(modelName, { 
        info: modelInfo,
        mockModel: true
      });
      
      // Update modelEntry reference
      modelEntry = this.models.get(modelName);
    }
    
    // For testing purposes, generate mock predictions based on the model type
    return this.generateMockPrediction(modelName, modelEntry.info.type, features);
  }

  private generateMockPrediction(modelName: string, modelType: string, features: Record<string, any>): any[] {
    // Generate different mock predictions based on model type and name
    if (modelType === 'classification') {
      if (modelName.includes('risk')) {
        // Risk prediction models - return high/medium/low risk score
        const riskScore = Math.random();
        if (riskScore > 0.7) return [0.8, 0.15, 0.05]; // High risk
        if (riskScore > 0.4) return [0.2, 0.7, 0.1];   // Medium risk
        return [0.1, 0.2, 0.7];                        // Low risk
      } else if (modelName.includes('compliance')) {
        // Compliance checker - return compliance probability
        return [Math.random() > 0.3 ? 0.95 : 0.2];     // Mostly compliant
      } else {
        // Generic classification - binary result
        return [Math.random() > 0.5 ? 0.9 : 0.1];
      }
    } else if (modelType === 'regression') {
      // For regression models, return a continuous value
      if (modelName.includes('weather')) {
        // Weather impact - higher is more severe
        return [Math.random() * 10];
      } else if (modelName.includes('duration')) {
        // Duration prediction
        const baseDuration = 30; // base duration in days
        const complexity = features.complexity || 1;
        const scope = features.scope || 1;
        return [baseDuration * complexity * scope * (0.8 + Math.random() * 0.4)];
      } else {
        // Generic regression - random value between 0 and 100
        return [Math.random() * 100];
      }
    } else if (modelType === 'recommendation') {
      if (modelName.includes('assignment')) {
        // Task assignment - return mock employee IDs with scores
        const employeeCount = 5;
        const result = [];
        for (let i = 0; i < employeeCount; i++) {
          result.push(Math.random()); // Score for each employee
        }
        return result;
      } else {
        // Generic recommendation - return 3 scores
        return [Math.random(), Math.random(), Math.random()];
      }
    } else {
      // Default fallback
      return [Math.random()];
    }
  }

  // Additional methods for model management
  async archiveModel(id: string): Promise<any> {
    const modelInfo = await this.mlRegistryRepository.update(id, { status: 'archived' });
    
    // Remove from active models map if it's there
    if (modelInfo && this.models.has(modelInfo.modelName)) {
      this.models.delete(modelInfo.modelName);
    }
    
    return modelInfo;
  }

  async deleteModel(id: string): Promise<any> {
    const modelInfo = await this.mlRegistryRepository.findById(id);
    
    if (modelInfo) {
      // Remove model from active models map if it's there
      if (this.models.has(modelInfo.modelName)) {
        this.models.delete(modelInfo.modelName);
      }
      
      return this.mlRegistryRepository.remove(id);
    }
    
    return null;
  }

  async getModelInfo(modelName: string): Promise<any> {
    return this.mlRegistryRepository.getActiveModel(modelName);
  }

  async findAllModels(): Promise<any[]> {
    return this.mlRegistryRepository.findAll();
  }

  async findModelById(id: string): Promise<any> {
    return this.mlRegistryRepository.findById(id);
  }
}