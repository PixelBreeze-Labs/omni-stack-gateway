// src/schemas/route.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum RouteStatus {
  DRAFT = 'draft',
  OPTIMIZED = 'optimized',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export enum OptimizationObjective {
  MINIMIZE_TIME = 'minimize_time',
  MINIMIZE_DISTANCE = 'minimize_distance',
  MINIMIZE_FUEL = 'minimize_fuel',
  BALANCED = 'balanced',
  CUSTOMER_PRIORITY = 'customer_priority'
}

export interface RouteStop {
  taskId: string;
  sequenceNumber: number;
  estimatedArrivalTime: Date;
  estimatedDepartureTime: Date;
  actualArrivalTime?: Date;
  actualDepartureTime?: Date;
  distanceFromPrevious: number; // km
  travelTimeFromPrevious: number; // minutes
  serviceTime: number; // minutes
  status: 'pending' | 'arrived' | 'in_service' | 'completed' | 'skipped';
  location: {
    latitude: number;
    longitude: number;
    address: string;
  };
  notes?: string;
}

export interface WeatherConsideration {
  date: Date;
  weatherType: string;
  severity: string;
  delayEstimate: number; // minutes
  recommendation: 'proceed' | 'delay' | 'reschedule';
}

@Schema({ timestamps: true })
export class Route extends Document {
  @Prop({ required: true })
  routeId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
  clientId: string;

  @Prop({ required: true })
  teamId: string; // Reference to team in Business.teams

  @Prop({ required: true })
  date: Date;

  @Prop({ 
    type: String, 
    enum: RouteStatus, 
    default: RouteStatus.DRAFT 
  })
  status: RouteStatus;

  @Prop({ type: Number, min: 0, max: 100 })
  optimizationScore: number;

  @Prop({ type: Number }) // minutes
  estimatedTotalTime: number;

  @Prop({ type: Number }) // km
  estimatedDistance: number;

  @Prop({ type: Number }) // currency units
  estimatedFuelCost: number;

  @Prop({ type: Number }) // minutes
  actualTotalTime?: number;

  @Prop({ type: Number }) // km
  actualDistance?: number;

  @Prop({ type: Number }) // currency units
  actualFuelCost?: number;

  @Prop({ type: [Object] })
  routeStops: RouteStop[];

  @Prop({ 
    type: String, 
    enum: OptimizationObjective, 
    default: OptimizationObjective.BALANCED 
  })
  optimizationObjective: OptimizationObjective;

  @Prop({ type: Object })
  optimizationMetadata: {
    algorithmUsed: string;
    processingTime: number; // seconds
    iterations: number;
    trafficConsidered: boolean;
    weatherConsidered: boolean;
    skillMatchingApplied: boolean;
    constraints: {
      maxRouteTime: number;
      maxStops: number;
      requiredBreaks: boolean;
      timeWindows: boolean;
    };
    alternativeRoutesCount: number;
  };

  @Prop({ type: [Object] })
  weatherConsiderations: WeatherConsideration[];

  @Prop({ type: Object })
  performanceMetrics: {
    onTimePerformance: number; // percentage
    customerSatisfaction: number; // 1-5 rating
    fuelEfficiency: number; // actual vs estimated
    timeEfficiency: number; // actual vs estimated
  };

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  assignedBy?: string;

  @Prop({ type: Date })
  assignedAt?: Date;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const RouteSchema = SchemaFactory.createForClass(Route);

// Add indexes
RouteSchema.index({ clientId: 1 });
RouteSchema.index({ businessId: 1 });
RouteSchema.index({ teamId: 1 });
RouteSchema.index({ status: 1 });
RouteSchema.index({ routeId: 1 }, { unique: true });
RouteSchema.index({ optimizationScore: -1 });
RouteSchema.index({ 'routeStops.taskId': 1 });