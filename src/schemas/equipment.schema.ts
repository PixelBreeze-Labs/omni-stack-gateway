// src/schemas/equipment.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum EquipmentCategory {
  TOOLS = 'tools',
  MATERIALS = 'materials', 
  SAFETY = 'safety',
  ELECTRICAL = 'electrical',
  PLUMBING = 'plumbing',
  CONSTRUCTION = 'construction',
  VEHICLES = 'vehicles',
  OTHER = 'other'
}

export enum UnitOfMeasure {
  PIECES = 'pieces',
  METERS = 'meters',
  KILOGRAMS = 'kg',
  LITERS = 'liters',
  HOURS = 'hours',
  DAYS = 'days',
  BOXES = 'boxes',
  BAGS = 'bags',
  ROLLS = 'rolls',
  SHEETS = 'sheets'
}

@Schema({ timestamps: true })
export class Equipment extends Document {
  // Business isolation - every equipment belongs to a business
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  // Basic equipment information
  @Prop({ required: true })
  name: string; // "Hammer", "Safety Helmet", "Concrete Mix", "Drill"

  @Prop()
  description?: string; // Optional detailed description

  @Prop({
    type: String,
    enum: EquipmentCategory,
    default: EquipmentCategory.OTHER
  })
  category: EquipmentCategory;

  @Prop({
    type: String,
    enum: UnitOfMeasure,
    default: UnitOfMeasure.PIECES
  })
  unitOfMeasure: UnitOfMeasure;

  // Optional inventory tracking
  @Prop({ type: Number, default: 0 })
  currentStock?: number;

  @Prop({ type: Number })
  minimumStock?: number; // Alert when stock goes below this

  // Optional cost information
  @Prop({ type: Number })
  unitCost?: number; // Cost per unit

  // Status and availability
  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Boolean, default: true })
  isAvailable: boolean; // Can be requested

  // Additional metadata for flexibility
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: {
    supplier?: string;
    partNumber?: string;
    model?: string;
    brand?: string;
    purchaseDate?: Date;
    warrantyExpiry?: Date;
    location?: string; // Where equipment is stored
    notes?: string;
    [key: string]: any;
  };

  // User who created this equipment entry
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy?: string;

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

export const EquipmentSchema = SchemaFactory.createForClass(Equipment);

// Indexes for performance optimization
EquipmentSchema.index({ businessId: 1 }); // Most important - business isolation
EquipmentSchema.index({ businessId: 1, isActive: 1 }); // Active equipment per business
EquipmentSchema.index({ businessId: 1, category: 1 }); // Equipment by category
EquipmentSchema.index({ businessId: 1, isAvailable: 1 }); // Available equipment
EquipmentSchema.index({ businessId: 1, name: 1 }); // Search by name
EquipmentSchema.index({ isDeleted: 1 }); // Soft delete queries
EquipmentSchema.index({ currentStock: 1, minimumStock: 1 }); // Stock level alerts