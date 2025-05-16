// src/schemas/project-weather-settings.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { WeatherAlertThresholdConfig, WeatherAlertThresholdConfigSchema } from './business-weather-settings.schema';

@Schema({ timestamps: true })
export class ProjectWeatherSettings extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;
  
  @Prop({ required: true })
  projectId: string;
  
  @Prop({ required: true, default: false })
  useCustomSettings: boolean;
  
  @Prop({ default: true })
  enableWeatherAlerts: boolean;
  
  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }] })
  notificationRecipients: string[];
  
  @Prop({ type: [WeatherAlertThresholdConfigSchema] })
  alertThresholds: WeatherAlertThresholdConfig[];

}

export const ProjectWeatherSettingsSchema = SchemaFactory.createForClass(ProjectWeatherSettings);

// Add indexes
ProjectWeatherSettingsSchema.index({ businessId: 1 });
ProjectWeatherSettingsSchema.index({ projectId: 1 });