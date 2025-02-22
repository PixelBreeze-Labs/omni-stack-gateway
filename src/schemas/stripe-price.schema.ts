// src/schemas/price.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Currency } from '../enums/currency.enum';

@Schema({ timestamps: true })
export class StripePrice extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'StripeProduct' })
    stripeProductId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true })
    stripePriceId: string;

    @Prop({ required: true })
    amount: number;

    @Prop({ type: String, enum: Currency, required: true })
    currency: Currency;

    @Prop({ required: true })
    interval: 'month' | 'year';

    @Prop({ default: 1 })
    intervalCount: number;

    @Prop()
    trialPeriodDays?: number;

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ type: Map, of: String, default: {} })
    metadata: Map<string, any>;
}

export const StripePriceSchema = SchemaFactory.createForClass(StripePrice);