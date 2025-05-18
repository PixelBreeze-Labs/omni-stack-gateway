// src/schemas/ai/ml-registry.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class MLRegistry extends Document {
  @Prop({ required: true })
  modelName: string;
  
  @Prop({ required: true })
  version: string;
  
  @Prop({ required: true })
  type: string; // 'regression', 'classification', 'clustering', 'timeseries'
  
  @Prop({ required: true })
  status: string; // 'training', 'active', 'archived', 'failed'
  
  @Prop()
  modelPath: string;
  
  @Prop({ type: Object })
  metrics: {
    accuracy?: number;
    precision?: number;
    recall?: number;
    f1Score?: number;
    rmse?: number;
    mae?: number;
    [key: string]: number;
  };
  
  @Prop({ type: [String] })
  features: string[];
  
  @Prop({ type: Object })
  hyperparameters: Record<string, any>;
  
  @Prop()
  description: string;
  
  @Prop()
  trainedAt: Date;
  
  @Prop()
  businessId: string;
  
  @Prop({ type: Object })
  metadata: Record<string, any>;
}

export const MLRegistrySchema = SchemaFactory.createForClass(MLRegistry);