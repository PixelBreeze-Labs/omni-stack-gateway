// src/schemas/report-tag.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Client } from './client.schema';

export type ReportTagDocument = ReportTag & Document;

@Schema({ timestamps: true })
export class ReportTag extends Document {
    @Prop({ required: true })
    name: string;

    @Prop()
    description?: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', required: true })
    clientId: Client;

    @Prop()
    createdAt?: Date;

    @Prop()
    updatedAt?: Date;
}

export const ReportTagSchema = SchemaFactory.createForClass(ReportTag);

// Create a compound index on name and clientId to ensure uniqueness per client
ReportTagSchema.index({ name: 1, clientId: 1 }, { unique: true });