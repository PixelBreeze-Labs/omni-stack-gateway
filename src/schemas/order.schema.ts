// schemas/order.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Order extends Document {
    // Core Fields
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Customer' })
    customerId: string;

    @Prop({ required: true })
    orderNumber: string;

    @Prop({ required: true })
    externalOrderId: string;  // ID from the source system

    // Financial Information
    @Prop({ required: true, type: Number })
    subtotal: number;

    @Prop({ required: true, type: Number })
    total: number;

    @Prop({ type: Number, default: 0 })
    tax: number;

    @Prop({ type: Number, default: 0 })
    discount: number;

    @Prop({ required: true })
    currency: string;

    @Prop({ type: Number })
    exchangeRate: number;

    // Status Information
    @Prop({
        required: true,
        enum: ['PENDING', 'PAID', 'REFUNDED', 'CANCELLED', 'PARTIALLY_REFUNDED'],
        default: 'PENDING'
    })
    status: string;

    @Prop({ required: true })
    paymentMethod: string;

    // Source Information
    @Prop({
        type: {
            platform: { type: String, required: true }, // e.g., 'woocommerce', 'shopify', 'custom'
            url: { type: String, required: true },
            type: { type: String, required: true },    // e.g., 'ecommerce', 'pos', 'marketplace'
            version: String,
            additionalInfo: Object
        },
        required: true
    })
    source: {
        platform: string;
        url: string;
        type: string;
        version?: string;
        additionalInfo?: Record<string, any>;
    };

    // Minimal Address Info (for accounting purposes)
    @Prop({
        type: {
            country: { type: String, required: true },
            state: String,
            city: String,
            postalCode: String
        }
    })
    billingAddress: {
        country: string;
        state?: string;
        city?: string;
        postalCode?: string;
    };

    // Timestamps handled by { timestamps: true }
    @Prop({ type: Date })
    paidAt?: Date;

    @Prop({ type: [
            {
                type: {
                    amount: Number,
                    date: Date,
                    reason: String,
                    status: String
                }
            }
        ]})
    refunds?: Array<{
        amount: number;
        date: Date;
        reason: string;
        status: string;
    }>;

    // Items
    @Prop({
        type: [{
            productId: { type: MongooseSchema.Types.ObjectId, ref: 'Product' },
            quantity: Number,
            price: Number,
            discount: Number,
            total: Number,
            metadata: Object
        }],
        required: true
    })
    items: Array<{
        productId: string;
        quantity: number;
        price: number;
        discount: number;
        total: number;
        metadata?: Record<string, any>;
    }>;

    // Additional Metadata
    @Prop({ type: Object })
    metadata?: Record<string, any>;
}

export const OrderSchema = SchemaFactory.createForClass(Order);