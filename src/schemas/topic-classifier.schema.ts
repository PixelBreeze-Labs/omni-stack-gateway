// src/schemas/topic-classifier.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum TopicCategory {
  BILLING = 'billing',
  TECHNICAL_SUPPORT = 'technical_support',
  SCHEDULE = 'schedule',
  SERVICE_QUALITY = 'service_quality',
  INQUIRY = 'inquiry',
  COMPLAINT = 'complaint',
  FEEDBACK = 'feedback',
  GENERAL = 'general',
  URGENT = 'urgent',
  OTHER = 'other'
}

@Schema({ timestamps: true })
export class TopicClassifier extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({
    type: String,
    enum: TopicCategory,
    required: true
  })
  category: TopicCategory;

  @Prop({ type: [String], required: true })
  keywords: string[];

  @Prop({ type: [String] })
  phrases: string[];

  @Prop({ type: Number, default: 1.0 })
  weight: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  defaultAssignee: string;

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'User' })
  alternativeAssignees: string[];

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;
}

export const TopicClassifierSchema = SchemaFactory.createForClass(TopicClassifier);

// Add indexes
TopicClassifierSchema.index({ businessId: 1 });
TopicClassifierSchema.index({ category: 1 });
TopicClassifierSchema.index({ isActive: 1 });