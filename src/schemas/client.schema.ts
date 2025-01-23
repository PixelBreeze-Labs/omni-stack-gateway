// src/schemas/client.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Currency } from '../enums';

@Schema({ timestamps: true })
export class Client extends Document {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    code: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'ClientApp' })
    clientAppId: string;

    @Prop()
    externalId?: string;

    @Prop({ type: String, enum: Currency, default: Currency.USD })
    defaultCurrency: Currency;

    @Prop({ default: true })
    isActive: boolean;
}

export const ClientSchema = SchemaFactory.createForClass(Client);