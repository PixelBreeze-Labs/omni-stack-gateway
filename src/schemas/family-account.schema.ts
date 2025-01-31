// src/schemas/family-account.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class FamilyAccount extends Document {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    email: string;

    @Prop({ required: true })
    relationship: string;

    @Prop({ required: true })
    status: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ type: Number, default: 0 })
    totalPurchases: number;

    @Prop({ type: Number, default: 0 })
    loyaltyPoints: number;

    @Prop({ default: true })
    isActive: boolean;
}

export const FamilyAccountSchema = SchemaFactory.createForClass(FamilyAccount);