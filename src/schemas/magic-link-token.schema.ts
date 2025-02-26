import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class MagicLinkToken extends Document {
    @Prop({ required: true })
    userId: string;

    @Prop({ required: true })
    token: string;

    @Prop({ required: true })
    expiresAt: Date;

    @Prop({ default: false })
    used: boolean;
}

export const MagicLinkTokenSchema = SchemaFactory.createForClass(MagicLinkToken);