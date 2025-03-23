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
