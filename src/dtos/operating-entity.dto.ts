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