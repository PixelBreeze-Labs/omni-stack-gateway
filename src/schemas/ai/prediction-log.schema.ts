// src/schemas/ai/prediction-log.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class PredictionLog extends Document {
  @Prop({ required: true })
  modelId: string;
  
  @Prop({ required: true })
  entityType: string; // 'task', 'project', 'staff', 'client', 'equipment', etc.
  
  @Prop({ required: true })
  entityId: string;
  
  @Prop({ type: Object, required: true })
  input: Record<string, any>;
  
  @Prop({ type: Object, required: true })
  output: Record<string, any>;
  
  @Prop()
  businessId: string;
  
  @Prop()
  confidence: number;
  
  @Prop({ default: false })
  feedbackProvided: boolean;
  
  @Prop()
  feedbackCorrect: boolean;
  
  @Prop({ type: Object })
  actualOutcome: Record<string, any>;
  
  @Prop()
  userId: string;
  
  @Prop({ type: Object })
  metadata: Record<string, any>;
}

export const PredictionLogSchema = SchemaFactory.createForClass(PredictionLog);