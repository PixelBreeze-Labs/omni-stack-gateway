// src/schemas/business-onboarding.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum OnboardingType {
  WALKTHROUGH = 'walkthrough',
  SETUP_GUIDE = 'setup_guide'
}

export enum OnboardingStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
  DISMISSED = 'dismissed'
}

export enum SetupStep {
  WELCOME = 'welcome',
  DEPARTMENTS = 'departments',
  ROLES = 'roles',
  EMPLOYEES = 'employees',
  TEAMS = 'teams'
}

@Schema({ 
  collection: 'business_onboarding',
  timestamps: true 
})
export class BusinessOnboarding extends Document {
  @Prop({ 
    required: true, 
    type: MongooseSchema.Types.ObjectId, 
    ref: 'Business',
    index: true 
  })
  businessId: string;

  @Prop({ 
    type: String, 
    enum: OnboardingType, 
    required: true,
    index: true 
  })
  type: OnboardingType;

  @Prop({ 
    type: String, 
    enum: OnboardingStatus, 
    required: true,
    default: OnboardingStatus.NOT_STARTED,
    index: true 
  })
  status: OnboardingStatus;

  @Prop({ 
    type: Number, 
    default: 0,
    min: 0 
  })
  currentStep: number;

  @Prop({ 
    type: Number, 
    default: 5
  })
  totalSteps: number;

  @Prop({ 
    type: [String], 
    enum: SetupStep,
    default: [] 
  })
  completedSteps: SetupStep[];

  @Prop({ 
    type: Number, 
    default: 0,
    min: 0,
    max: 100 
  })
  progressPercentage: number;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Date })
  lastActiveAt?: Date;

  @Prop({ 
    type: Number, 
    default: 0 
  })
  completionCount: number;

  @Prop({ 
    type: Boolean, 
    default: false 
  })
  isFirstTime: boolean;

  @Prop({ type: String })
  deviceType?: string;

  @Prop({ type: String })
  userAgent?: string;

  @Prop({ type: Boolean, default: false })
  isPWA: boolean;

  @Prop({ 
    type: MongooseSchema.Types.Mixed,
    default: {} 
  })
  metadata: {
    dismissalReason?: string;
    lastCompletedStep?: string;
    timeSpentMinutes?: number;
    skipCount?: number;
    [key: string]: any;
  };

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const BusinessOnboardingSchema = SchemaFactory.createForClass(BusinessOnboarding);

// Indexes
BusinessOnboardingSchema.index({ businessId: 1, type: 1 }, { unique: true });
BusinessOnboardingSchema.index({ businessId: 1, status: 1 });
BusinessOnboardingSchema.index({ status: 1, type: 1 });
BusinessOnboardingSchema.index({ completedAt: 1 });
BusinessOnboardingSchema.index({ isDeleted: 1 });