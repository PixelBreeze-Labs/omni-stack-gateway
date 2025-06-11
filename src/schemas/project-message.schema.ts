// src/schemas/project-message.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum MessageType {
  TEXT = 'text',
  FILE = 'file',
  IMAGE = 'image',
  SYSTEM = 'system'
}

export enum MessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  DELETED = 'deleted'
}

@Schema({ timestamps: true })
export class ProjectMessage extends Document {
  // Core relationships
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'AppProject' })
  appProjectId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  senderUserId: string;

  // Message content
  @Prop({ required: true })
  content: string;

  @Prop({
    type: String,
    enum: MessageType,
    default: MessageType.TEXT
  })
  messageType: MessageType;

  @Prop({
    type: String,
    enum: MessageStatus,
    default: MessageStatus.SENT
  })
  status: MessageStatus;

  // File attachment (single file per message)
  @Prop()
  fileUrl?: string;

  @Prop()
  fileName?: string;

  @Prop()
  fileSize?: number;

  @Prop()
  mimeType?: string;

  // Message threading (optional replies)
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProjectMessage' })
  replyToMessageId?: string;

  @Prop({ type: Number, default: 0 })
  replyCount: number;

  // Read receipts - array of user IDs who have read the message
  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }], default: [] })
  readBy: string[];

  @Prop({ type: Date })
  readAt?: Date; // When first read

  // Message reactions (future feature)
  @Prop({
    type: [{
      userId: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
      reaction: { type: String }, // emoji or reaction type
      reactedAt: { type: Date, default: Date.now }
    }],
    default: []
  })
  reactions?: Array<{
    userId: string;
    reaction: string;
    reactedAt: Date;
  }>;

  // Edit tracking
  @Prop({ type: Date })
  lastEditedAt?: Date;

  @Prop()
  editReason?: string;

  @Prop({ type: Boolean, default: false })
  isEdited: boolean;

  // System message data (for automated messages)
  @Prop({ type: MongooseSchema.Types.Mixed })
  systemMessageData?: {
    action?: string; // 'user_added', 'user_removed', 'status_changed', etc.
    targetUserId?: string;
    targetUserName?: string;
    oldValue?: string;
    newValue?: string;
    [key: string]: any;
  };

  // Metadata for extensibility and caching
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: {
    senderName?: string;        // Cached for performance
    senderEmail?: string;       // Cached for performance
    projectName?: string;       // Cached for performance
    isSystemMessage?: boolean;
    mentionedUsers?: string[];  // Future: @mentions
    tags?: string[];           // Future: #tags
    priority?: 'low' | 'medium' | 'high'; // Future: message priority
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

export const ProjectMessageSchema = SchemaFactory.createForClass(ProjectMessage);

// Indexes for performance optimization
ProjectMessageSchema.index({ businessId: 1 });
ProjectMessageSchema.index({ appProjectId: 1 });
ProjectMessageSchema.index({ senderUserId: 1 });
ProjectMessageSchema.index({ appProjectId: 1, createdAt: -1 }); // Get project messages by date
ProjectMessageSchema.index({ replyToMessageId: 1 }); // Get replies
ProjectMessageSchema.index({ businessId: 1, messageType: 1 });
ProjectMessageSchema.index({ isDeleted: 1 });
ProjectMessageSchema.index({ createdAt: -1 }); // General date sorting
ProjectMessageSchema.index({ readBy: 1 }); // Read receipts
ProjectMessageSchema.index({ 'reactions.userId': 1 }); // Message reactions

// Virtual for checking if message is a reply
ProjectMessageSchema.virtual('isReply').get(function() {
  return !!this.replyToMessageId;
});

// Virtual for checking if message has file
ProjectMessageSchema.virtual('hasFile').get(function() {
  return [MessageType.FILE, MessageType.IMAGE].includes(this.messageType) && !!this.fileUrl;
});

// Virtual for checking if message is system generated
ProjectMessageSchema.virtual('isSystemGenerated').get(function() {
  return this.messageType === MessageType.SYSTEM;
});