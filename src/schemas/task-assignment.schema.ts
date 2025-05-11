// src/schemas/task-assignment.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum TaskStatus {
  UNASSIGNED = 'unassigned',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

@Schema({ timestamps: true })
export class TaskAssignment extends Document {
  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
  clientId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  assignedUserId: string;

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'User' })
  potentialAssignees: string[];

  @Prop({ type: Object, default: {} })
  externalIds: {
      venueBoostTaskId?: string;
      [key: string]: string;
  };

  @Prop({ 
    type: String, 
    enum: TaskStatus, 
    default: TaskStatus.UNASSIGNED 
  })
  status: TaskStatus;

  @Prop({ 
    type: String, 
    enum: TaskPriority, 
    default: TaskPriority.MEDIUM 
  })
  priority: TaskPriority;

  @Prop({ type: Date })
  dueDate: Date;

  @Prop({ type: Date })
  assignedAt: Date;

  @Prop({ type: Date })
  completedAt: Date;

  @Prop({ type: MongooseSchema.Types.Mixed })
  assignmentMetrics: {
    skillMatch: number;
    availabilityScore: number;
    proximityScore: number;
    workloadBalance: number;
    finalScore: number;
  };

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;

  @Prop({ default: false })
  isDeleted: boolean;

  /**
    * external_ids: A JSON object to store various external IDs.
    * Example:
    * {
    *   venueBoostTaskId: "def"
    * }
    */
  @Prop({ type: Object, default: {} })
  external_ids: Record<string, any>;

}

export const TaskAssignmentSchema = SchemaFactory.createForClass(TaskAssignment);

// Add indexes
TaskAssignmentSchema.index({ businessId: 1 });
TaskAssignmentSchema.index({ clientId: 1 });
TaskAssignmentSchema.index({ assignedUserId: 1 });
TaskAssignmentSchema.index({ status: 1 });
TaskAssignmentSchema.index({ dueDate: 1 });