// src/schemas/resource-usage.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class ResourceUsage extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'ResourceItem' })
  resourceItemId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId: string;

  @Prop({ type: Date, required: true })
  date: Date;

  @Prop({ required: true, type: Number })
  quantity: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  clientId: string;

  @Prop({ type: String })
  projectId: string;

  @Prop({ type: String })
  taskId: string;

  @Prop()
  notes: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;
}

export const ResourceUsageSchema = SchemaFactory.createForClass(ResourceUsage);

// Add indexes
ResourceUsageSchema.index({ businessId: 1 });
ResourceUsageSchema.index({ resourceItemId: 1 });
ResourceUsageSchema.index({ userId: 1 });
ResourceUsageSchema.index({ date: 1 });
ResourceUsageSchema.index({ clientId: 1 });
ResourceUsageSchema.index({ projectId: 1 });
ResourceUsageSchema.index({ taskId: 1 });