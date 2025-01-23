// src/schemas/warehouse-location.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import {Warehouse} from "./warehouse.schema";

@Schema({ timestamps: true })
export class WarehouseLocation {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Warehouse' })
    warehouseId: string;

    @Prop({ required: true })
    code: string;

    @Prop()
    description?: string;

    @Prop()
    capacity?: number;
}

export const WarehouseLocationSchema = SchemaFactory.createForClass(WarehouseLocation);
