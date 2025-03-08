// src/dtos/social-profile.dto.ts
import { IsEnum, IsMongoId, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';
import { SocialProfileType } from '../schemas/social-profile.schema';

export class CreateSocialProfileDto {
  @IsNotEmpty()
  @IsEnum(SocialProfileType)
  type: SocialProfileType;

  @IsNotEmpty()
  @IsString()
  accountName: string;

  @IsNotEmpty()
  @IsString()
  username: string;

  @IsOptional()
  @IsUrl()
  url?: string;

  @IsNotEmpty()
  @IsMongoId()
  operatingEntityId: string;

  @IsNotEmpty()
  @IsMongoId()
  clientId: string;
}

export class UpdateSocialProfileDto {
  @IsOptional()
  @IsEnum(SocialProfileType)
  type?: SocialProfileType;

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsMongoId()
  operatingEntityId?: string;
}

export class ListSocialProfileDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsMongoId()
  operatingEntityId?: string;

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