// src/schemas/activity.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum ActivityType {
  // Timesheet & Work
  TIMESHEET_CLOCK_IN = 'timesheet_clock_in',
  TIMESHEET_CLOCK_OUT = 'timesheet_clock_out',
  TIMESHEET_BREAK_START = 'timesheet_break_start',
  TIMESHEET_BREAK_END = 'timesheet_break_end',
  OVERTIME_START = 'overtime_start',

  // Projects & Tasks
  TASK_CREATE = 'task_create',
  TASK_COMPLETE = 'task_complete',
  TASK_UPDATE = 'task_update',
  PROJECT_START = 'project_start',
  PROJECT_COMPLETE = 'project_complete',

  // Client & Communication
  CLIENT_CONTACT = 'client_contact',
  CLIENT_MEETING = 'client_meeting',
  FEEDBACK_RECEIVED = 'feedback_received',
  COMPLAINT_RECEIVED = 'complaint_received',

  // Quality & Inspections
  QUALITY_CHECK = 'quality_check',
  ISSUE_FOUND = 'issue_found',
  ISSUE_RESOLVED = 'issue_resolved',
  SAFETY_CHECK = 'safety_check',

  // Media & Documents
  PHOTO_UPLOAD = 'photo_upload',
  DOCUMENT_UPLOAD = 'document_upload',
  REPORT_GENERATE = 'report_generate',
  FILE_DELETE = 'file_delete',

  // Location & Movement
  LOCATION_UPDATE = 'location_update',
  SITE_ARRIVAL = 'site_arrival',
  SITE_DEPARTURE = 'site_departure',
  TRAVEL_START = 'travel_start',
  TRAVEL_END = 'travel_end',

  // Equipment & Supplies
  EQUIPMENT_CHECKOUT = 'equipment_checkout',
  EQUIPMENT_RETURN = 'equipment_return',
  SUPPLIES_REQUEST = 'supplies_request',
  INVENTORY_UPDATE = 'inventory_update',

  BUSINESS_CONFIG_UPDATED = 'business_config_updated',
  BUSINESS_SETTINGS_CHANGED = 'business_settings_changed',
  NOTIFICATION_PREFERENCES_UPDATED = 'notification_preferences_updated',
}

export enum ActivityStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

@Schema({ timestamps: true })
export class AppActivity extends Document {
  // Basic identification
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId: string;

  @Prop({ required: true })
  userName: string;

  @Prop({ required: true })
  userEmail: string;

  // What happened
  @Prop({ required: true, type: String, enum: ActivityType })
  type: ActivityType;

  @Prop({ required: true })
  action: string;           // "John clocked in", "Sarah completed Task #123"

  @Prop()
  description?: string;     // Extra details

  // When & Where
  @Prop({ default: Date.now })
  timestamp: Date;

  @Prop({ type: MongooseSchema.Types.Mixed })
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };

  // Context
  @Prop()
  department?: string;

  @Prop()
  team?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  projectId?: string;

  @Prop()
  projectName?: string;

  // Device info
  @Prop()
  deviceType?: string;      // "mobile", "desktop"

  @Prop()
  ipAddress?: string;

  // Resource affected
  @Prop()
  resourceType?: string;    // "task", "client", "media", "equipment"

  @Prop()
  resourceId?: string;

  @Prop()
  resourceName?: string;

  // Status
  @Prop({ type: String, enum: ActivityStatus, default: ActivityStatus.COMPLETED })
  status: ActivityStatus;

  @Prop()
  durationMinutes?: number;

  // Extra data (flexible for different activity types)
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  data: {
    // Timesheet specific
    shiftId?: string;
    breakType?: string;
    overtimeHours?: number;
    
    // Task specific
    taskId?: string;
    taskStatus?: string;
    estimatedHours?: number;
    
    // Client specific
    clientId?: string;
    clientName?: string;
    contactMethod?: string;
    
    // Media specific
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    
    // Location specific
    previousLocation?: { lat: number; lng: number };
    travelDistance?: number;
    
    // Equipment specific
    equipmentId?: string;
    equipmentName?: string;
    condition?: string;
    
    // Quality specific
    inspectionScore?: number;
    issuesFound?: number;
    
    // Any other custom data
    [key: string]: any;
  };

  // Cleanup
  @Prop()
  expiresAt?: Date;
}

export const AppActivitySchema = SchemaFactory.createForClass(AppActivity);

// Indexes for performance
AppActivitySchema.index({ businessId: 1 });
AppActivitySchema.index({ userId: 1 });
AppActivitySchema.index({ type: 1 });
AppActivitySchema.index({ timestamp: 1 });
AppActivitySchema.index({ department: 1 });
AppActivitySchema.index({ team: 1 });
AppActivitySchema.index({ projectId: 1 });
AppActivitySchema.index({ resourceType: 1 });
AppActivitySchema.index({ status: 1 });
AppActivitySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound indexes for common queries
AppActivitySchema.index({ businessId: 1, timestamp: -1 });
AppActivitySchema.index({ businessId: 1, userId: 1 });
AppActivitySchema.index({ businessId: 1, type: 1 });
AppActivitySchema.index({ businessId: 1, department: 1 });
AppActivitySchema.index({ businessId: 1, team: 1 });
AppActivitySchema.index({ businessId: 1, projectId: 1 });
AppActivitySchema.index({ businessId: 1, status: 1 });

// Virtual for business reference
AppActivitySchema.virtual('business', {
  ref: 'Business',
  localField: 'businessId',
  foreignField: '_id',
  justOne: true
});

// Virtual for user reference
AppActivitySchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});