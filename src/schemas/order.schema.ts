// schemas/order.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

class PaymentDetails {
    @Prop()
    status: string;

    @Prop()
    transactionId?: string;

    @Prop({ type: Object })
    paymentProviderResponse?: Record<string, any>;
}

class SourceDetails {
    @Prop()
    type: string;

    @Prop()
    platform: string;

    @Prop()
    url?: string;

    @Prop()
    externalOrderId: string;

    @Prop()
    externalCustomerId: string;

    @Prop()
    externalCustomerEmail?: string;
}

class OrderItem {
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product' })
    productId?: string;

    @Prop()
    externalProductId: string;

    @Prop()
    name: string;

    @Prop()
    quantity: number;

    @Prop()
    price: number;

    @Prop()
    total: number;
}

@Schema({ timestamps: true })
export class Order extends Document {
    @Prop({ required: true })
    orderNumber: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: false, type: MongooseSchema.Types.ObjectId, ref: 'Customer' })
    customerId?: string;

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

    @Prop({ type: PaymentDetails })
    payment: PaymentDetails;

    @Prop({ type: SourceDetails, required: true })
    source: SourceDetails;

    @Prop({ type: [OrderItem], required: true })
    items: OrderItem[];

    @Prop({ type: Object })
    metadata?: Record<string, any>;

    @Prop()
    createdAt?: Date;

    @Prop()
    updatedAt?: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

// Add compound index for unique order number per client
OrderSchema.index({ orderNumber: 1, clientId: 1 }, { unique: true });