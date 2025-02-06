// src/schemas/client.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Currency } from '../enums/currency.enum';
import { LoyaltyProgram, LoyaltyProgramSchema } from './loyalty-program.schema';

@Schema({ timestamps: true })
export class Client extends Document {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    code: string;

    @Prop({ required: true, type: [{ type: MongooseSchema.Types.ObjectId, ref: 'ClientApp' }] })
    clientAppIds: string[];

    @Prop()
    externalId?: string;

    @Prop({ type: String, enum: Currency, default: Currency.USD })
    defaultCurrency: Currency;

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ required: true, unique: true, select: false })
    apiKey: string;

    // Embed loyalty program configuration
    @Prop({ type: LoyaltyProgramSchema, default: {} })
    loyaltyProgram: LoyaltyProgram;

    @Prop({
        type: {
            venueShortCode: { type: String, unique: true, sparse: true },
            connectedAt: { type: Date },
            disconnectedAt: { type: Date },
            status: { type: String, enum: ['connected', 'disconnected'] },
            webhookApiKey: { type: String, select: false }
        },
        _id: false
    })
    venueBoostConnection?: {
        venueShortCode: string;
        connectedAt: Date;
        disconnectedAt?: Date;
        status: 'connected' | 'disconnected';
        webhookApiKey: string;
    };
}

export const ClientSchema = SchemaFactory.createForClass(Client);
