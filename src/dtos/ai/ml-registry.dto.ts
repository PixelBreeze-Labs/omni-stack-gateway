// src/dtos/ai/ml-registry.dto.ts
import { IsString, IsObject, IsArray, IsOptional, IsDate, IsEnum } from 'class-validator';

export class CreateMLRegistryDto {
  @IsString()
  modelName: string;
  
  @IsString()
  version: string;
  
  @IsEnum(['regression', 'classification', 'clustering', 'timeseries'])
  type: string;
  
  @IsEnum(['training', 'active', 'archived', 'failed'])
  status: string;
  
  @IsString()
  @IsOptional()
  modelPath?: string;
  
  @IsObject()
  @IsOptional()
  metrics?: Record<string, number>;
  
  @IsArray()
  @IsOptional()
  features?: string[];
  
  @IsObject()
  @IsOptional()
  hyperparameters?: Record<string, any>;
  
  @IsString()
  @IsOptional()
  description?: string;
  
  @IsDate()
  @IsOptional()
  trainedAt?: Date;
  
  @IsString()
  @IsOptional()
  businessId?: string;
  
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateMLRegistryDto {
  @IsEnum(['training', 'active', 'archived', 'failed'])
  @IsOptional()
  status?: string;
  
  @IsString()
  @IsOptional()
  modelPath?: string;
  
  @IsObject()
  @IsOptional()
  metrics?: Record<string, number>;
  
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}