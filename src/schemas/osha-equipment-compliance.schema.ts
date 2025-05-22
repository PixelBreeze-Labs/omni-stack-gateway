// src/schemas/osha-equipment-compliance.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum EquipmentType {
  CRANE = 'crane',
  SCAFFOLDING = 'scaffolding',
  PPE = 'ppe',
  VEHICLE = 'vehicle',
  TOOLS = 'tools',
  MACHINERY = 'machinery',
  SAFETY_EQUIPMENT = 'safety_equipment',
  LIFTING_EQUIPMENT = 'lifting_equipment',
  ELECTRICAL_EQUIPMENT = 'electrical_equipment',
  OTHER = 'other'
}

export enum EquipmentComplianceStatus {
  COMPLIANT = 'compliant',
  NON_COMPLIANT = 'non_compliant',
  PENDING = 'pending',
  OVERDUE = 'overdue',
  OUT_OF_SERVICE = 'out_of_service'
}

@Schema({ timestamps: true })
export class OshaEquipmentCompliance extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'OshaComplianceRequirement' })
  oshaComplianceRequirementId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Equipment' })
  equipmentId?: string;

  @Prop({ 
    type: String, 
    enum: EquipmentType, 
    required: true 
  })
  equipmentType: EquipmentType;

  @Prop({ type: String })
  equipmentName?: string;

  @Prop({ type: String })
  serialNumber?: string;

  @Prop({ type: String })
  manufacturer?: string;

  @Prop({ type: String })
  model?: string;

  @Prop({ type: String })
  certificationNumber?: string;

  @Prop({ type: Date })
  certificationExpiry?: Date;

  @Prop({ type: Date })
  lastMaintenanceDate?: Date;

  @Prop({ type: Date })
  nextMaintenanceDate?: Date;

  @Prop({ type: Date })
  lastInspectionDate?: Date;

  @Prop({ type: Date })
  nextInspectionDate?: Date;

  @Prop({ 
    type: String, 
    enum: EquipmentComplianceStatus, 
    required: true,
    default: EquipmentComplianceStatus.PENDING 
  })
  status: EquipmentComplianceStatus;

  @Prop({ type: String })
  inspectionNotes?: string;

  @Prop({ type: String })
  maintenanceNotes?: string;

  @Prop({ type: [String], default: [] })
  inspectionPhotos: string[];

  @Prop({ type: [String], default: [] })
  maintenanceDocuments: string[];

  @Prop({ type: [String], default: [] })
  certificationDocuments: string[];

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;
}

export const OshaEquipmentComplianceSchema = SchemaFactory.createForClass(OshaEquipmentCompliance);

// Add indexes
OshaEquipmentComplianceSchema.index({ oshaComplianceRequirementId: 1 });
OshaEquipmentComplianceSchema.index({ equipmentId: 1 });
OshaEquipmentComplianceSchema.index({ equipmentType: 1 });
OshaEquipmentComplianceSchema.index({ status: 1 });
OshaEquipmentComplianceSchema.index({ serialNumber: 1 });
OshaEquipmentComplianceSchema.index({ certificationExpiry: 1 });
OshaEquipmentComplianceSchema.index({ nextMaintenanceDate: 1 });
OshaEquipmentComplianceSchema.index({ nextInspectionDate: 1 });
OshaEquipmentComplianceSchema.index({ isDeleted: 1 });