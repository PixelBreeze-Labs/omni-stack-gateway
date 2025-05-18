// src/schemas/ai/feature-collection.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class FeatureCollection extends Document {
  @Prop({ required: true })
  featureSetName: string; // 'project_features', 'task_assignment_features', etc.
  
  @Prop({ required: true })
  entityType: string; // 'project', 'task', 'staff', 'client', etc.
  
  @Prop({ required: true })
  entityId: string;
  
  @Prop({ type: Object, required: true })
  features: Record<string, any>;
  
  @Prop()
  businessId: string;
  
  @Prop()
  updatedAt: Date;
  
  @Prop()
  validUntil: Date;
  
  @Prop({ type: Object })
  metadata: Record<string, any>;
}

export const FeatureCollectionSchema = SchemaFactory.createForClass(FeatureCollection);