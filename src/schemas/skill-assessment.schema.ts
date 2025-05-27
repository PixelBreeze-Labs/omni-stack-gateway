// src/schemas/skill-assessment.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { SkillLevel, SkillSource } from './staff-profile.schema';

export enum AssessmentStatus {
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  NEEDS_REVISION = 'needs_revision',
  PARTIALLY_APPROVED = 'partially_approved'
}

export enum AssessmentTrigger {
  NEW_EMPLOYEE = 'new_employee',        // Automatically created for new employees
  PERIODIC_REVIEW = 'periodic_review',  // Scheduled review
  MANUAL_REQUEST = 'manual_request',    // Manually requested by manager
  PERFORMANCE_TRIGGER = 'performance_trigger', // Triggered by performance metrics
  ROLE_CHANGE = 'role_change',          // Employee changed roles
  SELF_REQUESTED = 'self_requested'     // Employee requested review
}

@Schema({ timestamps: true })
export class SkillAssessment extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'StaffProfile' })
  staffProfileId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  employeeUserId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  reviewerId?: string;                   // Who is reviewing this assessment

  @Prop({ type: String, enum: AssessmentStatus, default: AssessmentStatus.PENDING_REVIEW })
  status: AssessmentStatus;

  @Prop({ type: String, enum: AssessmentTrigger, required: true })
  trigger: AssessmentTrigger;

  // The inferred/proposed skills
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  proposedSkills: Record<string, {
    level: SkillLevel;
    yearsExperience: number;
    source: SkillSource;
    confidence: number;
    reasoning: string;                   // Why this skill was inferred
  }>;

  // Business adjustments to the proposed skills
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  businessAdjustments: {
    skillName: string;
    action: 'add' | 'remove' | 'modify';
    oldLevel?: SkillLevel;
    newLevel?: SkillLevel;
    oldExperience?: number;
    newExperience?: number;
    reason: string;
    adjustedBy: string;                  // User ID who made the adjustment
    adjustedAt: Date;
  }[];

  // Final approved skills (after adjustments)
  @Prop({ type: MongooseSchema.Types.Mixed })
  finalSkills?: Record<string, {
    level: SkillLevel;
    yearsExperience: number;
    source: SkillSource;
    confidence: number;
    verified: boolean;
    verifiedBy: string;
    verifiedAt: Date;
  }>;

  @Prop({ type: String })
  reviewNotes?: string;

  @Prop({ type: String })
  rejectionReason?: string;

  @Prop({ type: Date })
  reviewedAt?: Date;

  @Prop({ type: Date })
  approvedAt?: Date;

  @Prop({ type: Date, required: true })
  dueDate: Date;                        // When this assessment should be completed

  // Assessment workflow tracking
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  workflowHistory: {
    action: string;
    performedBy: string;
    performedAt: Date;
    notes?: string;
    previousStatus?: AssessmentStatus;
    newStatus: AssessmentStatus;
  }[];

  // Performance data that influenced this assessment
  @Prop({ type: MongooseSchema.Types.Mixed })
  performanceContext?: {
    taskCompletionRate: number;
    averageRating: number;
    recentTaskTypes: string[];
    customerFeedback: number;
    peerRatings: number;
    tenureMonths: number;
    industryExperienceMonths: number;
  };
}

export const SkillAssessmentSchema = SchemaFactory.createForClass(SkillAssessment);

// Indexes
SkillAssessmentSchema.index({ staffProfileId: 1 });
SkillAssessmentSchema.index({ businessId: 1 });
SkillAssessmentSchema.index({ employeeUserId: 1 });
SkillAssessmentSchema.index({ reviewerId: 1 });
SkillAssessmentSchema.index({ status: 1 });
SkillAssessmentSchema.index({ trigger: 1 });
SkillAssessmentSchema.index({ dueDate: 1 });
SkillAssessmentSchema.index({ createdAt: 1 });

// ============================================================================
// SKILL TEMPLATES SCHEMA
// ============================================================================

@Schema({ timestamps: true })
export class SkillTemplate extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: String, required: true })
  industry: string;                     // Maps to BusinessIndustry

  @Prop({ type: String })
  subCategory?: string;                 // Maps to BusinessSubCategory

  @Prop({ type: [String], default: [] })
  applicableRoles: string[];            // Which roles this template applies to

  @Prop({ type: String })
  department?: string;

  // Skill definitions for this template
  @Prop({ type: [MongooseSchema.Types.Mixed], required: true })
  skills: {
    name: string;
    description: string;
    category: string;                   // 'technical', 'soft', 'safety', 'compliance'
    importance: number;                 // 1-10, how important is this skill
    requiredLevel: SkillLevel;          // Minimum required level
    learningPath?: string[];            // Suggested steps to learn this skill
    relatedSkills?: string[];           // Skills that complement this one
    decayRate?: number;                 // How quickly this skill becomes stale (months)
  }[];

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy?: string;

  @Prop({ type: Number, default: 0 })
  usageCount: number;                   // How many businesses use this template

  @Prop({ type: [String], default: [] })
  tags: string[];                       // For easier searching/filtering
}

export const SkillTemplateSchema = SchemaFactory.createForClass(SkillTemplate);

// Indexes
SkillTemplateSchema.index({ industry: 1, subCategory: 1 });
SkillTemplateSchema.index({ applicableRoles: 1 });
SkillTemplateSchema.index({ department: 1 });
SkillTemplateSchema.index({ tags: 1 });
SkillTemplateSchema.index({ name: 'text', description: 'text', tags: 'text' });

// ============================================================================
// SKILL DEVELOPMENT PLAN SCHEMA
// ============================================================================

@Schema({ timestamps: true })
export class SkillDevelopmentPlan extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'StaffProfile' })
  staffProfileId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  employeeUserId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  assignedBy?: string;                  // Manager who assigned this plan

  @Prop({ required: true })
  title: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true })
  targetCompletionDate: Date;

  @Prop({ type: String, enum: ['active', 'completed', 'cancelled', 'on_hold'], default: 'active' })
  status: string;

  // Skills to develop in this plan
  @Prop({ type: [MongooseSchema.Types.Mixed], required: true })
  skillGoals: {
    skillName: string;
    currentLevel: SkillLevel;
    targetLevel: SkillLevel;
    priority: 'high' | 'medium' | 'low';
    estimatedTimeMonths: number;
    
    // Learning activities
    activities: {
      type: 'training' | 'mentoring' | 'project' | 'shadowing' | 'certification';
      title: string;
      description: string;
      estimatedHours: number;
      dueDate?: Date;
      completed: boolean;
      completedDate?: Date;
      notes?: string;
    }[];
    
    // Progress tracking
    progress: number;                   // 0-100%
    milestones: {
      description: string;
      targetDate: Date;
      completed: boolean;
      completedDate?: Date;
      evidence?: string;                // Link to evidence of completion
    }[];
  }[];

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  progressUpdates: {
    updateDate: Date;
    updatedBy: string;                  // User ID
    summary: string;
    skillProgress: Record<string, number>; // Skill name -> progress %
    challenges?: string;
    achievements?: string;
    nextSteps?: string;
  }[];

  @Prop({ type: Number, default: 0 })
  overallProgress: number;              // 0-100%

  @Prop({ type: Date })
  completedDate?: Date;

  @Prop({ type: String })
  completionNotes?: string;
}

export const SkillDevelopmentPlanSchema = SchemaFactory.createForClass(SkillDevelopmentPlan);

// Indexes
SkillDevelopmentPlanSchema.index({ staffProfileId: 1 });
SkillDevelopmentPlanSchema.index({ businessId: 1 });
SkillDevelopmentPlanSchema.index({ employeeUserId: 1 });
SkillDevelopmentPlanSchema.index({ assignedBy: 1 });
SkillDevelopmentPlanSchema.index({ status: 1 });
SkillDevelopmentPlanSchema.index({ startDate: 1 });
SkillDevelopmentPlanSchema.index({ targetCompletionDate: 1 });