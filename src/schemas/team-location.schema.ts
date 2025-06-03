// src/schemas/team-location.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum TeamLocationStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BREAK = 'break',
  OFFLINE = 'offline'
}

export enum ConnectivityStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  POOR = 'poor'
}

@Schema({
  timestamps: true,
  collection: 'team_locations'
})
export class TeamLocation extends Document {
  @Prop({ required: true, index: true })
  businessId: string;

  @Prop({ required: true, index: true })
  teamId: string;

  @Prop({ required: true })
  teamName: string;

  @Prop({
    type: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
      address: { type: String },
      accuracy: { type: Number }, // GPS accuracy in meters
      altitude: { type: Number },
      speed: { type: Number }, // Speed in km/h
      heading: { type: Number } // Direction in degrees
    },
    required: true
  })
  location: {
    latitude: number;
    longitude: number;
    address?: string;
    accuracy?: number;
    altitude?: number;
    speed?: number;
    heading?: number;
  };

  @Prop({ enum: TeamLocationStatus, default: TeamLocationStatus.ACTIVE })
  status: TeamLocationStatus;

  @Prop({ enum: ConnectivityStatus, default: ConnectivityStatus.ONLINE })
  connectivity: ConnectivityStatus;

  @Prop()
  currentTaskId?: string;

  @Prop({ min: 0, max: 100 })
  batteryLevel?: number;

  @Prop()
  deviceId?: string;

  @Prop()
  appVersion?: string;

  @Prop({ type: Date, default: Date.now })
  lastLocationUpdate: Date;

  @Prop({ type: Date })
  statusChangedAt?: Date;

  @Prop({
    type: {
      checkInTime: Date,
      breakStartTime: Date,
      shiftStartTime: Date,
      expectedShiftEnd: Date
    }
  })
  workingHours?: {
    checkInTime?: Date;
    breakStartTime?: Date;
    shiftStartTime?: Date;
    expectedShiftEnd?: Date;
  };

  @Prop({
    type: [{
      timestamp: { type: Date, required: true },
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
      accuracy: { type: Number }
    }]
  })
  locationHistory: Array<{
    timestamp: Date;
    latitude: number;
    longitude: number;
    accuracy?: number;
  }>;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;

  @Prop()
  createdBy: string;

  @Prop()
  updatedBy?: string;
}

export const TeamLocationSchema = SchemaFactory.createForClass(TeamLocation);

// Create indexes for performance
TeamLocationSchema.index({ businessId: 1, teamId: 1 });
TeamLocationSchema.index({ businessId: 1, status: 1 });
TeamLocationSchema.index({ lastLocationUpdate: -1 });
TeamLocationSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });