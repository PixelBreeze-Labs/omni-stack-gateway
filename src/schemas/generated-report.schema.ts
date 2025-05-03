// src/schemas/generated-report.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ReportFormat } from './report-template.schema';

export enum ReportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DISTRIBUTED = 'distributed'
}

@Schema({ timestamps: true })
export class GeneratedReport extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'ReportTemplate' })
  templateId: string;

  @Prop({ required: true })
  name: string;

  @Prop({
    type: String,
    enum: ReportFormat,
    required: true
  })
  format: ReportFormat;

  @Prop({
    type: String,
    enum: ReportStatus,
    default: ReportStatus.PENDING
  })
  status: ReportStatus;

  @Prop({ type: Date })
  startDate: Date;

  @Prop({ type: Date })
  endDate: Date;

  @Prop({ type: Date })
  generatedAt: Date;

  @Prop()
  fileUrl: string;

  @Prop()
  filePath: string;

  @Prop()
  fileSize: number;

  @Prop({ type: [String] })
  recipientEmails: string[];

  @Prop({ type: [Date] })
  sentAt: Date[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  errorDetails: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  reportData: any;
}

export const GeneratedReportSchema = SchemaFactory.createForClass(GeneratedReport);

// Add indexes
GeneratedReportSchema.index({ businessId: 1 });
GeneratedReportSchema.index({ templateId: 1 });
GeneratedReportSchema.index({ status: 1 });
GeneratedReportSchema.index({ generatedAt: 1 });