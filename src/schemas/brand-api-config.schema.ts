import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class BrandApiConfig extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Brand' })
    brandId: string;

    @Prop({ required: true })
    apiKey: string;

    @Prop()
    apiSecret?: string;

    @Prop({ required: true })
    endpoint: string;

    @Prop({ type: Map, of: String, default: new Map() })
    endpoints: Map<string, string>;

    @Prop({ type: Object, default: {} })
    headers: Record<string, string>;

    @Prop()
    refreshToken?: string;

    @Prop()
    tokenExpiresAt?: Date;

    @Prop({ default: false })
    isAutoSyncEnabled: boolean;

    @Prop({ enum: ['SUCCESS', 'FAILED'], type: String })
    lastSyncStatus?: string;

    @Prop()
    lastSyncAttempt?: Date;
}

export const BrandApiConfigSchema = SchemaFactory.createForClass(BrandApiConfig);