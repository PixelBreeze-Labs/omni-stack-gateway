
// src/ai/dto/create-detection-result.dto.ts
import { IsString, IsArray, IsObject, IsOptional, IsDate, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

class CoordinatesDto {
  readonly xmin: number;
  readonly ymin: number;
  readonly xmax: number;
  readonly ymax: number;
}

class PredictionDto {
  @IsString()
  readonly class_title: string;

  readonly model_id: number;
  readonly score: number;

  @IsObject()
  readonly coordinates: CoordinatesDto;

  @IsString()
  @IsOptional()
  readonly track_id?: string;

  @IsString()
  @IsOptional()
  readonly id?: string;

  @IsOptional()
  readonly index?: number;
}

export class CreateDetectionResultDto {
  @IsString()
  readonly prediction_type: string;

  @IsString()
  readonly status: string;

  @IsOptional()
  readonly output_data?: any;

  @IsArray()
  @Type(() => PredictionDto)
  readonly predictions: PredictionDto[];

  @IsString()
  @IsOptional()
  readonly image_meta?: string;

  @IsString()
  @IsOptional()
  readonly image_url?: string;

  @IsString()
  readonly modelId: string;

  @IsString()
  readonly clientId: string;

  @IsString()
  @IsOptional()
  readonly cameraId?: string;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  readonly detectionTime?: Date;

  @IsObject()
  @IsOptional()
  readonly metadata?: Record<string, any>;
}