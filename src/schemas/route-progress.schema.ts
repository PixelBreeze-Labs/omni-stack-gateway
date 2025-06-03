// src/schemas/route-progress.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum RouteStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  PAUSED = 'paused',
  CANCELLED = 'cancelled'
}

@Schema({
  timestamps: true,
  collection: 'route_progress'
})
export class RouteProgress extends Document {
  @Prop({ required: true, index: true })
  businessId: string;

  @Prop({ required: true, index: true })
  teamId: string;

  @Prop({ required: true })
  teamName: string;

  @Prop({ type: Date, required: true, index: true })
  routeDate: Date;

  @Prop({
    type: [{
      taskId: { type: String, required: true },
      scheduledOrder: { type: Number, required: true },
      estimatedStartTime: { type: Date },
      estimatedEndTime: { type: Date },
      actualStartTime: { type: Date },
      actualEndTime: { type: Date },
      status: { 
        type: String, 
        enum: ['pending', 'in_progress', 'completed', 'skipped', 'cancelled'],
        default: 'pending'
      },
      location: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        address: { type: String }
      },
      estimatedDuration: { type: Number }, // in minutes
      actualDuration: { type: Number }, // in minutes
      notes: { type: String },
      delayReasons: [{ 
        reason: String,
        duration: Number, // in minutes
        timestamp: Date
      }]
    }],
    required: true
  })
  tasks: Array<{
    taskId: string;
    scheduledOrder: number;
    estimatedStartTime?: Date;
    estimatedEndTime?: Date;
    actualStartTime?: Date;
    actualEndTime?: Date;
    status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'cancelled';
    location: {
      latitude: number;
      longitude: number;
      address?: string;
    };
    estimatedDuration?: number;
    actualDuration?: number;
    notes?: string;
    delayReasons?: Array<{
      reason: string;
      duration: number;
      timestamp: Date;
    }>;
  }>;

  @Prop({ enum: RouteStatus, default: RouteStatus.PENDING })
  routeStatus: RouteStatus;

  @Prop({ min: 0 })
  currentTaskIndex: number;

  @Prop({ min: 0 })
  completedTasksCount: number;

  @Prop({ type: Date })
  routeStartTime?: Date;

  @Prop({ type: Date })
  routeEndTime?: Date;

  @Prop({ type: Date })
  estimatedCompletionTime?: Date;

  @Prop()
  totalEstimatedDuration?: number; // in minutes

  @Prop()
  totalActualDuration?: number; // in minutes

  @Prop()
  totalDistanceKm?: number;

  @Prop()
  totalDelayMinutes?: number;

  @Prop({
    type: {
      efficiency: { type: Number, min: 0, max: 100 }, // percentage
      onTimePerformance: { type: Number, min: 0, max: 100 }, // percentage
      customerSatisfactionAvg: { type: Number, min: 0, max: 5 }, // 1-5 scale
      routeOptimizationScore: { type: Number, min: 0, max: 100 } // percentage
    }
  })
  performance?: {
    efficiency?: number;
    onTimePerformance?: number;
    customerSatisfactionAvg?: number;
    routeOptimizationScore?: number;
  };

  @Prop({
    type: [{
      timestamp: { type: Date, required: true },
      location: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true }
      },
      status: { type: String, required: true },
      notes: { type: String }
    }]
  })
  progressUpdates: Array<{
    timestamp: Date;
    location: {
      latitude: number;
      longitude: number;
    };
    status: string;
    notes?: string;
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

export const RouteProgressSchema = SchemaFactory.createForClass(RouteProgress);

// Create indexes for performance
RouteProgressSchema.index({ businessId: 1, teamId: 1, routeDate: -1 });
RouteProgressSchema.index({ businessId: 1, routeStatus: 1 });
RouteProgressSchema.index({ routeDate: -1 });
RouteProgressSchema.index({ estimatedCompletionTime: 1 });
