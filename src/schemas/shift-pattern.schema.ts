// src/schemas/shift-pattern.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class ShiftPattern extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  startTime: string;

  @Prop({ required: true })
  endTime: string;

  @Prop({ required: true, type: [Number] })
  daysOfWeek: number[]; // 0-6 (Sunday-Saturday)

  @Prop({ required: true })
  staffCount: number;

  @Prop({ type: [String] })
  requiredSkills: string[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;
}

export const ShiftPatternSchema = SchemaFactory.createForClass(ShiftPattern);

// Add indexes
ShiftPatternSchema.index({ businessId: 1 });
ShiftPatternSchema.index({ isActive: 1 });
ShiftPatternSchema.index({ daysOfWeek: 1 });