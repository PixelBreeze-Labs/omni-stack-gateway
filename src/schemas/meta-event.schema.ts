import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class MetaEvent extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true, enum: ['AddToCart', 'Purchase'] })
    eventName: 'AddToCart' | 'Purchase';

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Order', index: true })
    orderId?: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', index: true })
    productId?: string;

    // Store the external IDs for easy lookup
    @Prop()
    externalOrderId?: string;  // From Order.source.externalOrderId

    @Prop({ type: [String] })
    externalProductIds?: string[];  // From Order.items[].externalProductId

    @Prop({ type: Object })
    eventData: {
        value?: number;
        currency?: string;
        contentType?: string;
        contentIds?: string[];
        contents?: Array<{
            id: string;
            quantity: number;
            item_price?: number;
        }>;
        campaign_id?: string;
        campaign_name?: string;
        ad_set_id?: string;
        ad_set_name?: string;
        ad_id?: string;
        ad_name?: string;
    };

    @Prop({ type: Object })
    metaResponse?: {
        success: boolean;
        eventId?: string;
        message?: string;
        timestamp: Date;
    };
}

export const MetaEventSchema = SchemaFactory.createForClass(MetaEvent);