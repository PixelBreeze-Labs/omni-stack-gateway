import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import {Brand} from "./brand.schema";

@Schema({ timestamps: true })
export class BrandApiConfig extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Brand' })
    brandId: string;

    @Prop({ required: true })
    apiKey: string;

    @Prop({ required: true })
    baseUrl: string;

    @Prop({ type: Map, of: String })
    endpoints: Map<string, string>;

    @Prop({ type: Object })
    headers: Record<string, string>;

    @Prop()
    refreshToken?: string;

    @Prop()
    tokenExpiresAt?: Date;
}

export const BrandApiConfigSchema = SchemaFactory.createForClass(BrandApiConfig);