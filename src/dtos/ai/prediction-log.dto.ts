// src/dtos/ai/prediction-log.dto.ts
import { IsString, IsObject, IsOptional, IsBoolean, IsNumber } from 'class-validator';

export class CreatePredictionLogDto {
  @IsString()
  modelId: string;
  
  @IsString()
  entityType: string;
  
  @IsString()
  entityId: string;
  
  @IsObject()
  input: Record<string, any>;
  
  @IsObject()
  output: Record<string, any>;
  
  @IsString()
  @IsOptional()
  businessId?: string;
  
  @IsNumber()
  @IsOptional()
  confidence?: number;
  
  @IsString()
  @IsOptional()
  userId?: string;
  
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdatePredictionLogDto {
  @IsBoolean()
  @IsOptional()
  feedbackProvided?: boolean;
  
  @IsBoolean()
  @IsOptional()
  feedbackCorrect?: boolean;
  
  @IsObject()
  @IsOptional()
  actualOutcome?: Record<string, any>;
}