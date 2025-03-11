// src/schemas/general-campaign.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum CampaignType {
    SMS = 'SMS',
    EMAIL = 'Email'
}

export enum CampaignStatus {
    SCHEDULED = 'scheduled',
    SENT = 'sent',
    CANCELED = 'canceled'
}

@Schema({ timestamps: true })
export class GeneralCampaign extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Promotion', required: false })
    promotionId?: string;

    @Prop({ required: true })
    title: string;

    @Prop({ required: true })
    description: string;

    @Prop({ type: String, required: false })
    link?: string;

    @Prop({
        type: String,
        enum: CampaignType,
        required: true
    })
    type: CampaignType;

    @Prop({ type: String, required: false })
    target?: string;

    @Prop({ type: Date, required: true })
    scheduledDate: Date;

    @Prop({ type: Boolean, default: false })
    sent: boolean;

    @Prop({
        type: String,
        enum: CampaignStatus,
        default: CampaignStatus.SCHEDULED
    })
    status: CampaignStatus;

    @Prop({ type: Object, default: {} })
    externalIds: {
        venueBoostId?: string;
        [key: string]: string;
    };

    @Prop({ type: Map, of: MongooseSchema.Types.Mixed, default: {} })
    metadata: Map<string, any>;
}

export const GeneralCampaignSchema = SchemaFactory.createForClass(GeneralCampaign);

// Indexes
GeneralCampaignSchema.index({ clientId: 1 });
GeneralCampaignSchema.index({ status: 1 });
GeneralCampaignSchema.index({ sent: 1 });
GeneralCampaignSchema.index({ scheduledDate: 1 });
GeneralCampaignSchema.index({ 'externalIds.venueBoostId': 1 });
GeneralCampaignSchema.index({ promotionId: 1 });