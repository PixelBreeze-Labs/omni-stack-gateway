// src/schemas/product-variation-config.schema.ts
import {Prop, Schema, SchemaFactory} from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class ProductVariationConfig extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Product' })
    productId: string;

    @Prop({ required: true, type: [] })
    attributes: {
        name: string;
        values: string[];
    }[];

    @Prop({ type: [] })
    combinations: {
        sku: string;
        attributes: Record<string, string>;
        price?: number;
        stock?: number;
    }[];
}

export const ProductVariationConfigSchema = SchemaFactory.createForClass(ProductVariationConfig);
