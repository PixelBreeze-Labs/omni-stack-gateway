// src/schemas/social-chat.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum ChatType {
    SINGLE = 'single',
    GROUP = 'group'
}

@Schema({ timestamps: true })
export class SocialChat extends Document {
    @Prop({
        type: String,
        enum: ChatType,
        required: true
    })
    type: ChatType;

    @Prop({
        type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }],
        required: true
    })
    participants: string[];

    @Prop({ type: String })
    name?: string;  // For group chats

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'SocialMessage' })
    lastMessageId?: string;

    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: 'Client',
        required: true
    })
    clientId: string;

    @Prop({ type: Object, default: {} })
    metadata: Record<string, any>;

    @Prop({ default: true })
    isActive: boolean;
}

export const SocialChatSchema = SchemaFactory.createForClass(SocialChat);

// Add indexes
SocialChatSchema.index({ participants: 1 });
SocialChatSchema.index({ clientId: 1 });
SocialChatSchema.index({ lastMessageId: 1 });