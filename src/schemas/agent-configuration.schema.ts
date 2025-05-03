// src/schemas/agent-configuration.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class AgentConfiguration extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
  clientId: string;

  @Prop({ type: String, enum: ['auto-assignment', 'compliance-monitoring', 'report-generation', 'client-communication', 'resource-request'], required: true })
  agentType: string;

  @Prop({ default: false })
  isEnabled: boolean;

  @Prop({ default: false })
  requireApproval: boolean;

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

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: Record<string, any>;

  @Prop({ type: Number, default: 24 })
  monitoringFrequency: number;

  @Prop({ type: Number, default: 30 })
  certificationWarningDays: number;

  @Prop({ type: Boolean, default: false })
  autoResponseEnabled: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  defaultAssigneeId: string;

  @Prop({ type: Boolean, default: false })
  scheduledUpdatesEnabled: boolean;
}

export const AgentConfigurationSchema = SchemaFactory.createForClass(AgentConfiguration);

// Add indexes
AgentConfigurationSchema.index({ businessId: 1, agentType: 1 }, { unique: true });
AgentConfigurationSchema.index({ clientId: 1 });