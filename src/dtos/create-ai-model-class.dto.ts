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