// src/schemas/sync.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Sync extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true })
    type: string; // 'price' | 'stock' | 'product'

    @Prop({ required: true })
    status: string; // 'pending' | 'completed' | 'failed'

    @Prop()
    error?: string;

    @Prop({ type: Object })
    metadata?: Record<string, any>;

    @Prop()
    completedAt?: Date;

    @Prop()
    failedAt?: Date;
}

export const SyncSchema = SchemaFactory.createForClass(Sync);