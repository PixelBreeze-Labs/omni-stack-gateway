// src/schemas/quality-inspection.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import mongoose from 'mongoose';

export enum InspectionStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  COMPLETE = 'complete'
}

export enum InspectionType {
  DETAILED = 'detailed',    // Construction with photos/signature
  SIMPLE = 'simple'         // Basic quality review
}

@Schema({ timestamps: true })
export class QualityInspection extends Document {
  // Basic identification
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'AppProject' })
  appProjectId: mongoose.Types.ObjectId;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'AppClient' })
  appClientId: string;

  // External IDs for sync with PHP
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  externalIds: {
    venueBoostId?: string;              // VenueBoost system ID
    [key: string]: string;              // Other system IDs
  };

  // Basic inspection info (minimal data)
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  inspectorId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  reviewerId?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  approverId?: string;

  @Prop({ type: String, enum: InspectionType, required: true })
  type: InspectionType;

  @Prop({ type: String, enum: InspectionStatus, default: InspectionStatus.DRAFT })
  status: InspectionStatus;

  @Prop({ required: true })
  location: string;

  @Prop()
  inspectionCategory?: string; // 'structural', 'materials', 'finishing', 'safety'

  // Minimal summary data
  @Prop()
  passedItems?: number;

  @Prop()
  failedItems?: number;

  @Prop()
  totalItems?: number;

  @Prop()
  overallRating?: number; // 1-5 for simple inspections

  @Prop()
  hasPhotos?: boolean;

  @Prop()
  hasSignature?: boolean;

  @Prop()
  hasCriticalIssues?: boolean;

  // Dates
  @Prop({ type: Date })
  inspectionDate?: Date;

  @Prop({ type: Date })
  reviewedDate?: Date;

  @Prop({ type: Date })
  approvedDate?: Date;

  @Prop({ type: Date })
  completedDate?: Date;

  // Metadata (all detailed data as strings/JSON)
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: {
    // For detailed inspections
    checklistItems?: string;        // JSON string of checklist
    photos?: string;                // JSON string of photo URLs
    signature?: string;             // Signature data/URL
    
    // For simple inspections
    remarks?: string;
    improvementSuggestions?: string;
    
    // Common
    notes?: string;
    clientFeedback?: string;
    
    // Sync info
    lastSyncDate?: Date;
    syncVersion?: number;
    
    // Any other data
    [key: string]: any;
  };

  // Soft delete
  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const QualityInspectionSchema = SchemaFactory.createForClass(QualityInspection);

// Indexes for performance
QualityInspectionSchema.index({ businessId: 1 });
QualityInspectionSchema.index({ appProjectId: 1 });
QualityInspectionSchema.index({ appClientId: 1 });
QualityInspectionSchema.index({ inspectorId: 1 });
QualityInspectionSchema.index({ reviewerId: 1 });
QualityInspectionSchema.index({ approverId: 1 });
QualityInspectionSchema.index({ status: 1 });
QualityInspectionSchema.index({ type: 1 });
QualityInspectionSchema.index({ inspectionDate: 1 });
QualityInspectionSchema.index({ 'externalIds.venueBoostId': 1 });
QualityInspectionSchema.index({ isDeleted: 1 });

// Virtual for pass rate calculation
QualityInspectionSchema.virtual('passRate').get(function() {
  if (!this.totalItems || this.totalItems === 0) return 0;
  return Math.round((this.passedItems / this.totalItems) * 100);
});