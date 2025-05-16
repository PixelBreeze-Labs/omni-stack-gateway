// src/schemas/weather-alert.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum WeatherAlertSeverity {
  ADVISORY = 'advisory',
  WATCH = 'watch',
  WARNING = 'warning',
  EMERGENCY = 'emergency'
}

export enum WeatherType {
  RAIN = 'rain',
  SNOW = 'snow',
  STORM = 'storm',
  WIND = 'wind',
  HEAT = 'heat',
  COLD = 'cold',
  FOG = 'fog',
  OTHER = 'other'
}

@Schema({ timestamps: true })
export class WeatherAlert extends Document {
  @Prop({ required: true })
  title: string;
  
  @Prop()
  description: string;
  
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;
  
  @Prop({ type: String, enum: WeatherType, required: true })
  weatherType: WeatherType;
  
  @Prop({ type: String, enum: WeatherAlertSeverity, required: true })
  severity: WeatherAlertSeverity;
  
  @Prop({ type: Date, required: true })
  startTime: Date;
  
  @Prop({ type: Date, required: true })
  endTime: Date;
  
  @Prop({ type: Object, required: true })
  location: {
    latitude: number;
    longitude: number;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    radius?: number; // Affected radius in km
  };
  
  // Link affected projects
  @Prop({ type: [String] })
  affectedProjectIds: string[];
  
  // Link to potential delay notifications
  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'SaasNotification' })
  notificationIds: string[];
  
  @Prop({ type: Boolean, default: false })
  resolved: boolean;
  
  @Prop({ type: Date })
  resolvedAt: Date;
  
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  weatherData: Record<string, any>; // Store full weather API response
}

export const WeatherAlertSchema = SchemaFactory.createForClass(WeatherAlert);