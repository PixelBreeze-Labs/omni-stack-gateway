// src/schemas/route-optimization-request.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum OptimizationStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface OptimizationParameters {
  prioritizeTime: boolean;
  prioritizeFuel: boolean;
  prioritizeCustomerPreference: boolean;
  maxRouteTime: number; // minutes
  maxStopsPerRoute: number;
  allowOvertime: boolean;
  considerTraffic: boolean;
  considerWeather: boolean;
  skillMatching: boolean;
  balanceWorkload: boolean;
}

export interface OptimizationResult {
  routesGenerated: number;
  totalTasksOptimized: number;
  totalDistanceReduction: number; // km
  totalTimeReduction: number; // minutes
  fuelSavingsPercentage: number;
  averageOptimizationScore: number;
  unassignedTasks: string[]; // task IDs that couldn't be assigned
  warnings: string[];
  recommendations: string[];
}

@Schema({ timestamps: true })
export class RouteOptimizationRequest extends Document {
  @Prop({ required: true })
  requestId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'AppClient' })
  

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  requestedBy: string;

  @Prop({ required: true })
  targetDate: Date;

  @Prop({ type: [String], required: true })
  taskIds: string[];

  @Prop({ type: [String], required: true })
  teamIds: string[];

  @Prop({ type: Object, required: true })
  optimizationParams: OptimizationParameters;

  @Prop({ 
    type: String, 
    enum: OptimizationStatus, 
    default: OptimizationStatus.PENDING 
  })
  status: OptimizationStatus;

  @Prop({ type: Object })
  result?: OptimizationResult;

  @Prop({ type: Number }) // seconds
  processingTime?: number;

  @Prop()
  errorMessage?: string;

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'Route' })
  generatedRouteIds: string[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;
}

export const RouteOptimizationRequestSchema = SchemaFactory.createForClass(RouteOptimizationRequest);

// Add indexes
RouteOptimizationRequestSchema.index({ businessId: 1, targetDate: 1 });
RouteOptimizationRequestSchema.index({ requestId: 1 }, { unique: true });
RouteOptimizationRequestSchema.index({ requestedBy: 1 });
RouteOptimizationRequestSchema.index({ status: 1 });