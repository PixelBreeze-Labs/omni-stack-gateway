// src/schemas/project-issue.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum IssuePriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum IssueStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  REOPENED = 'reopened'
}

export enum IssueCategory {
  SAFETY = 'safety',
  QUALITY = 'quality',
  MATERIALS = 'materials',
  EQUIPMENT = 'equipment',
  WEATHER = 'weather',
  PERSONNEL = 'personnel',
  OTHER = 'other'
}

@Schema({ timestamps: true })
export class ProjectIssue extends Document {
  // Core relationships
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'AppProject' })
  appProjectId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  reportedBy: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  assignedTo?: string;

  // Issue details
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({
    type: String,
    enum: IssuePriority,
    required: true
  })
  priority: IssuePriority;

  @Prop({
    type: String,
    enum: IssueStatus,
    default: IssueStatus.OPEN
  })
  status: IssueStatus;

  @Prop({
    type: String,
    enum: IssueCategory,
    default: IssueCategory.OTHER
  })
  category: IssueCategory;

  @Prop()
  location?: string;

  // Photo attachments (multiple photos allowed)
  @Prop({ type: [String], default: [] })
  photoUrls: string[];

  @Prop({ type: [String], default: [] })
  photoNames: string[];

  @Prop({ type: [Number], default: [] })
  photoSizes: number[];

  // Issue tracking
  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ type: Date })
  resolvedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  resolvedBy?: string;

  @Prop()
  resolutionNotes?: string;

  // Metadata for extensibility
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: {
    reporterName?: string;      // Cached for performance
    reporterEmail?: string;     // Cached for performance
    projectName?: string;       // Cached for performance
    assigneeName?: string;      // Cached for performance
    tags?: string[];           // Custom tags
    estimatedCost?: number;    // Cost impact
    timeImpact?: number;       // Hours of delay
    [key: string]: any;
  };

  // Soft delete
  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  deletedBy?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export const ProjectIssueSchema = SchemaFactory.createForClass(ProjectIssue);

// Indexes for performance
ProjectIssueSchema.index({ businessId: 1 });
ProjectIssueSchema.index({ appProjectId: 1 });
ProjectIssueSchema.index({ reportedBy: 1 });
ProjectIssueSchema.index({ assignedTo: 1 });
ProjectIssueSchema.index({ appProjectId: 1, status: 1 });
ProjectIssueSchema.index({ appProjectId: 1, priority: 1 });
ProjectIssueSchema.index({ appProjectId: 1, category: 1 });
ProjectIssueSchema.index({ businessId: 1, status: 1 });
ProjectIssueSchema.index({ status: 1, priority: 1 });
ProjectIssueSchema.index({ dueDate: 1 });
ProjectIssueSchema.index({ isDeleted: 1 });
ProjectIssueSchema.index({ createdAt: -1 });

// Virtual for photo count
ProjectIssueSchema.virtual('photoCount').get(function() {
  return this.photoUrls?.length || 0;
});

// Virtual for days since reported
ProjectIssueSchema.virtual('daysSinceReported').get(function() {
  if (!this.createdAt) return 0;
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - this.createdAt.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for is overdue
ProjectIssueSchema.virtual('isOverdue').get(function() {
  if (!this.dueDate || this.status === IssueStatus.RESOLVED || this.status === IssueStatus.CLOSED) {
    return false;
  }
  return new Date() > this.dueDate;
});