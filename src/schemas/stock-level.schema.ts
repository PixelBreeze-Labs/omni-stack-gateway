// src/schemas/stock-level.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class StockLevel extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Warehouse' })
    warehouseId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Product' })
    productId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ default: 0 })
    currentStock: number;

    @Prop({ default: 0 })
    committedStock: number;

    @Prop({ default: 0 })
    availableStock: number;

    @Prop({ default: 0 })
    minimumStock: number;

    @Prop({ default: 0 })
    maximumStock: number;

    @Prop({ default: 0 })
    reorderPoint: number;

    @Prop()
    lastCountDate?: Date;

    @Prop()
    lastMovementDate?: Date;

    @Prop({ type: Object })
    location?: {
        zone?: string;
        aisle?: string;
        rack?: string;
        shelf?: string;
        bin?: string;
    };
}

export const StockLevelSchema = SchemaFactory.createForClass(StockLevel);