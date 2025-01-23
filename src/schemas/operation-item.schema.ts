// src/schemas/operation-item.schema.ts
import { Prop, Schema } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class OperationItem {
    @Prop({ required: true })
    operationId: string;

    @Prop({ required: true })
    productId: string;

    @Prop({ required: true })
    quantity: number;

    @Prop()
    unitCost?: number;

    @Prop()
    totalCost?: number;

    @Prop()
    notes?: string;
}