
// src/schemas/business-client-message.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum MessageSender {
    BUSINESS = 'business',
    CLIENT = 'client'
}

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
    FAILED = 'failed'
}

@Schema({ timestamps: true })
export class BusinessClientMessage extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
    businessId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'AppClient' })
    appClientId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ 
        type: String, 
        enum: MessageSender, 
        required: true 
    })
    sender: MessageSender;

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

    @Prop({ required: true })
    conversationId: string; // UUID for grouping messages

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
    senderUserId?: string; // If sent by a specific user from business side

    // File/attachment related fields
    @Prop()
    fileName?: string;

    @Prop()
    fileUrl?: string;

    @Prop()
    fileSize?: number;

    @Prop()
    mimeType?: string;

    // Message metadata
    @Prop({ type: Object, default: {} })
    metadata: {
        originalMessage?: string; // For system messages or replies
        isReply?: boolean;
        replyToMessageId?: string;
        [key: string]: any;
    };

    // Read status tracking
    @Prop({ type: Date })
    readAt?: Date;

    @Prop({ type: Date })
    deliveredAt?: Date;

    // Soft delete
    @Prop({ default: false })
    isDeleted: boolean;

    @Prop({ type: Date })
    deletedAt?: Date;
}

export const BusinessClientMessageSchema = SchemaFactory.createForClass(BusinessClientMessage);

// Add indexes for efficient querying
BusinessClientMessageSchema.index({ businessId: 1, appClientId: 1 });
BusinessClientMessageSchema.index({ conversationId: 1, createdAt: -1 });
BusinessClientMessageSchema.index({ businessId: 1, status: 1 });
BusinessClientMessageSchema.index({ appClientId: 1, sender: 1, status: 1 });
BusinessClientMessageSchema.index({ clientId: 1, createdAt: -1 });
BusinessClientMessageSchema.index({ createdAt: -1 });