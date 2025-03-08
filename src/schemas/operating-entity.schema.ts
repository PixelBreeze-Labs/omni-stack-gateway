// src/schemas/operating-entity.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum OperatingEntityType {
    SOCIAL_MEDIA_PLATFORM = 'SOCIAL_MEDIA_PLATFORM',
    MARKETING = 'MARKETING',
    NEWS_PORTAL = 'NEWS_PORTAL',
    OTHER = 'OTHER'
}

@Schema({ timestamps: true })
export class OperatingEntity extends Document {
    @Prop({ required: true, trim: true })
    name: string;

    @Prop({
        required: true,
        enum: OperatingEntityType,
        default: OperatingEntityType.OTHER
    })
    type: string;

    @Prop({ trim: true })
    url: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: MongooseSchema.Types.ObjectId;
}

export const OperatingEntitySchema = SchemaFactory.createForClass(OperatingEntity);