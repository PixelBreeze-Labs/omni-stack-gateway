// src/schemas/agent-configuration.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { OptimizationStrategy } from '../enums/optimization.enum';

@Schema({ timestamps: true })
export class AgentConfiguration extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
  clientId: string;

  @Prop({ type: String, enum: [
    'auto-assignment', 
    'compliance-monitoring', 
    'report-generation', 
    'client-communication', 
    'resource-request',
    'shift-optimization'  // Add the new agent type
  ], required: true })
  agentType: string;

  @Prop({ default: false })
  isEnabled: boolean;

  @Prop({ default: false })
  requireApproval: boolean;

  // Auto-Assignment properties
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  weights: {
    skillMatch: number;
    availability: number;
    proximity: number;
    workload: number;
  };

  @Prop({ type: [String], default: [] })
  skillPriorities: string[];

  @Prop({ type: Number, default: 5 })
  assignmentFrequency: number; // in minutes
  
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  notificationSettings: {
    emailNotifications: boolean;
    managerEmails: string[];
    notifyOnAssignment: boolean;
    notifyOnRejection: boolean;
  };

  @Prop({ type: [String], default: [] })
  autoAssignToRoles: string[];

  @Prop({ type: Boolean, default: true })
  respectMaxWorkload: boolean;

  @Prop({ type: Number, default: 10 })
  maxTasksPerStaff: number;

  // Compliance Monitoring properties
  @Prop({ type: Number, default: 24 })
  monitoringFrequency: number;

  @Prop({ type: Number, default: 30 })
  certificationWarningDays: number;

  // Client Communication properties
  @Prop({ type: Boolean, default: false })
  autoResponseEnabled: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  defaultAssigneeId: string;

  @Prop({ type: Boolean, default: false })
  scheduledUpdatesEnabled: boolean;

  // Resource Request properties
  @Prop({ type: Number, default: 24 })
  inventoryCheckFrequency: number;

  @Prop({ type: Number, default: 168 })
  forecastFrequency: number;

  @Prop({ default: false })
  autoApprove: boolean;

  @Prop({ type: [String], default: [] })
  approverUserIds: string[];

  @Prop({ type: [String], default: [] })
  managerUserIds: string[];

  @Prop({ type: Object, default: {} })
  leadTimes: Record<string, number>;

  @Prop({ default: false })
  enableAdvanceOrders: boolean;

  @Prop({ type: Number, default: 30 })
  advanceOrderDays: number;

  @Prop({ type: Number, default: 0.7 })
  minimumConfidence: number;

  // Shift Optimization properties
  @Prop({ type: String, default: '0 1 * * 0' }) // Default: Sunday at 1 AM
  weeklyOptimizationCron: string;

  @Prop({ type: String, default: '0 0 * * *' }) // Default: Midnight daily
  dailyForecastCron: string;

  @Prop({ type: String, enum: Object.values(OptimizationStrategy), default: OptimizationStrategy.WORKLOAD_BALANCED })
optimizationStrategy: OptimizationStrategy;

  @Prop({ type: Boolean, default: true })
  sendOptimizationNotifications: boolean;

  @Prop({ type: Boolean, default: true })
  sendForecastNotifications: boolean;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: Record<string, any>;
}

export const AgentConfigurationSchema = SchemaFactory.createForClass(AgentConfiguration);

// Add indexes
AgentConfigurationSchema.index({ businessId: 1, agentType: 1 }, { unique: true });
AgentConfigurationSchema.index({ clientId: 1 });