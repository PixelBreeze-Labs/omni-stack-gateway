// src/schemas/client-message.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum MessageChannel {
  EMAIL = 'email',
  SMS = 'sms',
  CHAT = 'chat',
  PORTAL = 'portal',
  API = 'api'
}

export enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound'
}

export enum MessageStatus {
  RECEIVED = 'received',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed'
}

export enum MessagePriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

@Schema({ timestamps: true })
export class ClientMessage extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  clientId: string;

  @Prop({ 
    type: String,
    enum: MessageChannel,
    required: true 
  })
  channel: MessageChannel;

  @Prop({ 
    type: String,
    enum: MessageDirection,
    required: true 
  })
  direction: MessageDirection;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: [String] })
  attachments: string[];

  @Prop({
    type: String,
    enum: MessageStatus,
    default: MessageStatus.RECEIVED
  })
  status: MessageStatus;

  @Prop({
    type: String,
    enum: MessagePriority,
    default: MessagePriority.MEDIUM
  })
  priority: MessagePriority;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  assignedTo: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  resolvedBy: string;

  @Prop({ type: Date })
  resolvedAt: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ClientMessage' })
  parentMessageId: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;

  @Prop({ type: [{ type: MongooseSchema.Types.Mixed }] })
  statusHistory: {
    status: MessageStatus;
    timestamp: Date;
    userId: string;
    note: string;
  }[];

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: Date })
  deletedAt: Date;
}

export const ClientMessageSchema = SchemaFactory.createForClass(ClientMessage);

// Add indexes
ClientMessageSchema.index({ businessId: 1 });
ClientMessageSchema.index({ clientId: 1 });
ClientMessageSchema.index({ status: 1 });
ClientMessageSchema.index({ channel: 1 });
ClientMessageSchema.index({ assignedTo: 1 });
ClientMessageSchema.index({ createdAt: 1 });