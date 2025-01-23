// src/schemas/inventory-adjustment.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class InventoryAdjustment {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Product' })
    productId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Warehouse' })
    warehouseId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true })
    quantity: number;

    @Prop({ required: true, enum: ['add', 'subtract', 'set'] })
    type: string;

    @Prop({ required: true })
    reason: string;
}

export const InventoryAdjustmentSchema = SchemaFactory.createForClass(InventoryAdjustment);