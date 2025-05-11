// src/schemas/staff-profile.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum SkillLevel {
  NOVICE = 'novice',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert'
}

@Schema({ timestamps: true })
export class StaffProfile extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  skills: Record<string, { 
    level: SkillLevel, 
    yearsExperience: number 
  }>;

  @Prop({ type: [String] })
  certifications: string[];

  @Prop({ type: [String] })
  specializations: string[];

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

  @Prop({ type: Number, default: 0 })
  taskCompletionRate: number;

  @Prop({ type: Number, default: 0 })
  averageRating: number;

  @Prop({ type: Number, default: 0 })
  currentWorkload: number;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;

  
}

export const StaffProfileSchema = SchemaFactory.createForClass(StaffProfile);

// Add indexes
StaffProfileSchema.index({ userId: 1 });
StaffProfileSchema.index({ businessId: 1 });
StaffProfileSchema.index({ 'skills.level': 1 });