// src/ai/dto/create-ai-model.dto.ts
import { IsString, IsObject, IsBoolean, IsOptional, IsArray } from 'class-validator';

export class CreateAiModelDto {
  @IsString()
  readonly name: string;

  @IsString()
  @IsOptional()
  readonly description?: string;

  @IsString()
  @IsOptional()
  readonly image?: string;

  @IsObject()
  @IsOptional()
  readonly externalIds?: {
    nextJsId?: string;
    visionTrackId?: string;
    roboflowId?: string;
    omniStackId?: string;
    [key: string]: string;
  };

  @IsBoolean()
  @IsOptional()
  readonly isActive?: boolean;

  @IsString()
  readonly clientId: string;

  @IsArray()
  @IsOptional()
  readonly classIds?: string[];

  @IsObject()
  @IsOptional()
  readonly configuration?: Record<string, any>;

  @IsString()
  @IsOptional()
  readonly version?: string;

  @IsObject()
  @IsOptional()
  readonly metadata?: Record<string, any>;
}

// src/ai/dto/update-ai-model.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateAiModelDto } from './create-ai-model.dto';

export class UpdateAiModelDto extends PartialType(CreateAiModelDto) {}

// src/ai/dto/create-ai-model-class.dto.ts
import { IsString, IsObject, IsBoolean, IsOptional } from 'class-validator';

export class CreateAiModelClassDto {
  @IsString()
  readonly name: string;

  @IsString()
  @IsOptional()
  readonly image?: string;

  @IsString()
  @IsOptional()
  readonly description?: string;

  @IsString()
  readonly modelId: string;

  @IsString()
  readonly clientId: string;

  @IsObject()
  @IsOptional()
  readonly metadata?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  readonly isActive?: boolean;
}

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