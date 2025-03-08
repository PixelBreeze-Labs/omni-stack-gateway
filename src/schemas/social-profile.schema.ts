// src/schemas/social-profile.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum SocialProfileType {
    FACEBOOK = 'FACEBOOK',
    INSTAGRAM = 'INSTAGRAM',
    TIKTOK = 'TIKTOK',
    TWITTER = 'TWITTER',
    LINKEDIN = 'LINKEDIN',
    YOUTUBE = 'YOUTUBE',
    OTHER = 'OTHER'
}

@Schema({ timestamps: true })
export class SocialProfile extends Document {
    @Prop({
        required: true,
        enum: SocialProfileType,
        default: SocialProfileType.OTHER
    })
    type: string;

    @Prop({ required: true, trim: true })
    accountName: string;

    @Prop({ required: true, trim: true })
    username: string;

    @Prop({ trim: true })
    url: string;

    @Prop({
        required: true,
        type: MongooseSchema.Types.ObjectId,
        ref: 'OperatingEntity'
    })
    operatingEntityId: MongooseSchema.Types.ObjectId;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: MongooseSchema.Types.ObjectId;
}

export const SocialProfileSchema = SchemaFactory.createForClass(SocialProfile);

// Add index for faster lookups by type, clientId and operatingEntityId
SocialProfileSchema.index({ type: 1, clientId: 1 });
SocialProfileSchema.index({ operatingEntityId: 1 });