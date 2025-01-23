// src/schemas/warehouse.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Warehouse extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    code: string;

    @Prop()
    address?: string;

    @Prop({ default: true })
    isActive: boolean;
}

export const WarehouseSchema = SchemaFactory.createForClass(Warehouse);