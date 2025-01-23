// src/schemas/product.schema.ts

import {Prop, Schema, SchemaFactory} from '@nestjs/mongoose';
import { Currency } from '../enums/currency.enum';

@Schema({ timestamps: true })
export class Product {
    @Prop({ required: true })
    clientId: string;

    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    code: string;

    @Prop()
    barcode?: string;

    @Prop()
    description?: string;

    @Prop()
    category?: string;

    @Prop({ default: 'PCS' })
    unit: string;

    @Prop({ default: 0 })
    costPrice: number;

    @Prop({ default: 0 })
    sellPrice: number;

    @Prop({ default: 0 })
    minStock: number;

    @Prop({ default: 0 })
    maxStock: number;

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ type: Map, of: Number, default: {} })
    prices: Map<Currency, number>;

    @Prop({ type: String, enum: Currency, default: Currency.USD })
    defaultCurrency: Currency;
}

export const ProductSchema = SchemaFactory.createForClass(Product);