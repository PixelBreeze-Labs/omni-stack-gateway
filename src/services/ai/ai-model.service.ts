// src/ai/services/ai-model.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { MLRegistryRepository } from '../../repositories/ai/ml-registry.repository';
import { CreateMLRegistryDto } from '../../dtos/ai/ml-registry.dto';
import * as tf from '@tensorflow/tfjs';

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
          if (modelInfo.modelPath) {
            const model = await tf.loadLayersModel(`file://${modelInfo.modelPath}`);
            this.models.set(modelInfo.modelName, { 
              model, 
              info: modelInfo,
              tfModel: true
            });
            this.logger.log(`Loaded model: ${modelInfo.modelName}`);
          }
        } catch (error) {
          this.logger.error(`Failed to load model ${modelInfo.modelName}: ${error.message}`);
        }
      }
      
      this.logger.log(`Loaded ${this.models.size} active models`);
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
    
    // If it's an active model, load it into memory
    if (createDto.status === 'active' && createDto.modelPath) {
      try {
        const model = await tf.loadLayersModel(`file://${createDto.modelPath}`);
        this.models.set(createDto.modelName, { 
          model, 
          info: modelRegistry,
          tfModel: true
        });
      } catch (error) {
        this.logger.error(`Failed to load model ${createDto.modelName}: ${error.message}`);
      }
    }
    
    return modelRegistry;
  }

  async predict(modelName: string, features: Record<string, any>): Promise<any> {
    let modelEntry = this.models.get(modelName);
    
    if (!modelEntry) {
      this.logger.warn(`Model ${modelName} not found in memory, attempting to load`);
      
      // Try to find and load the model from the database
      const modelInfo = await this.mlRegistryRepository.getActiveModel(modelName);
      
      if (!modelInfo || !modelInfo.modelPath) {
        throw new Error(`No active model found for ${modelName}`);
      }
      
      // Load the model
      try {
        const model = await tf.loadLayersModel(`file://${modelInfo.modelPath}`);
        this.models.set(modelName, { 
          model, 
          info: modelInfo,
          tfModel: true
        });
        
        // Update modelEntry reference
        modelEntry = this.models.get(modelName);
      } catch (error) {
        throw new Error(`Failed to load model ${modelName}: ${error.message}`);
      }
    }
    
    if (modelEntry.tfModel) {
      // Create input tensor from features
      const featureTensor = this.createFeatureTensor(features, modelEntry.info.features);
      
      // Make prediction
      const prediction = modelEntry.model.predict(featureTensor);
      
      // Get result data
      const result = await prediction.data();
      
      // Clean up tensors
      featureTensor.dispose();
      prediction.dispose();
      
      return Array.from(result);
    } else {
      // Handle non-TensorFlow models
      throw new Error('Unsupported model type');
    }
  }

  private createFeatureTensor(features: Record<string, any>, featureNames: string[]) {
    // Extract features in the correct order
    const orderedFeatures = featureNames.map(name => features[name] || 0);
    
    // Create tensor
    return tf.tensor2d([orderedFeatures]);
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
}