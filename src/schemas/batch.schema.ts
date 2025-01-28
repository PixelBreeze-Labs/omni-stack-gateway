// src/schemas/batch.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { BatchStatus } from '../enums/batches.enum';

@Schema({ timestamps: true })
export class Batch extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Product' })
    productId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Warehouse' })
    warehouseId: string;

    @Prop({ required: true })
    batchNumber: string;

    @Prop({ required: true })
    quantity: number;

    @Prop({ required: true })
    remainingQty: number;

    @Prop({ type: String, enum: BatchStatus, default: BatchStatus.ACTIVE })
    status: BatchStatus;

    @Prop({ required: true })
    supplier: string;

    @Prop({ required: true, type: Date })
    received: Date;

    @Prop({ required: true, type: Date })
    expiryDate: Date;

    @Prop()
    sku: string;

    @Prop({ type: Number })
    unitCost: number;

    @Prop({ type: Number })
    totalCost: number;

    @Prop()
    notes: string;
}

export const BatchSchema = SchemaFactory.createForClass(Batch);