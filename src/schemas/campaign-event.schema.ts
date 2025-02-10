import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class CampaignEvent extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Campaign' })
    campaignId: string;

    @Prop({ required: true, enum: ['view_product', 'add_to_cart', 'purchase'] })
    eventType: string;

    @Prop({ type: Object, default: {} })
    external_product_ids: Record<string, any>;

    @Prop({ type: Object, default: {} })
    external_order_ids: Record<string, any>;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product' })
    internalProductId?: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Order' })
    internalOrderId?: string;

    @Prop({ type: Object })
    eventData: {
        quantity?: number;
        price?: number;
        currency?: string;
        total?: number;
    };
}

export const CampaignEventSchema = SchemaFactory.createForClass(CampaignEvent);
// Add indexes for frequent queries
CampaignEventSchema.index({ clientId: 1, campaignId: 1, eventType: 1 });
CampaignEventSchema.index({ clientId: 1, externalProductId: 1 });
CampaignEventSchema.index({ clientId: 1, externalOrderId: 1 });