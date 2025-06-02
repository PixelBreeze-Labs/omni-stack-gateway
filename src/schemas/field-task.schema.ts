// src/schemas/field-task.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum FieldTaskType {
  INSTALLATION = 'installation',
  MAINTENANCE = 'maintenance',
  INSPECTION = 'inspection',
  DELIVERY = 'delivery',
  PICKUP = 'pickup',
  CONSULTATION = 'consultation',
  REPAIR = 'repair',
  SURVEY = 'survey'
}

export enum FieldTaskStatus {
  PENDING = 'pending',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  ON_HOLD = 'on_hold',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  RESCHEDULED = 'rescheduled'
}

export enum FieldTaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
  EMERGENCY = 'emergency'
}

export interface TimeWindow {
  start: string; // HH:MM format
  end: string;   // HH:MM format
  isFlexible: boolean;
  preferredTime?: string; // HH:MM format
}

export interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  accessInstructions?: string;
  parkingNotes?: string;
}

export interface CustomerSignoff {
  signatureUrl: string;
  signedBy: string;
  signedAt: Date;
  customerNotes?: string;
  satisfactionRating?: number; // 1-5
}

export interface WeatherImpact {
  affectedDate: Date;
  weatherType: string;
  severity: string;
  delayHours: number;
  notes: string;
  rescheduled: boolean;
}

@Schema({ timestamps: true })
export class FieldTask extends Document {
  @Prop({ required: true })
  taskId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'AppProject' })
  projectId?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ConstructionSite' })
  siteId?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client' })
  clientId?: string;


  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'AppClient' })
  appClientId: string;

  @Prop()
  serviceOrderId?: string;

  @Prop({ 
    type: String, 
    enum: FieldTaskType, 
    required: true 
  })
  type: FieldTaskType;

  @Prop({ 
    type: String, 
    enum: FieldTaskPriority, 
    default: FieldTaskPriority.MEDIUM 
  })
  priority: FieldTaskPriority;

  @Prop({ 
    type: String, 
    enum: FieldTaskStatus, 
    default: FieldTaskStatus.PENDING 
  })
  status: FieldTaskStatus;

  @Prop({ type: Object, required: true })
  location: LocationData;

  @Prop({ required: true })
  scheduledDate: Date;

  @Prop({ type: Object, required: true })
  timeWindow: TimeWindow;

  @Prop({ type: Number, required: true }) // minutes
  estimatedDuration: number;

  @Prop({ type: [String], default: [] })
  skillsRequired: string[];

  @Prop({ type: [String], default: [] })
  equipmentRequired: string[];

  @Prop()
  specialInstructions?: string;

  @Prop()
  assignedTeamId?: string; // Reference to team in Business.teams

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Route' })
  assignedRouteId?: string;

  @Prop({ type: Number }) // 1-5 scale
  difficultyLevel?: number;

  @Prop({ type: Object })
  customerInfo: {
    name: string;
    email?: string;
    phone?: string;
    contactPreference: 'email' | 'phone' | 'sms';
    specialRequests?: string;
  };

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Object })
  customerSignoff?: CustomerSignoff;

  @Prop({ type: [String], default: [] })
  photos: string[]; // URLs to uploaded photos

  @Prop({ type: [String], default: [] })
  documents: string[]; // URLs to related documents

  @Prop()
  completionNotes?: string;

  @Prop({ type: [Object], default: [] })
  weatherImpacts: WeatherImpact[];

  @Prop({ type: Object })
  actualPerformance: {
    startTime?: Date;
    endTime?: Date;
    actualDuration?: number; // minutes
    delays?: Array<{
      reason: string;
      duration: number; // minutes
      timestamp: Date;
    }>;
  };

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  assignedBy?: string;

  @Prop({ type: Date })
  assignedAt?: Date;

  @Prop({ type: Object, default: {} })
  externalIds: {
    venueBoostTaskId?: string;
    legacyTaskId?: string;
    [key: string]: string;
  };

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const FieldTaskSchema = SchemaFactory.createForClass(FieldTask);

// Add indexes
FieldTaskSchema.index({ businessId: 1, scheduledDate: 1 });
FieldTaskSchema.index({ taskId: 1 }, { unique: true });
FieldTaskSchema.index({ appClientId: 1 });
FieldTaskSchema.index({ projectId: 1 });
FieldTaskSchema.index({ siteId: 1 });
FieldTaskSchema.index({ clientId: 1 });
FieldTaskSchema.index({ assignedTeamId: 1 });
FieldTaskSchema.index({ assignedRouteId: 1 });
FieldTaskSchema.index({ status: 1 });
FieldTaskSchema.index({ priority: 1 });
FieldTaskSchema.index({ type: 1 });
FieldTaskSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });
FieldTaskSchema.index({ skillsRequired: 1 });
FieldTaskSchema.index({ equipmentRequired: 1 });
