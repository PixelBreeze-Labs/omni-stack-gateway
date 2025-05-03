// src/schemas/shift-optimization-report.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { OptimizationStrategy } from '../services/shift-optimization-agent.service';

@Schema({ timestamps: true })
export class ShiftOptimizationReport extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true })
  generatedDate: Date;

  @Prop({ required: true })
  reportType: string; // 'weekly', 'forecast'

  @Prop({ type: String, enum: Object.values(OptimizationStrategy) })
  strategy: OptimizationStrategy;

  @Prop()
  forecastHorizon: number;

  @Prop()
  historicalDataStartDate: Date;

  @Prop()
  historicalDataEndDate: Date;

  @Prop()
  taskCount: number;

  @Prop()
  staffCount: number;

  @Prop({ type: MongooseSchema.Types.Mixed })
  workloadAnalysis: any;

  @Prop({ type: MongooseSchema.Types.Mixed })
  recommendations: any;

  @Prop({ type: MongooseSchema.Types.Mixed })
  forecastData: any;

  @Prop({ required: true })
  status: string; // 'generated', 'viewed', 'implemented', 'archived'
}

export const ShiftOptimizationReportSchema = SchemaFactory.createForClass(ShiftOptimizationReport);

// Add indexes
ShiftOptimizationReportSchema.index({ businessId: 1 });
ShiftOptimizationReportSchema.index({ generatedDate: -1 });
ShiftOptimizationReportSchema.index({ reportType: 1 });