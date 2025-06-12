// src/schemas/project-checklist.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum ChecklistType {
  SAFETY = 'safety',
  QUALITY_CONTROL = 'quality_control',
  FOUNDATION = 'foundation',
  ELECTRICAL = 'electrical',
  PLUMBING = 'plumbing',
  CONSTRUCTION = 'construction',
  INSPECTION = 'inspection',
  COMPLETION = 'completion',
  CUSTOM = 'custom'
}

export enum ChecklistStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  PAUSED = 'paused',
  ARCHIVED = 'archived'
}

export enum ChecklistPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

@Schema({ timestamps: true })
export class ProjectChecklist extends Document {
  // Core relationships
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'AppProject' })
  appProjectId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy: string;

  // Checklist details
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({
    type: String,
    enum: ChecklistType,
    default: ChecklistType.CUSTOM
  })
  type: ChecklistType;

  @Prop({
    type: String,
    enum: ChecklistStatus,
    default: ChecklistStatus.ACTIVE
  })
  status: ChecklistStatus;

  @Prop({
    type: String,
    enum: ChecklistPriority,
    default: ChecklistPriority.MEDIUM
  })
  priority: ChecklistPriority;

  // Progress tracking
  @Prop({ type: Number, default: 0 })
  totalItems: number;

  @Prop({ type: Number, default: 0 })
  completedItems: number;

  @Prop({ type: Number, default: 0 })
  completionPercentage: number;

  // Dates
  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ type: Date })
  startDate?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  // SIMPLE USER ASSIGNMENTS (for quick queries)
  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }], default: [] })
  assignedUsers: string[];

  // SIMPLE TEAM ASSIGNMENTS (for quick queries)
  @Prop({ type: [String], default: [] }) // Array of team IDs from business.teams[]
  assignedTeams: string[];

  // DETAILED USER ASSIGNMENTS (with metadata)
  @Prop({ 
    type: [{
      userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
      role: { type: String }, // 'reviewer', 'assignee', 'approver'
      assignedAt: { type: Date, default: Date.now },
      assignedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
      isActive: { type: Boolean, default: true },
      metadata: { type: MongooseSchema.Types.Mixed, default: {} }
    }], 
    default: [] 
  })
  userAssignments: Array<{
    userId: string;
    role?: string;
    assignedAt: Date;
    assignedBy: string;
    isActive: boolean;
    metadata?: Record<string, any>;
  }>;

  // DETAILED TEAM ASSIGNMENTS (with metadata)
  @Prop({ 
    type: [{
      teamId: { type: String, required: true }, // References business.teams[].id
      teamName: { type: String, required: true }, // Cached team name
      assignedAt: { type: Date, default: Date.now },
      assignedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
      isActive: { type: Boolean, default: true },
      role: { type: String }, // 'primary', 'support', 'reviewer'
      metadata: { type: MongooseSchema.Types.Mixed, default: {} }
    }], 
    default: [] 
  })
  teamAssignments: Array<{
    teamId: string;
    teamName: string;
    assignedAt: Date;
    assignedBy: string;
    isActive: boolean;
    role?: string;
    metadata?: Record<string, any>;
  }>;

  // Template information (if created from template)
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ChecklistTemplate' })
  templateId?: string;

  @Prop()
  templateName?: string;

  // Metadata for extensibility and caching
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: {
    createdByName?: string;
    createdByEmail?: string;
    projectName?: string;
    isTemplate?: boolean;
    estimatedHours?: number;
    actualHours?: number;
    tags?: string[];
    department?: string;
    phase?: string; // Project phase this checklist belongs to
    dependencies?: string[]; // Other checklist IDs that must be completed first
    approvalRequired?: boolean;
    approvedBy?: string;
    approvedAt?: Date;
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

export const ProjectChecklistSchema = SchemaFactory.createForClass(ProjectChecklist);

// Indexes for performance optimization
ProjectChecklistSchema.index({ businessId: 1 });
ProjectChecklistSchema.index({ appProjectId: 1 });
ProjectChecklistSchema.index({ createdBy: 1 });
ProjectChecklistSchema.index({ appProjectId: 1, status: 1 });
ProjectChecklistSchema.index({ assignedUsers: 1 });
ProjectChecklistSchema.index({ assignedTeams: 1 });
ProjectChecklistSchema.index({ type: 1 });
ProjectChecklistSchema.index({ priority: 1 });
ProjectChecklistSchema.index({ dueDate: 1 });
ProjectChecklistSchema.index({ isDeleted: 1 });
ProjectChecklistSchema.index({ createdAt: -1 });

// Virtual for checking if checklist is overdue
ProjectChecklistSchema.virtual('isOverdue').get(function() {
  if (this.status === ChecklistStatus.COMPLETED || 
      this.status === ChecklistStatus.ARCHIVED) {
    return false;
  }
  return this.dueDate && this.dueDate < new Date();
});

// Virtual for checking if checklist is complete
ProjectChecklistSchema.virtual('isComplete').get(function() {
  return this.status === ChecklistStatus.COMPLETED || this.completionPercentage >= 100;
});

// src/schemas/project-checklist-item.schema.ts
export enum ChecklistItemStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
  BLOCKED = 'blocked'
}

export enum ChecklistItemPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

@Schema({ timestamps: true })
export class ProjectChecklistItem extends Document {
  // Core relationships
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'AppProject' })
  appProjectId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'ProjectChecklist' })
  checklistId: string;

  // Item details
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop()
  notes?: string;

  @Prop({
    type: String,
    enum: ChecklistItemStatus,
    default: ChecklistItemStatus.PENDING
  })
  status: ChecklistItemStatus;

  @Prop({
    type: String,
    enum: ChecklistItemPriority,
    default: ChecklistItemPriority.MEDIUM
  })
  priority: ChecklistItemPriority;

  // Completion tracking
  @Prop({ type: Boolean, default: false })
  isCompleted: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  completedBy?: string;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop()
  completionNotes?: string;

  // Assignment
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  assignedTo?: string;

  @Prop({ type: Date })
  assignedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  assignedBy?: string;

  // Dates
  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ type: Date })
  startDate?: Date;

  @Prop({ type: Number, default: 0 })
  sortOrder: number; // For ordering items within checklist

  // Dependencies (other checklist items that must be completed first)
  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'ProjectChecklistItem' }], default: [] })
  dependencies: string[];

  // Approval workflow
  @Prop({ type: Boolean, default: false })
  requiresApproval: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  approvedBy?: string;

  @Prop({ type: Date })
  approvedAt?: Date;

  @Prop()
  approvalNotes?: string;

  // File attachments (photos, documents related to task completion)
  @Prop({
    type: [{
      url: { type: String, required: true },
      name: { type: String, required: true },
      size: { type: Number },
      mimeType: { type: String },
      uploadedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
      uploadedAt: { type: Date, default: Date.now }
    }],
    default: []
  })
  attachments: Array<{
    url: string;
    name: string;
    size?: number;
    mimeType?: string;
    uploadedBy: string;
    uploadedAt: Date;
  }>;

  // Time tracking
  @Prop({ type: Number })
  estimatedMinutes?: number;

  @Prop({ type: Number })
  actualMinutes?: number;

  @Prop({ type: Date })
  timeStarted?: Date;

  @Prop({ type: Date })
  timeEnded?: Date;

  // Metadata for extensibility and caching
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: {
    checklistName?: string;
    projectName?: string;
    assignedToName?: string;
    completedByName?: string;
    isSubTask?: boolean;
    parentItemId?: string;
    level?: number; // For nested sub-tasks
    tags?: string[];
    location?: string;
    equipment?: string[];
    materials?: string[];
    safetyRequirements?: string[];
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

export const ProjectChecklistItemSchema = SchemaFactory.createForClass(ProjectChecklistItem);

// Indexes for performance optimization
ProjectChecklistItemSchema.index({ businessId: 1 });
ProjectChecklistItemSchema.index({ appProjectId: 1 });
ProjectChecklistItemSchema.index({ checklistId: 1 });
ProjectChecklistItemSchema.index({ assignedTo: 1 });
ProjectChecklistItemSchema.index({ checklistId: 1, sortOrder: 1 }); // For ordered retrieval
ProjectChecklistItemSchema.index({ appProjectId: 1, assignedTo: 1 }); // User's tasks in project
ProjectChecklistItemSchema.index({ status: 1 });
ProjectChecklistItemSchema.index({ isCompleted: 1 });
ProjectChecklistItemSchema.index({ dueDate: 1 });
ProjectChecklistItemSchema.index({ dependencies: 1 });
ProjectChecklistItemSchema.index({ isDeleted: 1 });
ProjectChecklistItemSchema.index({ createdAt: -1 });

// Virtual for checking if item is overdue
ProjectChecklistItemSchema.virtual('isOverdue').get(function() {
  if (this.isCompleted || this.status === ChecklistItemStatus.COMPLETED) {
    return false;
  }
  return this.dueDate && this.dueDate < new Date();
});

// Virtual for checking if dependencies are met
ProjectChecklistItemSchema.virtual('canStart').get(function() {
  // This would need to be calculated in the service layer with dependency checks
  return this.dependencies.length === 0 || this.status !== ChecklistItemStatus.PENDING;
});