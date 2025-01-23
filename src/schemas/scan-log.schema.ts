import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class ScanLog {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Product' })
    productId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Warehouse' })
    warehouseId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true })
    quantity: number;

    @Prop()
    locationCode?: string;

    @Prop({ required: true, enum: ['create', 'update'] })
    action: string;

    @Prop()
    note?: string;
}

export const ScanLogSchema = SchemaFactory.createForClass(ScanLog);