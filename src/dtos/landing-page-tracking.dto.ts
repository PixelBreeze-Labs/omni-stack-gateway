// src/dto/landing-page-tracking.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum LandingPageActionType {
  PAGE_VIEW = 'PAGE_VIEW',
  GOOGLE_REVIEW_CLICK = 'GOOGLE_REVIEW_CLICK',
  APP_LINK_CLICK = 'APP_LINK_CLICK',
  REGISTRATION_START = 'REGISTRATION_START'
}

export class LandingPageTrackingDto {
  @ApiProperty({
    description: 'Restaurant hash ID',
    example: 'abc123'
  })
  @IsString()
  @IsNotEmpty()
  hashId: string;

  @ApiProperty({
    description: 'Type of action performed on the landing page',
    enum: LandingPageActionType,
    example: LandingPageActionType.PAGE_VIEW
  })
  @IsEnum(LandingPageActionType)
  @IsNotEmpty()
  actionType: LandingPageActionType;

  @ApiProperty({
    description: 'User IP address',
    example: '192.168.1.1',
    required: false
  })
  @IsString()
  @IsOptional()
  ipAddress?: string;

  @ApiProperty({
    description: 'User agent string',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    required: false
  })
  @IsString()
  @IsOptional()
  userAgent?: string;

  @ApiProperty({
    description: 'Referrer URL',
    example: 'https://google.com',
    required: false
  })
  @IsString()
  @IsOptional()
  referrer?: string;
}