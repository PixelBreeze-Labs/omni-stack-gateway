// src/schemas/ai/insight-collection.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class InsightCollection extends Document {
  @Prop({ required: true })
  insightType: string; // 'project_risk', 'staff_performance', 'client_satisfaction', etc.
  
  @Prop({ required: true })
  entityType: string; // 'business', 'project', 'staff', 'client', etc.
  
  @Prop({ required: true })
  entityId: string;
  
  @Prop({ required: true, type: Object })
  insights: {
    score?: number;
    risk?: number;
    factors?: Array<{ factor: string; impact: number }>;
    trends?: Array<{ name: string; direction: string; value: number }>;
    anomalies?: Array<{ type: string; severity: string; description: string }>;
    recommendations?: Array<{ action: string; impact: string; priority: string }>;
    [key: string]: any;
  };
  
  @Prop()
  businessId: string;
  
  @Prop()
  validFrom: Date;
  
  @Prop()
  validTo: Date;
  
  @Prop()
  generatedBy: string; // model ID or service name
  
  @Prop({ type: Object })
  metadata: Record<string, any>;
}

export const InsightCollectionSchema = SchemaFactory.createForClass(InsightCollection);