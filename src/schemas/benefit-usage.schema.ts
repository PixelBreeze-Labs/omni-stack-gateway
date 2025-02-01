// schemas/benefit-usage.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class BenefitUsage extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: MongooseSchema.Types.ObjectId;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'FamilyAccount' })
    familyAccountId: MongooseSchema.Types.ObjectId;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Customer' })
    customerId: MongooseSchema.Types.ObjectId;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Benefit' })
    benefitId: MongooseSchema.Types.ObjectId;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Order' })
    orderId: MongooseSchema.Types.ObjectId;

    @Prop({ required: true, type: Number })
    savedAmount: number;

    @Prop({ type: Date, default: Date.now })
    usedAt: Date;
}

export const BenefitUsageSchema = SchemaFactory.createForClass(BenefitUsage);