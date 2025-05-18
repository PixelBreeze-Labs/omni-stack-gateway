// src/dtos/ai/feature-collection.dto.ts
import { IsString, IsObject, IsOptional, IsDate } from 'class-validator';

export class CreateFeatureCollectionDto {
  @IsString()
  featureSetName: string;
  
  @IsString()
  entityType: string;
  
  @IsString()
  entityId: string;
  
  @IsObject()
  features: Record<string, any>;
  
  @IsString()
  @IsOptional()
  businessId?: string;
  
  @IsDate()
  @IsOptional()
  updatedAt?: Date;
  
  @IsDate()
  @IsOptional()
  validUntil?: Date;
  
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateFeatureCollectionDto {
  @IsObject()
  @IsOptional()
  features?: Record<string, any>;
  
  @IsDate()
  @IsOptional()
  updatedAt?: Date;
  
  @IsDate()
  @IsOptional()
  validUntil?: Date;
  
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}