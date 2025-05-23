// src/dto/business-onboarding.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsNumber, IsBoolean, IsOptional, IsArray } from 'class-validator';
import { OnboardingType, OnboardingStatus, SetupStep } from '../schemas/business-onboarding.schema';

export interface BusinessOnboardingResponse {
  id: string;
  businessId: string;
  type: OnboardingType;
  status: OnboardingStatus;
  currentStep: number;
  totalSteps: number;
  completedSteps: SetupStep[];
  progressPercentage: number;
  isFirstTime: boolean;
  startedAt?: Date;
  completedAt?: Date;
  lastActiveAt?: Date;
  metadata: Record<string, any>;
}

export class CreateBusinessOnboardingDto {
  @ApiProperty({ description: 'Business ID' })
  @IsString()
  businessId: string;

  @ApiProperty({ enum: OnboardingType, description: 'Type of onboarding' })
  @IsEnum(OnboardingType)
  type: OnboardingType;

  @ApiPropertyOptional({ description: 'Device type (desktop, mobile, tablet)' })
  @IsOptional()
  @IsString()
  deviceType?: string;

  @ApiPropertyOptional({ description: 'User agent string' })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiPropertyOptional({ description: 'Is Progressive Web App' })
  @IsOptional()
  @IsBoolean()
  isPWA?: boolean;

  @ApiPropertyOptional({ description: 'Is first time user' })
  @IsOptional()
  @IsBoolean()
  isFirstTime?: boolean;
}

export class UpdateBusinessOnboardingDto {
  @ApiPropertyOptional({ description: 'Current step number' })
  @IsOptional()
  @IsNumber()
  currentStep?: number;

  @ApiPropertyOptional({ enum: OnboardingStatus, description: 'Onboarding status' })
  @IsOptional()
  @IsEnum(OnboardingStatus)
  status?: OnboardingStatus;

  @ApiPropertyOptional({ enum: SetupStep, isArray: true, description: 'Completed steps' })
  @IsOptional()
  @IsArray()
  @IsEnum(SetupStep, { each: true })
  completedSteps?: SetupStep[];

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export interface OnboardingState {
  walkthrough: {
    isActive: boolean;
    currentStep: number;
    isComplete: boolean;
    completionCount: number;
  };
  setupGuide: {
    isActive: boolean;
    currentStep: number;
    isComplete: boolean;
    completedSteps: SetupStep[];
    progressPercentage: number;
  };
}

export interface OnboardingState {
  walkthrough: {
    isActive: boolean;
    currentStep: number;
    isComplete: boolean;
    completionCount: number;
  };
  setupGuide: {
    isActive: boolean;
    currentStep: number;
    isComplete: boolean;
    completedSteps: SetupStep[];
    progressPercentage: number;
  };
}