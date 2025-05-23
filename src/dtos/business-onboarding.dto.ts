// src/dto/business-onboarding.dto.ts
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

export interface CreateBusinessOnboardingDto {
  businessId: string;
  type: OnboardingType;
  deviceType?: string;
  userAgent?: string;
  isPWA?: boolean;
  isFirstTime?: boolean;
}

export interface UpdateBusinessOnboardingDto {
  currentStep?: number;
  status?: OnboardingStatus;
  completedSteps?: SetupStep[];
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