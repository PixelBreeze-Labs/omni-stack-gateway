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