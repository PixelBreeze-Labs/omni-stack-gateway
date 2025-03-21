// src/schemas/notification.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum NotificationType {
    REPORT_STATUS_CHANGE = 'report_status_change',
    REPORT_COMMENT = 'report_comment'
}

@Schema()
export class Notification extends Document {
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
    userId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Report' })
    reportId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', required: true })
    clientId: string;

    @Prop({
        required: true,
        enum: Object.values(NotificationType),
    })
    type: NotificationType;

    @Prop({ required: true })
    title: string;

    @Prop({ required: true })
    message: string;

    @Prop({ type: Boolean, default: false })
    read: boolean;

    @Prop({ type: Object, default: {} })
    data: Record<string, any>;

    @Prop({ type: Date, default: Date.now })
    createdAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);