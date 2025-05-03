// src/schemas/resource-request.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ResourceType } from './resource-item.schema';

export enum RequestStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ORDERED = 'ordered',
  RECEIVED = 'received',
  CANCELED = 'canceled',
  PARTIALLY_FULFILLED = 'partially_fulfilled',
  FULFILLED = 'fulfilled'
}

export enum RequestPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum RequestSource {
  MANUAL = 'manual',
  AUTOMATED = 'automated',
  SCHEDULE = 'schedule',
  PREDICTION = 'prediction'
}

@Schema({ timestamps: true })
export class ResourceRequest extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true })
  requestNumber: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  requestedBy: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  approvedBy: string;

  @Prop({ type: Date })
  approvedAt: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  rejectedBy: string;

  @Prop({ type: Date })
  rejectedAt: Date;

  @Prop()
  rejectionReason: string;

  @Prop({ required: true, enum: RequestStatus, default: RequestStatus.DRAFT })
  status: RequestStatus;

  @Prop({ required: true, enum: RequestPriority, default: RequestPriority.MEDIUM })
  priority: RequestPriority;

  @Prop({ required: true, enum: RequestSource, default: RequestSource.MANUAL })
  source: RequestSource;

  @Prop({ type: Date })
  neededBy: Date;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  items: {
    resourceItemId?: string;
    name: string;
    type: ResourceType;
    quantity: number;
    unitCost?: number;
    totalCost?: number;
    notes?: string;
  }[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  fulfillment: {
    orderedAt?: Date;
    orderNumber?: string;
    supplier?: string;
    expectedDelivery?: Date;
    receivedAt?: Date;
    receivedBy?: string;
    items: {
      resourceItemId?: string;
      name: string;
      orderedQuantity: number;
      receivedQuantity: number;
      condition: string;
    }[];
  };

  @Prop()
  notes: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;

  @Prop({ type: [{ type: MongooseSchema.Types.Mixed }] })
  history: {
    action: string;
    timestamp: Date;
    userId: string;
    note: string;
    previousStatus?: RequestStatus;
    newStatus?: RequestStatus;
  }[];

  @Prop({ default: false })
  isDeleted: boolean;
}

export const ResourceRequestSchema = SchemaFactory.createForClass(ResourceRequest);

// Add indexes
ResourceRequestSchema.index({ businessId: 1 });
ResourceRequestSchema.index({ requestNumber: 1 });
ResourceRequestSchema.index({ requestedBy: 1 });
ResourceRequestSchema.index({ status: 1 });
ResourceRequestSchema.index({ priority: 1 });
ResourceRequestSchema.index({ source: 1 });
ResourceRequestSchema.index({ 'items.resourceItemId': 1 });