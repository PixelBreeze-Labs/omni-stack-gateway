// src/schemas/operation-item.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class OperationItem extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Operation' })
    operationId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Product' })
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

export const OperationItemSchema = SchemaFactory.createForClass(OperationItem);