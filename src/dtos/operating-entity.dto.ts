// src/dtos/operating-entity.dto.ts
import { IsEnum, IsMongoId, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';
import { OperatingEntityType } from '../schemas/operating-entity.schema';

export class CreateOperatingEntityDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsEnum(OperatingEntityType)
  type: OperatingEntityType;

  @IsOptional()
  @IsUrl()
  url?: string;

  @IsNotEmpty()
  @IsMongoId()
  clientId: string;
}

export class UpdateOperatingEntityDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(OperatingEntityType)
  type?: OperatingEntityType;

  @IsOptional()
  @IsUrl()
  url?: string;
}

export class ListOperatingEntityDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}