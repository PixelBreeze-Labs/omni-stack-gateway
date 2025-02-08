import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class MetaConfig extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true })
    pixelId: string;

    @Prop({ required: true })
    accessToken: string;

    @Prop()
    testEventCode?: string;

    @Prop({ default: true })
    isActive: boolean;
}

export const MetaConfigSchema = SchemaFactory.createForClass(MetaConfig);