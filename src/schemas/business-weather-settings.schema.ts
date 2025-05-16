// src/schemas/business-weather-settings.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { WeatherType } from './weather-alert.schema';

@Schema()
export class WeatherAlertThresholdConfig {
  @Prop({ required: true, enum: WeatherType })
  type: string;

  @Prop({ required: true })
  threshold: number;
  
  @Prop({ default: true })
  enabled: boolean;
}

export const WeatherAlertThresholdConfigSchema = SchemaFactory.createForClass(WeatherAlertThresholdConfig);

@Schema({ timestamps: true })
export class BusinessWeatherSettings extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;
  
  @Prop({ default: true })
  enableWeatherAlerts: boolean;
  
  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }] })
  notificationRecipients: string[];
  
  @Prop({ default: true })
  appNotificationsEnabled: boolean;
  
  @Prop({ default: true })
  emailNotificationsEnabled: boolean;
  
  @Prop({ default: false })
  smsNotificationsEnabled: boolean;
  
  @Prop({ default: 3 })
  checkIntervalHours: number;
  
  @Prop({ type: [WeatherAlertThresholdConfigSchema], default: () => [
    { type: 'rain', threshold: 15, enabled: true }, // mm of rain
    { type: 'snow', threshold: 5, enabled: true },  // cm of snow
    { type: 'wind', threshold: 30, enabled: true }, // km/h wind speed
    { type: 'storm', threshold: 0, enabled: true }, // any storm warning
    { type: 'heat', threshold: 35, enabled: true }, // degrees C
    { type: 'cold', threshold: 0, enabled: true }   // degrees C
  ]})
  alertThresholds: WeatherAlertThresholdConfig[];
}

export const BusinessWeatherSettingsSchema = SchemaFactory.createForClass(BusinessWeatherSettings);

// Add indexes
BusinessWeatherSettingsSchema.index({ businessId: 1 }, { unique: true });