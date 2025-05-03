// src/schemas/resource-forecast.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum ForecastStatus {
  PROJECTED = 'projected',
  CONFIRMED = 'confirmed',
  ADJUSTED = 'adjusted',
  FULFILLED = 'fulfilled',
  CANCELED = 'canceled'
}

@Schema({ timestamps: true })
export class ResourceForecast extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'ResourceItem' })
  resourceItemId: string;

  @Prop({ required: true, type: Date })
  forecastDate: Date;

  @Prop({ required: true, type: Number })
  projectedQuantity: number;

  @Prop({ type: Number })
  adjustedQuantity: number;

  @Prop({ type: Number })
  actualQuantity: number;

  @Prop({ type: Number })
  confidenceLevel: number;

  @Prop({ required: true, enum: ForecastStatus, default: ForecastStatus.PROJECTED })
  status: ForecastStatus;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  clientId: string;

  @Prop({ type: String })
  projectId: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  factors: {
    historicalUsage?: number;
    seasonality?: number;
    projectGrowth?: number;
    eventImpact?: number;
    other?: Record<string, number>;
  };

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ResourceRequest' })
  relatedRequestId: string;

  @Prop()
  notes: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;
}

export const ResourceForecastSchema = SchemaFactory.createForClass(ResourceForecast);

// Add indexes
ResourceForecastSchema.index({ businessId: 1 });
ResourceForecastSchema.index({ resourceItemId: 1 });
ResourceForecastSchema.index({ forecastDate: 1 });
ResourceForecastSchema.index({ status: 1 });
ResourceForecastSchema.index({ clientId: 1 });
ResourceForecastSchema.index({ projectId: 1 });
ResourceForecastSchema.index({ relatedRequestId: 1 });