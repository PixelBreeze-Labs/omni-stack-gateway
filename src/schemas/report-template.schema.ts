// src/schemas/report-template.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum ReportFormat {
  PDF = 'pdf',
  EXCEL = 'excel',
  CSV = 'csv',
  JSON = 'json',
  HTML = 'html'
}

export enum ReportDataSource {
  STAFFING = 'staffing',
  OPERATIONS = 'operations',
  COMPLIANCE = 'compliance',
  FINANCIAL = 'financial',
  ANALYTICS = 'analytics',
  CUSTOM = 'custom'
}

export enum ReportScheduleType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  CUSTOM = 'custom'
}

@Schema({ timestamps: true })
export class ReportTemplate extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop({
    type: String,
    enum: ReportFormat,
    default: ReportFormat.PDF
  })
  format: ReportFormat;

  @Prop({
    type: String,
    enum: ReportDataSource,
    required: true
  })
  dataSource: ReportDataSource;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  dataQuery: Record<string, any>;

  @Prop({ type: [String] })
  fields: string[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  filters: Record<string, any>;

  @Prop({ type: [String] })
  groupBy: string[];

  @Prop({ type: [String] })
  sortBy: string[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  visualizations: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  styling: Record<string, any>;

  @Prop({
    type: String,
    enum: ReportScheduleType,
    default: ReportScheduleType.WEEKLY
  })
  scheduleType: ReportScheduleType;

  @Prop({ type: MongooseSchema.Types.Mixed })
  scheduleConfig: {
    dayOfWeek?: number; // 0-6 (Sunday to Saturday)
    dayOfMonth?: number; // 1-31
    hour: number; // 0-23
    minute: number; // 0-59
    timezone: string;
    customCron?: string;
  };

  @Prop({ type: [String] })
  recipientEmails: string[];

  @Prop({ type: Boolean, default: false })
  includeAttachment: boolean;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const ReportTemplateSchema = SchemaFactory.createForClass(ReportTemplate);

// Add indexes
ReportTemplateSchema.index({ businessId: 1 });
ReportTemplateSchema.index({ dataSource: 1 });
ReportTemplateSchema.index({ scheduleType: 1 });
ReportTemplateSchema.index({ isActive: 1 });