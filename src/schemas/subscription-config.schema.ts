// src/schemas/subscription-config.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Currency } from '../enums/currency.enum';

@Schema({ _id: false })
export class SubscriptionConfig {
    // Product Configuration
    @Prop({ required: true })
    productPrefix: string;  // e.g., 'STAFFL_' for Staffluent products

    @Prop({ type: String, enum: Currency, default: Currency.USD })
    defaultCurrency: Currency;

    // Webhook Configuration
    @Prop({
        type: {
            endpoint: { type: String },
            secret: { type: String, select: false },
            enabled: { type: Boolean, default: true },
            events: [{ type: String }]  // List of Stripe events to listen for
        },
        _id: false
    })
    webhook: {
        endpoint: string;
        secret: string;
        enabled: boolean;
        events: string[];
    };

    // Stripe Account Configuration
    @Prop({
        type: {
            accountId: { type: String },
            publicKey: { type: String },
            secretKey: { type: String, select: false }
        },
        _id: false
    })
    stripeAccount: {
        accountId: string;
        publicKey: string;
        secretKey: string;
    };

    // Trial Configuration
    @Prop({
        type: {
            enabled: { type: Boolean, default: true },
            durationDays: { type: Number, default: 14 }
        },
        _id: false
    })
    trial: {
        enabled: boolean;
        durationDays: number;
    };

    // Invoice Settings
    @Prop({
        type: {
            generateInvoice: { type: Boolean, default: true },
            daysUntilDue: { type: Number, default: 30 },
            footer: { type: String }
        },
        _id: false
    })
    invoiceSettings: {
        generateInvoice: boolean;
        daysUntilDue: number;
        footer?: string;
    };
}

export const SubscriptionConfigSchema = SchemaFactory.createForClass(SubscriptionConfig);
