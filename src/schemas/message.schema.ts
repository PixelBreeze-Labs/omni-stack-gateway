// src/schemas/message.schema.ts
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
export class Message extends Document {
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

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Message' })
    replyToId?: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Message' })
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

export const MessageSchema = SchemaFactory.createForClass(Message);

// Add indexes
MessageSchema.index({ chatId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1 });
MessageSchema.index({ clientId: 1 });
MessageSchema.index({ 'readReceipts.userId': 1 });