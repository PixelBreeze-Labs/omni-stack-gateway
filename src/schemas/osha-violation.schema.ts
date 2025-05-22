// src/schemas/osha-violation.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum ViolationType {
  SERIOUS = 'serious',
  WILLFUL = 'willful',
  REPEAT = 'repeat',
  OTHER = 'other',
  DE_MINIMIS = 'de_minimis',
  FAILURE_TO_ABATE = 'failure_to_abate'
}

export enum ViolationSeverity {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  CRITICAL = 'critical'
}

export enum ViolationStatus {
  OPEN = 'open',
  CORRECTED = 'corrected',
  ABATED = 'abated',
  CONTESTED = 'contested',
  PENDING_CORRECTION = 'pending_correction',
  OVERDUE = 'overdue'
}

@Schema({ timestamps: true })
export class OshaViolation extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'OshaInspection' })
  oshaInspectionId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'OshaComplianceRequirement' })
  oshaComplianceRequirementId?: string;

  @Prop({ 
    type: String, 
    enum: ViolationType, 
    required: true 
  })
  violationType: ViolationType;

  @Prop({ type: String })
  regulationViolated?: string;

  @Prop({ required: true })
  description: string;

  @Prop({ 
    type: String, 
    enum: ViolationSeverity, 
    required: true,
    default: ViolationSeverity.MEDIUM 
  })
  severity: ViolationSeverity;

  @Prop({ 
    type: String, 
    enum: ViolationStatus, 
    required: true,
    default: ViolationStatus.OPEN 
  })
  status: ViolationStatus;

  @Prop({ type: String })
  correctiveAction?: string;

  @Prop({ type: Date })
  correctionDeadline?: Date;

  @Prop({ type: Date })
  correctedDate?: Date;

  @Prop({ type: MongooseSchema.Types.Decimal128 })
  fineAmount?: number;

  @Prop({ type: String })
  notes?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Employee' })
  assignedTo?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Employee' })
  reportedBy?: string;

  @Prop({ type: [String], default: [] })
  evidencePhotos: string[];

  @Prop({ type: [String], default: [] })
  correctionDocuments: string[];

  @Prop({ type: Date })
  followUpDate?: Date;

  @Prop({ type: String })
  followUpNotes?: string;

  @Prop({ type: Boolean, default: false })
  requiresFollowUpInspection: boolean;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;

 
  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;
}

export const OshaViolationSchema = SchemaFactory.createForClass(OshaViolation);

// Add indexes
OshaViolationSchema.index({ oshaInspectionId: 1 });
OshaViolationSchema.index({ oshaComplianceRequirementId: 1 });
OshaViolationSchema.index({ violationType: 1 });
OshaViolationSchema.index({ severity: 1 });
OshaViolationSchema.index({ status: 1 });
OshaViolationSchema.index({ assignedTo: 1 });
OshaViolationSchema.index({ reportedBy: 1 });
OshaViolationSchema.index({ correctionDeadline: 1 });
OshaViolationSchema.index({ correctedDate: 1 });
OshaViolationSchema.index({ followUpDate: 1 });
OshaViolationSchema.index({ isDeleted: 1 });
OshaViolationSchema.index({ requiresFollowUpInspection: 1 });