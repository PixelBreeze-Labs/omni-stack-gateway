// src/schemas/osha-inspection.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum InspectionType {
  ROUTINE = 'routine',
  INCIDENT = 'incident',
  COMPLAINT = 'complaint',
  FOLLOW_UP = 'follow_up',
  CERTIFICATION = 'certification',
  MAINTENANCE = 'maintenance'
}

export enum InspectionStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed'
}

export enum InspectionResult {
  PASSED = 'passed',
  FAILED = 'failed',
  CONDITIONAL = 'conditional',
  PENDING = 'pending'
}

@Schema({ timestamps: true })
export class OshaInspection extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'OshaComplianceRequirement' })
  oshaComplianceRequirementId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Employee' })
  inspectorId: string;

  @Prop({ required: true, type: Date })
  inspectionDate: Date;

  @Prop({ 
    type: String, 
    enum: InspectionType, 
    required: true,
    default: InspectionType.ROUTINE 
  })
  inspectionType: InspectionType;

  @Prop({ 
    type: String, 
    enum: InspectionStatus, 
    required: true,
    default: InspectionStatus.SCHEDULED 
  })
  status: InspectionStatus;

  @Prop({ 
    type: String, 
    enum: InspectionResult 
  })
  result?: InspectionResult;

  @Prop({ type: Number, default: 0 })
  violationsFound: number;

  @Prop({ type: [Object], default: [] })
  violationsDetails: Array<{
    violationType: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
    regulationViolated?: string;
    immediateAction?: string;
  }>;

  @Prop({ type: [String], default: [] })
  correctiveActions: string[];

  @Prop({ type: Date })
  correctiveActionsDueDate?: Date;

  @Prop({ type: Boolean, default: false })
  followUpRequired: boolean;

  @Prop({ type: Date })
  nextInspectionDate?: Date;

  @Prop({ type: String })
  inspectorNotes?: string;

  @Prop({ type: [String], default: [] })
  photos: string[];

  @Prop({ type: [String], default: [] })
  documents: string[];

  @Prop({ type: Number, min: 0, max: 5 })
  safetyRating?: number;

  @Prop({ type: Object })
  weatherConditions?: {
    temperature?: number;
    humidity?: number;
    windSpeed?: number;
    precipitation?: string;
    visibility?: string;
  };

  @Prop({ type: Date })
  inspectionStartTime?: Date;

  @Prop({ type: Date })
  inspectionEndTime?: Date;

  @Prop({ type: Number })
  inspectionDuration?: number; // in minutes

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;
}

export const OshaInspectionSchema = SchemaFactory.createForClass(OshaInspection);

// Add indexes
OshaInspectionSchema.index({ oshaComplianceRequirementId: 1 });
OshaInspectionSchema.index({ inspectorId: 1 });
OshaInspectionSchema.index({ inspectionDate: 1 });
OshaInspectionSchema.index({ inspectionType: 1 });
OshaInspectionSchema.index({ status: 1 });
OshaInspectionSchema.index({ result: 1 });
OshaInspectionSchema.index({ followUpRequired: 1 });
OshaInspectionSchema.index({ nextInspectionDate: 1 });
OshaInspectionSchema.index({ correctiveActionsDueDate: 1 });
OshaInspectionSchema.index({ isDeleted: 1 });
OshaInspectionSchema.index({ violationsFound: 1 });