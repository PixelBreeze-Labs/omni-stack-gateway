// src/schemas/osha-compliance-requirement.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum OshaComplianceCategory {
  EQUIPMENT = 'equipment',
  SITE = 'site',
  PROCESS = 'process',
  ENVIRONMENTAL = 'environmental'
}

export enum OshaComplianceType {
  INSPECTION = 'inspection',
  TRAINING = 'training',
  DOCUMENTATION = 'documentation',
  MAINTENANCE = 'maintenance'
}

export enum OshaCompliancePriority {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export enum OshaComplianceStatus {
  COMPLIANT = 'compliant',
  NON_COMPLIANT = 'non_compliant',
  PENDING = 'pending',
  OVERDUE = 'overdue'
}

export enum OshaComplianceFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUALLY = 'annually'
}

@Schema({ timestamps: true })
export class OshaComplianceRequirement extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ConstructionSite' })
  constructionSiteId?: string;

  @Prop({ required: true })
  title: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ 
    type: String, 
    enum: OshaComplianceCategory, 
    required: true 
  })
  category: OshaComplianceCategory;

  @Prop({ 
    type: String, 
    enum: OshaComplianceType, 
    required: true 
  })
  complianceType: OshaComplianceType;

  @Prop({ 
    type: String, 
    enum: OshaCompliancePriority, 
    required: true,
    default: OshaCompliancePriority.MEDIUM 
  })
  priority: OshaCompliancePriority;

  @Prop({ 
    type: String, 
    enum: OshaComplianceStatus, 
    required: true,
    default: OshaComplianceStatus.PENDING 
  })
  status: OshaComplianceStatus;

  @Prop({ type: String })
  regulationReference?: string;

  @Prop({ 
    type: String, 
    enum: OshaComplianceFrequency, 
    required: true 
  })
  frequency: OshaComplianceFrequency;

  @Prop({ type: Date })
  lastInspectionDate?: Date;

  @Prop({ type: Date })
  nextInspectionDate?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Employee' })
  assignedTo?: string;

  @Prop({ type: [String], default: [] })
  requirements: string[];

  @Prop({ type: [String], default: [] })
  requiredActions: string[];

  @Prop({ type: [String], default: [] })
  documentationLinks: string[];

  @Prop({ type: String })
  notes?: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;


  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;
}

export const OshaComplianceRequirementSchema = SchemaFactory.createForClass(OshaComplianceRequirement);

// Add indexes
OshaComplianceRequirementSchema.index({ businessId: 1 });
OshaComplianceRequirementSchema.index({ constructionSiteId: 1 });
OshaComplianceRequirementSchema.index({ category: 1 });
OshaComplianceRequirementSchema.index({ complianceType: 1 });
OshaComplianceRequirementSchema.index({ status: 1 });
OshaComplianceRequirementSchema.index({ priority: 1 });
OshaComplianceRequirementSchema.index({ assignedTo: 1 });
OshaComplianceRequirementSchema.index({ nextInspectionDate: 1 });
OshaComplianceRequirementSchema.index({ isDeleted: 1 });
OshaComplianceRequirementSchema.index({ frequency: 1 });