// src/schemas/chat.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum ChatStatus {
    ACTIVE = 'active',
    ARCHIVED = 'archived',
    DELETED = 'deleted'
}

export enum ChatType {
    ORDER = 'order',
    BOOKING = 'booking',
    STAFF = 'staff',
    CLIENT = 'client'
}

@Schema({ timestamps: true })
export class Chat extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ type: String, required: true })
    endUserName: string;

    @Prop({ type: String, required: false })
    endUserEmail?: string;


    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Booking', required: false })
    bookingId?: string;

    @Prop({
        type: String,
        enum: ChatStatus,
        default: ChatStatus.ACTIVE
    })
    status: ChatStatus;

    @Prop({
        type: String,
        enum: ChatType,
        required: true
    })
    type: ChatType;

    @Prop({ type: Number, default: 0 })
    messageCount: number;

    @Prop({ type: Number, default: 0 })
    unreadCount: number;

    @Prop({ type: Object, required: false })
    lastMessage?: {
        content: string;
        type: string;
        senderId: number;
        createdAt: Date;
    };

    @Prop({ type: Object, default: {} })
    externalIds: {
        venueboostId?: string;
        [key: string]: string;
    };

    @Prop({ type: Map, of: String, default: {} })
    metadata: Map<string, any>;

}

export const ChatSchema = SchemaFactory.createForClass(Chat);

// Indexes
ChatSchema.index({ clientId: 1 });
ChatSchema.index({ status: 1 });
ChatSchema.index({ 'externalIds.venueboostId': 1 });
ChatSchema.index({ bookingId: 1 });