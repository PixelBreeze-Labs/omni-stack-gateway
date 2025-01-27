// src/schemas/stock-movement.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { StockMovementType } from '../enums/stock.enum';

@Schema({ timestamps: true })
export class StockMovement extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Warehouse' })
    warehouseId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Product' })
    productId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ type: String, enum: StockMovementType, required: true })
    type: StockMovementType;

    @Prop({ required: true })
    quantity: number;

    @Prop({ required: true })
    previousStock: number;

    @Prop({ required: true })
    newStock: number;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Operation' })
    operationId?: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Batch' })
    batchId?: string;

    @Prop()
    reference?: string;

    @Prop()
    notes?: string;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);