// src/schemas/warehouse.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class Warehouse {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    code: string;

    @Prop({ required: true })
    clientId: string;

    @Prop()
    address?: string;

    @Prop({ default: true })
    isActive: boolean;
}

export const WarehouseSchema = SchemaFactory.createForClass(Warehouse);