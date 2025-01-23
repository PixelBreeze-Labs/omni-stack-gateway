// src/schemas/batch.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {BatchStatus} from "./enums";

@Schema({ timestamps: true })
export class Batch {
    @Prop({ required: true })
    clientId: string;

    @Prop({ required: true })
    warehouseId: string;

    @Prop({ required: true })
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