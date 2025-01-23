// src/schemas/inventory-item.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class InventoryItem extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Warehouse' })
    warehouseId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Product' })
    productId: string;

    @Prop({ default: 0 })
    quantity: number;

    @Prop()
    lastCountDate?: Date;
}

export const InventoryItemSchema = SchemaFactory.createForClass(InventoryItem);