// src/schemas/report-flag.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum FlagReason {
    INAPPROPRIATE = 'inappropriate',
    SPAM = 'spam',
    MISINFORMATION = 'misinformation',
    DUPLICATE = 'duplicate',
    OTHER = 'other'
}

export enum FlagStatus {
    PENDING = 'pending',
    REVIEWED = 'reviewed',
    DISMISSED = 'dismissed'
}

@Schema()
export class ReportFlag extends Document {
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Report', required: true })
    reportId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
    userId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', required: true })
    clientId: string;

    @Prop({
        type: String,
        enum: Object.values(FlagReason),
        required: true
    })
    reason: FlagReason;

    @Prop({ type: String })
    comment: string;

    @Prop({
        type: String,
        enum: Object.values(FlagStatus),
        default: FlagStatus.PENDING
    })
    status: FlagStatus;

    @Prop({ type: Date, default: Date.now })
    createdAt: Date;

    @Prop({ type: Date, default: Date.now })
    updatedAt: Date;
}

export const ReportFlagSchema = SchemaFactory.createForClass(ReportFlag);