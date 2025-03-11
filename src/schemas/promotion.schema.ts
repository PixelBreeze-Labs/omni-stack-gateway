// src/schemas/promotion.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Promotion extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true })
    title: string;

    @Prop({ required: true })
    description: string;

    @Prop({ required: true, enum: ['discount', 'coupon'] })
    type: string;

    @Prop({ type: Boolean, default: true })
    status: boolean;

    @Prop({ type: Date, required: false })
    startTime?: Date;

    @Prop({ type: Date, required: false })
    endTime?: Date;

    @Prop({ type: Object, default: {} })
    externalIds: {
        venueBoostId?: string;
        [key: string]: string;
    };

    @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Discount' }] })
    discountIds?: string[];

    @Prop({ type: Map, of: MongooseSchema.Types.Mixed, default: {} })
    metadata: Map<string, any>;
}

export const PromotionSchema = SchemaFactory.createForClass(Promotion);

// Indexes
PromotionSchema.index({ clientId: 1 });
PromotionSchema.index({ status: 1 });
PromotionSchema.index({ 'externalIds.venueBoostId': 1 });