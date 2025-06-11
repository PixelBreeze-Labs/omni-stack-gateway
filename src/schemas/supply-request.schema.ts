// src/schemas/supply-request.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum SupplyRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ORDERED = 'ordered',
  PARTIALLY_DELIVERED = 'partially_delivered',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled'
}

export enum SupplyRequestPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

// Individual equipment item in a supply request
interface RequestedEquipmentItem {
  equipmentId: string;
  equipmentName: string;           // Cached for performance
  equipmentCategory: string;       // Cached for performance
  quantityRequested: number;
  unitOfMeasure: string;          // Cached for performance
  estimatedUnitCost?: number;
  estimatedTotalCost?: number;
  notes?: string;
  quantityApproved?: number;      // May be different from requested
  quantityDelivered?: number;     // Track partial deliveries
}

@Schema({ timestamps: true })
export class SupplyRequest extends Document {
  // Core relationships
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'AppProject' })
  appProjectId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  requestedBy: string;

  // Basic request information
  @Prop({ required: true })
  description: string;

  @Prop()
  name?: string; // Optional custom name for the request

  @Prop({ required: true })
  requestedDate: Date; // When the request was made

  @Prop({ required: true })
  requiredDate: Date; // When supplies are needed by

  @Prop({
    type: String,
    enum: SupplyRequestStatus,
    default: SupplyRequestStatus.PENDING
  })
  status: SupplyRequestStatus;

  @Prop({
    type: String,
    enum: SupplyRequestPriority,
    default: SupplyRequestPriority.MEDIUM
  })
  priority: SupplyRequestPriority;

  // Equipment items requested
  @Prop({
    type: [{
      equipmentId: { type: MongooseSchema.Types.ObjectId, ref: 'Equipment', required: true },
      equipmentName: { type: String, required: true },
      equipmentCategory: { type: String },
      quantityRequested: { type: Number, required: true, min: 0.01 },
      unitOfMeasure: { type: String },
      estimatedUnitCost: { type: Number, min: 0 },
      estimatedTotalCost: { type: Number, min: 0 },
      notes: { type: String },
      quantityApproved: { type: Number, min: 0 },
      quantityDelivered: { type: Number, min: 0, default: 0 }
    }],
    validate: {
      validator: function(items: RequestedEquipmentItem[]) {
        return items && items.length > 0;
      },
      message: 'At least one equipment item must be requested'
    }
  })
  requestedItems: RequestedEquipmentItem[];

  // Cost calculations
  @Prop({ type: Number, min: 0 })
  totalEstimatedCost?: number;

  @Prop({ type: Number, min: 0 })
  totalApprovedCost?: number;

  @Prop({ type: Number, min: 0 })
  actualCost?: number; // Final cost after delivery

  // Approval workflow
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  approvedBy?: string;

  @Prop({ type: Date })
  approvedAt?: Date;

  @Prop()
  approvalNotes?: string;

  @Prop()
  rejectionReason?: string;

  // Delivery tracking
  @Prop({ type: Date })
  orderedAt?: Date;

  @Prop({ type: Date })
  expectedDeliveryDate?: Date;

  @Prop({ type: Date })
  deliveredAt?: Date;

  @Prop()
  deliveryNotes?: string;

  @Prop()
  supplierName?: string;

  @Prop()
  supplierContact?: string;

  @Prop()
  purchaseOrderNumber?: string;

  // Metadata for extensibility and caching
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: {
    requestedByName?: string;
    requestedByEmail?: string;
    projectName?: string;
    approvedByName?: string;
    totalItemsRequested?: number;
    totalItemsApproved?: number;
    totalItemsDelivered?: number;
    isUrgent?: boolean;
    attachments?: Array<{
      url: string;
      name: string;
      size: number;
      type: string;
    }>;
    [key: string]: any;
  };

  // Soft delete
  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  deletedBy?: string;

  // Timestamps (automatically managed by mongoose)
  createdAt: Date;
  updatedAt: Date;
}

export const SupplyRequestSchema = SchemaFactory.createForClass(SupplyRequest);

// Indexes for performance optimization
SupplyRequestSchema.index({ businessId: 1 });
SupplyRequestSchema.index({ appProjectId: 1 });
SupplyRequestSchema.index({ requestedBy: 1 });
SupplyRequestSchema.index({ businessId: 1, status: 1 });
SupplyRequestSchema.index({ businessId: 1, priority: 1 });
SupplyRequestSchema.index({ appProjectId: 1, status: 1 });
SupplyRequestSchema.index({ requiredDate: 1 }); // For deadline tracking
SupplyRequestSchema.index({ approvedBy: 1 });
SupplyRequestSchema.index({ isDeleted: 1 });
SupplyRequestSchema.index({ createdAt: -1 }); // For sorting by newest
SupplyRequestSchema.index({ 'requestedItems.equipmentId': 1 }); // Equipment usage tracking

// Virtual for checking if request is overdue
SupplyRequestSchema.virtual('isOverdue').get(function() {
  if (this.status === SupplyRequestStatus.DELIVERED || 
      this.status === SupplyRequestStatus.CANCELLED) {
    return false;
  }
  return this.requiredDate < new Date();
});

// Virtual for completion percentage
SupplyRequestSchema.virtual('completionPercentage').get(function() {
  if (!this.requestedItems || this.requestedItems.length === 0) return 0;
  
  const totalRequested = this.requestedItems.reduce((sum, item) => sum + item.quantityRequested, 0);
  const totalDelivered = this.requestedItems.reduce((sum, item) => sum + (item.quantityDelivered || 0), 0);
  
  return totalRequested > 0 ? Math.round((totalDelivered / totalRequested) * 100) : 0;
});