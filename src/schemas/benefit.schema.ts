// schemas/benefit.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type BenefitType = 'DISCOUNT' | 'CASHBACK' | 'POINTS' | 'FREE_SHIPPING';

@Schema({ timestamps: true })
export class Benefit extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: MongooseSchema.Types.ObjectId;

    @Prop({ required: true })
    name: string;

    @Prop()
    description: string;

    @Prop({ type: String, enum: ['DISCOUNT', 'CASHBACK', 'POINTS', 'FREE_SHIPPING'] })
    type: BenefitType;

    @Prop({ type: Number, required: true })
    value: number;

    @Prop({ type: Boolean, default: true })
    isActive: boolean;

    @Prop({ type: [String], default: [] })
    applicableTiers: string[];

    @Prop({})
    minSpend?: number;
}

export const BenefitSchema = SchemaFactory.createForClass(Benefit);