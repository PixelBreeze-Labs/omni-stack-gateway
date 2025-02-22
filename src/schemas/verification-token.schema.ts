// src/schemas/verification-token.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class VerificationToken extends Document {
    @Prop({ required: true, ref: 'User' })
    userId: MongooseSchema.Types.ObjectId;

    @Prop({ required: true })
    token: string;

    @Prop({ required: true })
    expiresAt: Date;
}

export const VerificationTokenSchema = SchemaFactory.createForClass(VerificationToken);
VerificationTokenSchema.index({ token: 1 });
VerificationTokenSchema.index({ userId: 1 });
VerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
