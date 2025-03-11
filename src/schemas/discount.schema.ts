// src/schemas/discount.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum DiscountType {
    FIXED = 'fixed',
    PERCENTAGE = 'percentage'
}

@Schema({ timestamps: true })
export class Discount extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Promotion', required: false })
    promotionId?: string;

    @Prop({
        type: String,
        enum: DiscountType,
        required: true
    })
    type: DiscountType;

    @Prop({ required: true, type: Number })
    value: number;

    @Prop({ type: Boolean, default: true })
    status: boolean;

    @Prop({ type: Date, required: true })
    startTime: Date;

    @Prop({ type: Date, required: true })
    endTime: Date;

    @Prop({ type: Number, default: 0 })
    reservationCount: number;

    @Prop({ type: String, required: false })
    productId?: string;

    @Prop({ type: String, required: false })
    rentalUnitId?: string;

    @Prop({ type: String, required: false })
    categoryId?: string;

    @Prop({ type: String, required: false })
    productIds?: string;

    @Prop({ type: Object, default: {} })
    externalIds: {
        venueBoostId?: string;
        [key: string]: string;
    };

    @Prop({ type: Map, of: MongooseSchema.Types.Mixed, default: {} })
    metadata: Map<string, any>;
}

export const DiscountSchema = SchemaFactory.createForClass(Discount);

// Indexes
DiscountSchema.index({ clientId: 1 });
DiscountSchema.index({ status: 1 });
DiscountSchema.index({ 'externalIds.venueBoostId': 1 });
DiscountSchema.index({ promotionId: 1 });