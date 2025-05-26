// src/schemas/ticket.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress', 
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  DUPLICATE = 'duplicate'
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum TicketCategory {
  TECHNICAL = 'technical',
  BILLING = 'billing',
  FEATURE_REQUEST = 'feature_request',
  BUG = 'bug',
  ACCOUNT = 'account',
  TRAINING = 'training',
  OTHER = 'other'
}

@Schema({ timestamps: true })
export class TicketMessage {
  @Prop({ required: true, enum: ['business', 'support'] })
  sender: 'business' | 'support';

  @Prop({ required: true })
  senderName: string;

  @Prop({ required: true })
  senderEmail: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: [String], default: [] })
  attachments: string[];

  @Prop({ default: Date.now })
  timestamp: Date;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;
}

const TicketMessageSchema = SchemaFactory.createForClass(TicketMessage);

@Schema({ timestamps: true })
export class Ticket extends Document {
  @Prop({ required: true })
  businessId: string;

  @Prop({ required: true })
  clientId: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ 
    type: String, 
    enum: TicketStatus, 
    default: TicketStatus.OPEN 
  })
  status: TicketStatus;

  @Prop({ 
    type: String, 
    enum: TicketPriority, 
    default: TicketPriority.MEDIUM 
  })
  priority: TicketPriority;

  @Prop({ 
    type: String, 
    enum: TicketCategory, 
    default: TicketCategory.OTHER 
  })
  category: TicketCategory;

  // Business user who created the ticket
  @Prop({ required: true })
  createdByName: string;

  @Prop({ required: true })
  createdByEmail: string;

  @Prop()
  createdByUserId?: string;

  // Support team assignment
  @Prop()
  assignedTo?: string;

  @Prop()
  assignedToEmail?: string;

  // Ticket conversation
  @Prop({ type: [TicketMessageSchema], default: [] })
  messages: TicketMessage[];

  // Reference to related ticket (for duplicates)
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Ticket' })
  duplicateOf?: string;

  // Tags for organization
  @Prop({ type: [String], default: [] })
  tags: string[];

  // Resolution info
  @Prop()
  resolvedAt?: Date;

  @Prop()
  resolvedBy?: string;

  @Prop()
  resolutionNotes?: string;

  // Soft delete
  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: Record<string, any>;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);

// Add indexes for better performance
TicketSchema.index({ businessId: 1, status: 1 });
TicketSchema.index({ clientId: 1, status: 1 });
TicketSchema.index({ createdAt: -1 });
TicketSchema.index({ status: 1, priority: 1 });
TicketSchema.index({ assignedTo: 1 });
TicketSchema.index({ category: 1 });