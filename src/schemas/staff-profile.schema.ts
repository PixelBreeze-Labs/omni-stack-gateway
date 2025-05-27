// src/schemas/staff-profile.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum SkillLevel {
  NOVICE = 'novice',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert'
}

export enum SkillSource {
  INFERRED = 'inferred',           // Auto-inferred from role/industry
  MANUAL = 'manual',               // Manually added by business
  SELF_ASSESSED = 'self_assessed', // Self-reported by employee
  PEER_REVIEWED = 'peer_reviewed', // Validated by peers
  PERFORMANCE = 'performance',     // Derived from task performance
  CERTIFIED = 'certified'          // From certifications/training
}

export enum ExperienceType {
  FULL_TIME = 'full_time',
  PART_TIME = 'part_time',
  CONTRACT = 'contract',
  FREELANCE = 'freelance',
  INTERNSHIP = 'internship',
  VOLUNTEER = 'volunteer'
}

// Enhanced skill data structure
export interface SkillData {
  level: SkillLevel;
  yearsExperience: number;
  monthsExperience?: number;       // More granular experience tracking
  lastUsed?: Date;
  source: SkillSource;
  confidence: number;              // 0-100, how confident we are in this assessment
  verified: boolean;               // Has this been verified/approved?
  verifiedBy?: string;             // Who verified it (user ID)
  verifiedAt?: Date;
  performanceRating?: number;      // 1-5, based on task performance
  notes?: string;                  // Additional notes about this skill
  trainingCompleted?: string[];    // Related training/certifications
}

// Past work experience structure
export interface WorkExperience {
  companyName: string;
  position: string;
  industry: string;
  startDate: Date;
  endDate?: Date;                  // null if current job
  durationMonths: number;
  type: ExperienceType;
  responsibilities: string[];
  skillsGained: string[];          // Skills learned in this role
  achievements?: string[];
  verified?: boolean;              // Has this experience been verified?
}

@Schema({ timestamps: true })
export class StaffProfile extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  // NEW: Basic employment info
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: true })
  email: string;

  @Prop({ type: Date })
  hireDate?: Date;

  @Prop({ type: String })
  role: string;

  @Prop({ type: String })
  department?: string;

  // NEW: Enhanced skills with detailed tracking
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  skills: Record<string, SkillData>;

  // NEW: Past work experience
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  workExperience: WorkExperience[];

  // NEW: Total experience calculations
  @Prop({ type: Number, default: 0 })
  totalWorkExperienceMonths: number;

  @Prop({ type: Number, default: 0 })
  currentTenureMonths: number;         // Months at current company

  @Prop({ type: Number, default: 0 })
  industryExperienceMonths: number;    // Experience in current industry

  @Prop({ type: [String] })
  certifications: string[];

  @Prop({ type: [String] })
  specializations: string[];

  // NEW: Education background
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  education: {
    institution: string;
    degree: string;
    field: string;
    graduationYear?: number;
    gpa?: number;
    honors?: string[];
  }[];

  // NEW: Training & development
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  training: {
    name: string;
    provider: string;
    completedDate: Date;
    expirationDate?: Date;
    certificateUrl?: string;
    skillsLearned: string[];
  }[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  availability: {
    preferredHours: {
      monday: { start: string, end: string },
      tuesday: { start: string, end: string },
      wednesday: { start: string, end: string },
      thursday: { start: string, end: string },
      friday: { start: string, end: string },
      saturday: { start: string, end: string },
      sunday: { start: string, end: string },
    },
    timeZone: string,
    vacationDays: Date[],
    maxWeeklyHours: number,
    currentWeeklyHours: number
  };

  @Prop({ type: MongooseSchema.Types.Mixed })
  location: {
    address: string,
    city: string,
    state: string,
    zipCode: string,
    country: string,
    coordinates: {
      latitude: number,
      longitude: number
    }
  };

  @Prop({ type: MongooseSchema.Types.Mixed })
  externalIds: {
    venueBoostStaffId?: string;
    [key: string]: string;
  };

  // Performance metrics
  @Prop({ type: Number, default: 0 })
  taskCompletionRate: number;

  @Prop({ type: Number, default: 0 })
  averageRating: number;

  @Prop({ type: Number, default: 0 })
  currentWorkload: number;

  // NEW: Enhanced performance tracking
  @Prop({ type: MongooseSchema.Types.Mixed })
  performanceMetrics: {
    tasksCompleted: number;
    tasksOnTime: number;
    averageTaskRating: number;
    customerFeedbackScore: number;
    peerRatingAverage: number;
    improvementAreas: string[];
    strengths: string[];
    lastPerformanceReview?: Date;
    nextPerformanceReview?: Date;
  };

  // NEW: Skill development tracking
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  skillAssessments: {
    skillName: string;
    assessmentDate: Date;
    assessorId: string;               // Who assessed
    assessorType: 'manager' | 'peer' | 'self' | 'customer';
    rating: number;                   // 1-5
    notes?: string;
    improvementPlan?: string;
  }[];

  // NEW: Goal setting and tracking
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  developmentGoals: {
    skillName: string;
    targetLevel: SkillLevel;
    targetDate: Date;
    currentProgress: number;          // 0-100%
    milestones: {
      description: string;
      completed: boolean;
      completedDate?: Date;
    }[];
    assignedBy?: string;              // Manager who assigned
    status: 'active' | 'completed' | 'cancelled';
  }[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;

  // NEW: Preferences and settings
  @Prop({ type: MongooseSchema.Types.Mixed })
  preferences: {
    skillSharingOptIn: boolean;       // Willing to mentor others
    receiveSkillRecommendations: boolean;
    allowPeerReviews: boolean;
    allowSelfAssessment: boolean;
    notifyOnSkillDecay: boolean;      // Notify when skills become stale
    preferredLearningStyle: 'visual' | 'auditory' | 'kinesthetic' | 'reading';
  };

  // NEW: Internal notes (only visible to managers)
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  internalNotes: {
    note: string;
    addedBy: string;                  // User ID who added the note
    addedAt: Date;
    category: 'performance' | 'behavior' | 'skill' | 'development' | 'other';
    isPrivate: boolean;               // Only visible to managers above certain level
  }[];
}

export const StaffProfileSchema = SchemaFactory.createForClass(StaffProfile);

// Add indexes
StaffProfileSchema.index({ userId: 1 });
StaffProfileSchema.index({ businessId: 1 });
StaffProfileSchema.index({ email: 1 });
StaffProfileSchema.index({ role: 1 });
StaffProfileSchema.index({ department: 1 });
StaffProfileSchema.index({ hireDate: 1 });
StaffProfileSchema.index({ 'skills.level': 1 });
StaffProfileSchema.index({ 'skills.source': 1 });
StaffProfileSchema.index({ totalWorkExperienceMonths: 1 });
StaffProfileSchema.index({ currentTenureMonths: 1 });
StaffProfileSchema.index({ taskCompletionRate: 1 });
StaffProfileSchema.index({ averageRating: 1 });

// Text search index for skills and experience
StaffProfileSchema.index({
  name: 'text',
  'skills': 'text',
  'workExperience.position': 'text',
  'workExperience.companyName': 'text',
  'certifications': 'text'
});