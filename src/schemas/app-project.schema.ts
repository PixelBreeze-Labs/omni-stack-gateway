// src/schemas/app-project.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

interface ClientInfo {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

@Schema({ timestamps: true })
export class AppProject extends Document {
  @Prop({ required: true })
  name: string;
  
  @Prop()
  description: string;
  
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;
  
  @Prop({ type: String })
  clientId: string;
  
  @Prop({ type: String })
  status: string;
  
  @Prop({ type: Object, default: {} })
  externalIds: {
    venueBoostProjectId?: string;
    [key: string]: string;
  };
  
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: {
    status?: string;
    projectType?: string;
    lastSyncedAt?: Date;
    estimatedHours?: number;
    estimatedBudget?: number;
    startDate?: Date;
    endDate?: Date;
    location?: {
      latitude: number;
      longitude: number;
      address?: string;
      city?: string;
      state?: string;
      country?: string;
    };
    clientInfo?: ClientInfo;
    [key: string]: any;
  };
  
  // Add a field to track if the project is deleted
  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;
  
  @Prop({ type: Date })
  deletedAt?: Date;
}

export const AppProjectSchema = SchemaFactory.createForClass(AppProject);

// Add indexes
AppProjectSchema.index({ businessId: 1 });
AppProjectSchema.index({ 'externalIds.venueBoostProjectId': 1 });
AppProjectSchema.index({ status: 1 });
AppProjectSchema.index({ isDeleted: 1 });
AppProjectSchema.index({ 'metadata.projectType': 1 });
AppProjectSchema.index({ 'metadata.startDate': 1 });
AppProjectSchema.index({ 'metadata.endDate': 1 });
AppProjectSchema.index({ 'metadata.clientInfo.id': 1 });