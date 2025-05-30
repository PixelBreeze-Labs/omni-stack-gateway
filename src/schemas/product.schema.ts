// src/schemas/product.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Currency } from '../enums/currency.enum';

@Schema({ timestamps: true })
export class Product extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    code: string;

    @Prop()
    barcode?: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Brand' })
    brandId?: string;

    @Prop()
    externalId?: string;

    @Prop({ type: Map, of: Number, default: {} })
    prices: Map<Currency, number>;

    @Prop({ type: String, enum: Currency, default: Currency.USD })
    defaultCurrency: Currency;

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ default: 0 })
    initialStock: number;

    // Optional: Add import metadata
    @Prop()
    importedAt?: Date;

    @Prop()
    importBatchId?: string;

    @Prop()
    lastScannedAt?: Date;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Warehouse' })
    lastScannedWarehouse?: string;

    @Prop()
    locationCode?: string;

    @Prop({ type: String })
    imagePath?: string;

    @Prop({ type: String })
    imageThumbnailPath?: string;

    @Prop({ type: [String] })
    gallery?: string[];

    @Prop({ type: Number }) // Make sure it's a Number
    costPrice?: number; // The '?' means it might not always be there

    @Prop({ type: Object })
    imageMetadata?: {
        width: number;
        height: number;
        format: string;
        size: number;
    };
}

export const ProductSchema = SchemaFactory.createForClass(Product);