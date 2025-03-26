// src/schemas/social-message.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum MessageType {
    TEXT = 'text',
    IMAGE = 'image',
    VIDEO = 'video',
    AUDIO = 'audio',
    FILE = 'file',
    LOCATION = 'location'
}

export enum MessageStatus {
    SENT = 'sent',
    DELIVERED = 'delivered',
    READ = 'read',
    FAILED = 'failed'
}

@Schema({ timestamps: true })
export class SocialMessage extends Document {
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: 'User',
        required: true
    })
    senderId: string;

    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: 'SocialChat',
        required: true
    })
    chatId: string;

    @Prop({ required: true })
    content: string;

    @Prop({
        type: String,
        enum: MessageType,
        default: MessageType.TEXT
    })
    type: MessageType;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'SocialMessage' })
    replyToId?: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'SocialMessage' })
    forwardedFromId?: string;

    @Prop({
        type: [{
            userId: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
            status: { type: String, enum: MessageStatus },
            timestamp: { type: Date, default: Date.now }
        }],
        default: []
    })
    readReceipts: Array<{
        userId: string;
        status: MessageStatus;
        timestamp: Date;
    }>;

    @Prop({ type: Object, default: {} })
    metadata: Record<string, any>;

    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: 'Client',
        required: true
    })
    clientId: string;

    @Prop({ default: true })
    isActive: boolean;
}

export const SocialMessageSchema = SchemaFactory.createForClass(SocialMessage);

// Add indexes
SocialMessageSchema.index({ chatId: 1, createdAt: -1 });
SocialMessageSchema.index({ senderId: 1 });
SocialMessageSchema.index({ clientId: 1 });
SocialMessageSchema.index({ 'readReceipts.userId': 1 });