// src/schemas/compliance-alert.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { RuleSeverity } from './compliance-rule.schema';

export enum AlertStatus {
  ACTIVE = 'active',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed'
}

export enum AlertType {
  CERTIFICATION_EXPIRY = 'certification_expiry',
  MISSING_CERTIFICATION = 'missing_certification',
  SCHEDULE_VIOLATION = 'schedule_violation',
  HOURS_VIOLATION = 'hours_violation',
  REST_VIOLATION = 'rest_violation',
  QUALIFICATION_VIOLATION = 'qualification_violation',
  CUSTOM_VIOLATION = 'custom_violation'
}

@Schema({ timestamps: true })
export class ComplianceAlert extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ComplianceRule' })
  ruleId: string;

  @Prop({ 
    type: String, 
    enum: AlertType, 
    required: true 
  })
  type: AlertType;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ 
    type: String, 
    enum: RuleSeverity, 
    default: RuleSeverity.MEDIUM 
  })
  severity: RuleSeverity;

  @Prop({ 
    type: String, 
    enum: AlertStatus, 
    default: AlertStatus.ACTIVE 
  })
  status: AlertStatus;

  @Prop({ type: Date })
  dueDate: Date;

  @Prop({ type: MongooseSchema.Types.Mixed })
  relatedData: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  acknowledgedBy: string;

  @Prop({ type: Date })
  acknowledgedAt: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  resolvedBy: string;

  @Prop({ type: Date })
  resolvedAt: Date;

  @Prop()
  resolutionNotes: string;

  @Prop({ type: Boolean, default: false })
  notificationSent: boolean;

  @Prop({ type: [Date] })
  remindersSent: Date[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;
}

export const ComplianceAlertSchema = SchemaFactory.createForClass(ComplianceAlert);

// Add indexes
ComplianceAlertSchema.index({ businessId: 1 });
ComplianceAlertSchema.index({ userId: 1 });
ComplianceAlertSchema.index({ status: 1 });
ComplianceAlertSchema.index({ severity: 1 });
ComplianceAlertSchema.index({ type: 1 });
ComplianceAlertSchema.index({ dueDate: 1 });