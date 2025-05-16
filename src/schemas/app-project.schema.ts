// src/schemas/app-project.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

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
    location?: {
      latitude: number;
      longitude: number;
      address?: string;
      city?: string;
      state?: string;
      country?: string;
    };
    [key: string]: any;
  };
}

export const AppProjectSchema = SchemaFactory.createForClass(AppProject);

// Add indexes
AppProjectSchema.index({ businessId: 1 });
AppProjectSchema.index({ 'externalIds.venueBoostProjectId': 1 });
AppProjectSchema.index({ status: 1 });