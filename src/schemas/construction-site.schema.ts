// src/schemas/construction-site.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import * as mongoose from 'mongoose';

@Schema({ timestamps: true })
export class ConstructionSite extends Document {
  @Prop({ required: true })
  name: string;
  
  @Prop()
  description: string;
  
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;
  
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'AppProject' })
  appProjectId?: mongoose.Types.ObjectId;
  
  @Prop({ type: String })
  status: string;
  
  @Prop({ type: String })
  type: string;
  
  @Prop({ type: Object, default: {} })
  externalIds: {
    venueBoostSiteId?: string;
    [key: string]: string;
  };
  
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  location: {
    latitude?: number;
    longitude?: number;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: {
    status?: string;
    siteType?: string;
    lastSyncedAt?: Date;
    startDate?: Date;
    endDate?: Date;
    noOfWorkers?: number;
    specifications?: any;
    weatherConfig?: any;
    accessRequirements?: any;
    safetyRequirements?: any;
    manager?: {
      id: string;
      name: string;
      email?: string;
      phone?: string;
    };
    teams?: Array<{
      id: string;
      name: string;
      memberCount?: number;
    }>;
    [key: string]: any;
  };
  
  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;
  
  @Prop({ type: Date })
  deletedAt?: Date;
}

export const ConstructionSiteSchema = SchemaFactory.createForClass(ConstructionSite);

// Add indexes
ConstructionSiteSchema.index({ businessId: 1 });
ConstructionSiteSchema.index({ appProjectId: 1 });
ConstructionSiteSchema.index({ 'externalIds.venueBoostSiteId': 1 });
ConstructionSiteSchema.index({ status: 1 });
ConstructionSiteSchema.index({ type: 1 });
ConstructionSiteSchema.index({ isDeleted: 1 });
ConstructionSiteSchema.index({ 'metadata.startDate': 1 });
ConstructionSiteSchema.index({ 'metadata.endDate': 1 });