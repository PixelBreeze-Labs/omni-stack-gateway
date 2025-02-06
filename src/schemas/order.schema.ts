// schemas/order.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Order extends Document {
    @Prop({ required: true, unique: true })
    orderNumber: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Customer' })
    customerId: string;

    @Prop({ required: true, type: Number })
    subtotal: number;

    @Prop({ required: true, type: Number })
    total: number;

    @Prop({ type: Number, default: 0 })
    discount: number;

    @Prop({ required: true })
    currency: string;

    @Prop({ type: Number })
    exchangeRate: number;

    @Prop({
        required: true,
        enum: ['PENDING', 'PAID', 'REFUNDED', 'CANCELLED', 'PARTIALLY_REFUNDED']
    })
    status: string;

    @Prop({ required: true })
    paymentMethod: string;

    @Prop({
        type: {
            status: String,
            transactionId: String,
            paymentProviderResponse: Object
        }
    })
    payment: {
        status: string;
        transactionId?: string;
        paymentProviderResponse?: Record<string, any>;
    };

    @Prop({
        type: {
            type: { type: String, required: true }, // 'quick_checkout' or 'regular_checkout'
            platform: { type: String, required: true }, // 'bybest.shop', etc.
            url: String,
            externalOrderId: String,
            externalCustomerId: String
        },
        required: true
    })
    source: {
        type: string;
        platform: string;
        url?: string;
        externalOrderId: string;
        externalCustomerId: string;
    };

    @Prop({
        type: [{
            productId: { type: MongooseSchema.Types.ObjectId, ref: 'Product' },
            externalProductId: String,
            name: String,
            quantity: Number,
            price: Number,
            total: Number
        }],
        required: true
    })
    items: Array<{
        productId: string;
        externalProductId: string;
        name: string;
        quantity: number;
        price: number;
        total: number;
    }>;

    @Prop({ type: Object })
    metadata?: Record<string, any>;

    @Prop()
    createdAt?: Date;

    @Prop()
    updatedAt?: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);