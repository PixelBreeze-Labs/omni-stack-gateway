// src/schemas/resource-item.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum ResourceType {
  EQUIPMENT = 'equipment',
  MATERIAL = 'material',
  TOOL = 'tool',
  CONSUMABLE = 'consumable',
  SERVICE = 'service',
  SOFTWARE = 'software',
  LICENSE = 'license',
  OTHER = 'other'
}

export enum ResourceStatus {
  AVAILABLE = 'available',
  IN_USE = 'in_use',
  MAINTENANCE = 'maintenance',
  DEPLETED = 'depleted',
  ORDERED = 'ordered',
  RESERVED = 'reserved',
  EXPIRED = 'expired',
  DISPOSED = 'disposed'
}

@Schema({ timestamps: true })
export class ResourceItem extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop({ required: true, enum: ResourceType })
  type: ResourceType;

  @Prop({ required: true, enum: ResourceStatus, default: ResourceStatus.AVAILABLE })
  status: ResourceStatus;

  @Prop({ type: Number, default: 0 })
  currentQuantity: number;

  @Prop({ type: Number })
  minQuantity: number;

  @Prop({ type: Number })
  optimalQuantity: number;

  @Prop({ type: Number })
  maxQuantity: number;

  @Prop({ type: Number })
  unitCost: number;

  @Prop({ type: String })
  currency: string;

  @Prop({ type: String })
  unit: string;

  @Prop({ type: String })
  location: string;

  @Prop({ type: String })
  supplier: string;

  @Prop({ type: String })
  supplierContact: string;

  @Prop({ type: Date })
  expiryDate: Date;

  @Prop({ type: Date })
  maintenanceDue: Date;

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'User' })
  assignedTo: string[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const ResourceItemSchema = SchemaFactory.createForClass(ResourceItem);

// Add indexes
ResourceItemSchema.index({ businessId: 1 });
ResourceItemSchema.index({ type: 1 });
ResourceItemSchema.index({ status: 1 });
ResourceItemSchema.index({ currentQuantity: 1 });