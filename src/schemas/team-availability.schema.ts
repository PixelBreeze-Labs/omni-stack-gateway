// src/schemas/team-availability.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum AvailabilityStatus {
  AVAILABLE = 'available',
  BUSY = 'busy',
  BREAK = 'break',
  OFFLINE = 'offline',
  EMERGENCY = 'emergency'
}

@Schema({
  timestamps: true,
  collection: 'team_availability'
})
export class TeamAvailability extends Document {
  @Prop({ required: true, index: true })
  businessId: string;

  @Prop({ required: true, index: true })
  teamId: string;

  @Prop({ required: true })
  teamName: string;

  @Prop({ enum: AvailabilityStatus, default: AvailabilityStatus.AVAILABLE })
  status: AvailabilityStatus;

  @Prop({ type: Date, default: Date.now })
  statusSince: Date;

  @Prop()
  currentTaskId?: string;

  @Prop()
  currentRouteId?: string;

  @Prop({ type: Date })
  availableUntil?: Date;

  @Prop({
    type: {
      monday: { start: String, end: String, available: Boolean },
      tuesday: { start: String, end: String, available: Boolean },
      wednesday: { start: String, end: String, available: Boolean },
      thursday: { start: String, end: String, available: Boolean },
      friday: { start: String, end: String, available: Boolean },
      saturday: { start: String, end: String, available: Boolean },
      sunday: { start: String, end: String, available: Boolean }
    }
  })
  workingHours?: {
    monday: { start: string; end: string; available: boolean };
    tuesday: { start: string; end: string; available: boolean };
    wednesday: { start: string; end: string; available: boolean };
    thursday: { start: string; end: string; available: boolean };
    friday: { start: string; end: string; available: boolean };
    saturday: { start: string; end: string; available: boolean };
    sunday: { start: string; end: string; available: boolean };
  };

  @Prop({
    type: [{
      start: { type: Date, required: true },
      end: { type: Date, required: true },
      reason: { type: String, required: true },
      type: { 
        type: String, 
        enum: ['vacation', 'sick_leave', 'training', 'personal', 'maintenance'],
        required: true 
      }
    }]
  })
  unavailablePeriods: Array<{
    start: Date;
    end: Date;
    reason: string;
    type: 'vacation' | 'sick_leave' | 'training' | 'personal' | 'maintenance';
  }>;

  @Prop({
    type: [{
      skill: { type: String, required: true },
      level: { type: Number, min: 1, max: 5, required: true }
    }]
  })
  skills: Array<{
    skill: string;
    level: number;
  }>;

  @Prop()
  maxTasksPerDay?: number;

  @Prop()
  maxWorkingHoursPerDay?: number;

  @Prop({ type: Date })
  lastStatusUpdate: Date;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;

  @Prop()
  createdBy: string;

  @Prop()
  updatedBy?: string;
}

export const TeamAvailabilitySchema = SchemaFactory.createForClass(TeamAvailability);

// Create indexes for performance
TeamAvailabilitySchema.index({ businessId: 1, teamId: 1 });
TeamAvailabilitySchema.index({ businessId: 1, status: 1 });
TeamAvailabilitySchema.index({ availableUntil: 1 });
TeamAvailabilitySchema.index({ lastStatusUpdate: -1 });