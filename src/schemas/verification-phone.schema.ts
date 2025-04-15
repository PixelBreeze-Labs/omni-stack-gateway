// src/schemas/verification-phone.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type VerificationPhoneDocument = VerificationPhone & Document;

@Schema({ timestamps: true })
export class VerificationPhone {
    @Prop({ required: true })
    phoneNumber: string;

    @Prop({ required: true })
    snapfoodUserId: number;

    @Prop()
    omniStackUserId?: string;

    @Prop({ required: true })
    messageId: string;

    @Prop({ default: 'sent' })
    status: string; // 'sent', 'verified', 'expired', 'failed'

    @Prop()
    verifiedAt?: Date;

    @Prop({ required: true })
    expiresAt: Date;

    @Prop({ default: 0 })
    attempts: number;
}

export const VerificationPhoneSchema = SchemaFactory.createForClass(VerificationPhone);
VerificationPhoneSchema.index({ phoneNumber: 1, snapfoodUserId: 1 });
VerificationPhoneSchema.index({ messageId: 1 });
VerificationPhoneSchema.index({ createdAt: 1 });