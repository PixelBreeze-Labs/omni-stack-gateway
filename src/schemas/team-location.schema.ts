// src/schemas/team-location.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum TeamLocationStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BREAK = 'break',
  OFFLINE = 'offline',
  EMERGENCY = 'emergency'
}

export interface LocationHistory {
  timestamp: Date;
  latitude: number;
  longitude: number;
  accuracy?: number; // meters
  speed?: number; // km/h
  heading?: number; // degrees
}

export interface GeofenceArea {
  name: string;
  type: 'circle' | 'polygon';
  coordinates: Array<{ lat: number; lng: number }>;
  radius?: number; // for circle type, in meters
}

@Schema({ timestamps: true })
export class TeamLocation extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true })
  teamId: string; // Reference to team in Business.teams

  @Prop({ type: Object })
  currentLocation: {
    latitude: number;
    longitude: number;
    accuracy?: number; // meters
    timestamp: Date;
    address?: string;
    isManualUpdate?: boolean;
  };

  @Prop({ 
    type: String, 
    enum: TeamLocationStatus, 
    default: TeamLocationStatus.OFFLINE 
  })
  status: TeamLocationStatus;

  @Prop()
  currentTaskId?: string;

  @Prop()
  currentRouteId?: string;

  @Prop({ type: Number }) // percentage
  batteryLevel?: number;

  @Prop({ 
    type: String, 
    enum: ['online', 'offline', 'poor'], 
    default: 'offline' 
  })
  connectivity: string;

  @Prop()
  lastActivity?: Date;

  @Prop({ type: [Object], default: [] })
  locationHistory: LocationHistory[];

  @Prop({ type: [Object], default: [] })
  serviceAreas: GeofenceArea[];

  @Prop({ type: Object })
  workingHours: {
    start: string; // HH:MM
    end: string;   // HH:MM
    timezone: string;
    breakDuration: number; // minutes
    lunchStart?: string; // HH:MM
    lunchEnd?: string;   // HH:MM
  };

  @Prop({ type: Object })
  vehicleInfo: {
    type: string;
    licensePlate?: string;
    capacity: number;
    fuelType: 'gasoline' | 'diesel' | 'electric' | 'hybrid';
    avgFuelConsumption: number; // L/100km or kWh/100km
    maxRange: number; // km
    currentFuelLevel?: number; // percentage
  };

  @Prop({ type: [String], default: [] })
  skills: string[];

  @Prop({ type: [String], default: [] })
  equipment: string[];

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop()
  lastLocationUpdate?: Date;

  @Prop({ type: Object })
  emergencyContact: {
    name: string;
    phone: string;
    relationship: string;
  };

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;
}

export const TeamLocationSchema = SchemaFactory.createForClass(TeamLocation);

// Add indexes
TeamLocationSchema.index({ businessId: 1, teamId: 1 }, { unique: true });
TeamLocationSchema.index({ 'currentLocation.latitude': 1, 'currentLocation.longitude': 1 });
TeamLocationSchema.index({ status: 1 });
TeamLocationSchema.index({ lastLocationUpdate: 1 });
TeamLocationSchema.index({ currentRouteId: 1 });
TeamLocationSchema.index({ currentTaskId: 1 });