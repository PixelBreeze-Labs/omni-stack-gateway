// src/schemas/report-comment.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum CommentStatus {
    PENDING_REVIEW = 'pending_review',
    APPROVED = 'approved',
    REJECTED = 'rejected'
}

@Schema()
export class ReportComment extends Document {
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Report', required: true })
    reportId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
    authorId: string;

    @Prop({ required: true })
    content: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', required: true })
    clientId: string;

    @Prop({
        type: String,
        enum: Object.values(CommentStatus),
        default: CommentStatus.PENDING_REVIEW
    })
    status: CommentStatus;

    @Prop({ type: Date, default: Date.now })
    createdAt: Date;

    @Prop({ type: Date, default: Date.now })
    updatedAt: Date;
}

export const ReportCommentSchema = SchemaFactory.createForClass(ReportComment);