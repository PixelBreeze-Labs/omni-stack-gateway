// src/dtos/ai/insight-collection.dto.ts
import { IsString, IsObject, IsArray, IsOptional, IsDate, IsEnum } from 'class-validator';

export class CreateInsightCollectionDto {
  @IsString()
  insightType: string;
  
  @IsString()
  entityType: string;
  
  @IsString()
  entityId: string;
  
  @IsObject()
  insights: {
    score?: number;
    risk?: number;
    factors?: Array<{ factor: string; impact: number }>;
    trends?: Array<{ name: string; direction: string; value: number }>;
    anomalies?: Array<{ type: string; severity: string; description: string }>;
    recommendations?: Array<{ action: string; impact: string; priority: string }>;
    [key: string]: any;
  };
  
  @IsString()
  @IsOptional()
  businessId?: string;
  
  @IsDate()
  @IsOptional()
  validFrom?: Date;
  
  @IsDate()
  @IsOptional()
  validTo?: Date;
  
  @IsString()
  @IsOptional()
  generatedBy?: string;
  
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateInsightCollectionDto {
  @IsObject()
  @IsOptional()
  insights?: {
    score?: number;
    risk?: number;
    factors?: Array<{ factor: string; impact: number }>;
    trends?: Array<{ name: string; direction: string; value: number }>;
    anomalies?: Array<{ type: string; severity: string; description: string }>;
    recommendations?: Array<{ action: string; impact: string; priority: string }>;
    [key: string]: any;
  };
  
  @IsDate()
  @IsOptional()
  validTo?: Date;
  
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}