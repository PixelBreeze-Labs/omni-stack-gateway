import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Campaign extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true })
    utmSource: string;  // e.g., 'facebook'

    @Prop({ required: true })
    utmMedium: string;  // e.g., 'cpc'

    @Prop({ required: true })
    utmCampaign: string;  // campaign name

    @Prop()
    utmContent?: string;  // ad content

    @Prop()
    utmTerm?: string;  // keywords
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);

// Create compound index for unique campaign tracking
CampaignSchema.index(
    {
        clientId: 1,
        utmSource: 1,
        utmMedium: 1,
        utmCampaign: 1,
        utmContent: 1
    },
    { unique: true }
);
