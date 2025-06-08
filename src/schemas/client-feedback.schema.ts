// src/schemas/client-feedback.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum FeedbackType {
  COMPLAINT = 'complaint',
  SUGGESTION = 'suggestion',
  COMPLIMENT = 'compliment',
  QUALITY_ISSUE = 'quality_issue',
  SERVICE_ISSUE = 'service_issue',
  GENERAL = 'general'
}

export enum FeedbackStatus {
  PENDING = 'pending',           // Submitted by client, waiting for Staffluent review
  APPROVED = 'approved',         // Approved by Staffluent, visible to business
  REJECTED = 'rejected',         // Rejected by Staffluent, not visible to business
  RESPONDED = 'responded',       // Business has responded
  RESOLVED = 'resolved',         // Marked as resolved
  ESCALATED = 'escalated'        // Escalated for higher attention
}

export enum FeedbackPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

interface BusinessResponse {
  responseText: string;
  respondedBy: string;        // Business user who responded
  respondedAt: Date;
  isPublic: boolean;          // Whether client can see this response
  attachments?: string[];     // URLs to attached files
  metadata?: any;
}

interface StaffluentAction {
  action: 'approved' | 'rejected' | 'escalated' | 'resolved';
  staffluentUserId?: string;
  reason?: string;
  notes?: string;
  actionDate: Date;
}

@Schema({ timestamps: true })
export class ClientFeedback extends Document {
  // Basic identification
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'AppClient' })
  appClientId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'AppProject' })
  appProjectId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  // External IDs for sync
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  externalIds: {
    venueBoostId?: string;
    [key: string]: string;
  };

  // Feedback content
  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  comment: string;

  @Prop({
    type: String,
    enum: FeedbackType,
    required: true
  })
  type: FeedbackType;

  @Prop({
    type: String,
    enum: FeedbackStatus,
    default: FeedbackStatus.PENDING
  })
  status: FeedbackStatus;

  @Prop({
    type: String,
    enum: FeedbackPriority,
    default: FeedbackPriority.MEDIUM
  })
  priority: FeedbackPriority;

  // Rating (1-5 scale)
  @Prop({ min: 1, max: 5 })
  rating?: number;

  // Project completion details
  @Prop()
  projectCompletedDate?: Date;

  @Prop()
  serviceCategory?: string;     // e.g., 'cleaning', 'maintenance', 'construction'

  // Attachments and evidence
  @Prop({ type: [String], default: [] })
  attachments: string[];        // URLs to uploaded files/images

  // Client contact info (for follow-up)
  @Prop()
  clientName: string;

  @Prop()
  clientEmail?: string;

  @Prop()
  clientPhone?: string;

  @Prop({ default: true })
  allowBusinessContact: boolean; // Whether business can contact client directly

  // Business response
  @Prop({ type: MongooseSchema.Types.Mixed })
  businessResponse?: BusinessResponse;

  // Staffluent actions
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  staffluentActions: StaffluentAction[];

  // Workflow dates
  @Prop()
  submittedAt: Date;

  @Prop()
  approvedAt?: Date;

  @Prop()
  respondedAt?: Date;

  @Prop()
  resolvedAt?: Date;

  // Follow-up tracking
  @Prop({ default: false })
  requiresFollowUp: boolean;

  @Prop()
  followUpDate?: Date;

  @Prop()
  followUpNotes?: string;

  // Visibility and permissions
  @Prop({ default: true })
  isVisible: boolean;           // Staffluent can hide inappropriate feedback

  @Prop({ default: false })
  isPublicTestimonial: boolean; // Can be used as public testimonial

  @Prop({ default: false })
  isAnonymous: boolean;         // Hide client details from business

  // Metadata for additional information
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: {
    clientLocation?: string;
    deviceInfo?: string;
    browserInfo?: string;
    submissionSource?: string;  // 'web', 'mobile', 'email', etc.
    relatedTicketId?: string;
    internalNotes?: string;
    tags?: string[];
    [key: string]: any;
  };

  // Soft delete
  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop()
  deletedBy?: string;           // Who deleted it

  @Prop()
  deletionReason?: string;
}

export const ClientFeedbackSchema = SchemaFactory.createForClass(ClientFeedback);

// Add indexes for performance
ClientFeedbackSchema.index({ appClientId: 1 });
ClientFeedbackSchema.index({ appProjectId: 1 });
ClientFeedbackSchema.index({ businessId: 1 });
ClientFeedbackSchema.index({ status: 1 });
ClientFeedbackSchema.index({ type: 1 });
ClientFeedbackSchema.index({ priority: 1 });
ClientFeedbackSchema.index({ rating: 1 });
ClientFeedbackSchema.index({ submittedAt: 1 });
ClientFeedbackSchema.index({ approvedAt: 1 });
ClientFeedbackSchema.index({ 'externalIds.venueBoostId': 1 });
ClientFeedbackSchema.index({ isDeleted: 1 });
ClientFeedbackSchema.index({ isVisible: 1 });
ClientFeedbackSchema.index({ isPublicTestimonial: 1 });
ClientFeedbackSchema.index({ serviceCategory: 1 });

// Compound indexes for common queries
ClientFeedbackSchema.index({ businessId: 1, status: 1 });
ClientFeedbackSchema.index({ appClientId: 1, status: 1 });
ClientFeedbackSchema.index({ businessId: 1, type: 1, status: 1 });
ClientFeedbackSchema.index({ businessId: 1, rating: 1, status: 1 });

// Virtual for business reference
ClientFeedbackSchema.virtual('business', {
  ref: 'Business',
  localField: 'businessId',
  foreignField: '_id',
  justOne: true
});

// Virtual for client reference
ClientFeedbackSchema.virtual('appClient', {
  ref: 'AppClient',
  localField: 'appClientId',
  foreignField: '_id',
  justOne: true
});

// Virtual for project reference
ClientFeedbackSchema.virtual('appProject', {
  ref: 'AppProject',
  localField: 'appProjectId',
  foreignField: '_id',
  justOne: true
});