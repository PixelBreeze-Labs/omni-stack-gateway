// src/schemas/member.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Member extends Document {
    @Prop({ required: true })
    firstName: string;

    @Prop({ required: true })
    lastName: string;

    @Prop({ required: true, unique: true })
    email: string;

    @Prop({ required: true, unique: true })
    code: string;

    @Prop({ default: '-' })
    phoneNumber?: string;

    @Prop()
    birthday?: Date;

    @Prop()
    city?: string;

    @Prop()
    address?: string;

    @Prop()
    acceptedAt?: Date;

    @Prop({ default: false })
    isRejected?: boolean;

    @Prop()
    rejectedAt?: Date;

    @Prop({ type: Object })
    metadata?: Record<string, any>;

    @Prop()
    createdAt?: Date;

    @Prop()
    updatedAt?: Date;
}

export const MemberSchema = SchemaFactory.createForClass(Member);

MemberSchema.index({ code: 1 }, { unique: true });
MemberSchema.index({ email: 1 }, { unique: true });