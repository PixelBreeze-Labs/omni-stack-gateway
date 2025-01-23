// src/schemas/inventory-item.schema.ts
import { Prop, Schema } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class InventoryItem {
    @Prop({ required: true })
    warehouseId: string;

    @Prop({ required: true })
    productId: string;

    @Prop({ default: 0 })
    quantity: number;

    @Prop()
    lastCountDate?: Date;
}