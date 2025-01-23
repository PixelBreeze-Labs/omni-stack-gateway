// src/schemas/batch.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { BatchStatus } from '../enums/batches.enum';

@Schema({ timestamps: true })
export class Batch extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Warehouse' })
    warehouseId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Product' })
    productId: string;

    @Prop({ required: true })
    batchNumber: string;

    @Prop({ required: true })
    quantity: number;

    @Prop({ type: String, enum: BatchStatus, default: BatchStatus.ACTIVE })
    status: BatchStatus;

    @Prop()
    expiryDate?: Date;
}

export const BatchSchema = SchemaFactory.createForClass(Batch);