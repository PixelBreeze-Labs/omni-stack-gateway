// src/schemas/project-comment.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum CommentType {
  TEXT = 'text',
  TEXT_WITH_IMAGE = 'text_with_image',
  SYSTEM = 'system'
}

export enum CommentStatus {
  ACTIVE = 'active',
  EDITED = 'edited',
  DELETED = 'deleted'
}

@Schema({ timestamps: true })
export class ProjectComment extends Document {
  // Core relationships
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'AppProject' })
  appProjectId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  authorId: string;

  // Comment content
  @Prop({ required: true })
  content: string;

  @Prop({
    type: String,
    enum: CommentType,
    default: CommentType.TEXT
  })
  commentType: CommentType;

  @Prop({
    type: String,
    enum: CommentStatus,
    default: CommentStatus.ACTIVE
  })
  status: CommentStatus;

  // Threading support (optional replies)
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProjectComment' })
  parentCommentId?: string;

  @Prop({ type: Number, default: 0 })
  replyCount: number;

  // Image attachment (single image per comment)
  @Prop()
  imageUrl?: string;

  @Prop()
  imageName?: string;

  @Prop()
  imageSize?: number;

  // Edit tracking
  @Prop({ type: Date })
  lastEditedAt?: Date;

  @Prop()
  editReason?: string;

  // Metadata for extensibility
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: {
    isAdminComment?: boolean;
    authorName?: string;        // Cached for performance
    authorEmail?: string;       // Cached for performance
    projectName?: string;       // Cached for performance
    mentionedUsers?: string[];  // Future: @mentions
    tags?: string[];           // Future: #tags
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

export const ProjectCommentSchema = SchemaFactory.createForClass(ProjectComment);

// Indexes for performance optimization
ProjectCommentSchema.index({ businessId: 1 });
ProjectCommentSchema.index({ appProjectId: 1 });
ProjectCommentSchema.index({ authorId: 1 });
ProjectCommentSchema.index({ appProjectId: 1, createdAt: -1 }); // Get project comments by date
ProjectCommentSchema.index({ parentCommentId: 1 }); // Get replies
ProjectCommentSchema.index({ businessId: 1, status: 1 });
ProjectCommentSchema.index({ isDeleted: 1 });
ProjectCommentSchema.index({ createdAt: -1 }); // General date sorting

// Virtual for getting comment URL or display info
ProjectCommentSchema.virtual('isReply').get(function() {
  return !!this.parentCommentId;
});

ProjectCommentSchema.virtual('hasImage').get(function() {
  return this.commentType === CommentType.TEXT_WITH_IMAGE && !!this.imageUrl;
});