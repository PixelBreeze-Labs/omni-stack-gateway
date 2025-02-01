import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {Document, Schema as MongooseSchema} from 'mongoose';
import {User} from "./user.schema";

@Schema({ timestamps: true })
export class Member extends Document {
    // Optional reference to the User (foreign key)
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: false })
    userId?: string;

    @Prop({ required: true })
    firstName: string;

    @Prop({ required: true })
    lastName: string;

    @Prop({ required: true })
    email: string;

    @Prop({ default: '-' })
    phoneNumber: string;

    @Prop()
    birthday?: Date;

    @Prop()
    city?: string;

    @Prop()
    address?: string;

    // New unique code field for Member
    @Prop({ required: true })
    code: string;

    @Prop({ default: null })
    acceptedAt?: Date;

    @Prop({ default: false })
    isRejected: boolean;

    @Prop({ default: null })
    rejectedAt?: Date;

    /**
     * metadata: An object to store additional data.
     * For example, you can store the oldPlatformMemberCode here:
     * {
     *   oldPlatformMemberCode: "XYZ123"
     * }
     */
    @Prop({ type: Object, default: {} })
    metadata: Record<string, any>;
}

export const MemberSchema = SchemaFactory.createForClass(Member);
