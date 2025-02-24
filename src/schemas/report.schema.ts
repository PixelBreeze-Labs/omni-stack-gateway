// src/schemas/report.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
class FileAttachment {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    type: string;

    @Prop({ required: true })
    url: string;

    @Prop()
    size: number;
}

@Schema()
export class Report extends Document {
    @Prop({ type: Object, required: true })
    clientApp: {
        id: string;
        type: string;
        domain: string;
        version: string;
    };

    @Prop({ type: Object, required: true })
    content: {
        message: string;
        name?: string;
        files?: FileAttachment[];
    };

    @Prop({ type: Object, required: true })
    metadata: {
        timestamp: Date;
        ipHash: string;
        userAgent: string;
    };

    @Prop({ required: true, enum: ['pending', 'reviewed', 'archived'], default: 'pending' })
    status: string;
}

export const ReportSchema = SchemaFactory.createForClass(Report);