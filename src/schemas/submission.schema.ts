// src/schemas/submission.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Client } from './client.schema';

export enum SubmissionType {
    QUOTE = 'quote',
    CONTACT = 'contact',
    OTHER = 'other'
}

@Schema({ timestamps: true })
export class Submission extends Document {
    @Prop({ required: false })
    firstName?: string;

    @Prop({ required: false })
    lastName?: string;

    @Prop({ required: false })
    email?: string;

    @Prop({ required: false })
    phone?: string;

    @Prop({ required: false })
    content?: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: Client;

    @Prop({ required: true, enum: SubmissionType })
    type: SubmissionType;

    @Prop({ type: Object, required: true })
    metadata: {
        timestamp: Date;
        ipHash: string;
        userAgent: string;
    };

    @Prop({ required: true, enum: ['pending', 'reviewed', 'archived'], default: 'pending' })
    status: string;
}

export const SubmissionSchema = SchemaFactory.createForClass(Submission);