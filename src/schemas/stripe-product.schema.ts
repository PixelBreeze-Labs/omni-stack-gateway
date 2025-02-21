// src/schemas/stripe-product.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class StripeProduct extends Document {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop()
    description?: string;

    @Prop({ required: true })
    stripeProductId: string;

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ type: Map, of: String, default: {} })
    metadata: Map<string, any>;
}

export const StripeProductSchema = SchemaFactory.createForClass(StripeProduct);