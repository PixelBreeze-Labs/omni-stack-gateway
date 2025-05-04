import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum LogType {
    ERROR = 'ERROR',
    SUCCESS = 'SUCCESS',
    INFO = 'INFO'
}

@Schema({ timestamps: true })
export class Log extends Document {
    @Prop({ required: true, enum: LogType })
    type: LogType;

    @Prop({ required: true })
    message: string;

    @Prop({ type: MongooseSchema.Types.Mixed })
    details: any;

    @Prop({ required: true })
    sessionId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId?: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'GeneratedImage' })
    imageId?: string;

    @Prop()
    endpoint?: string;

    @Prop()
    actionType?: string;
}

export const LogSchema = SchemaFactory.createForClass(Log);