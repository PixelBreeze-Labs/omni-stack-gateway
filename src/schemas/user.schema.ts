// src/schemas/user.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class User extends Document {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    surname: string;

    @Prop({ required: true, unique: true })
    email: string;

    @Prop({ required: true })
    password: string;

    /**
     * external_ids: A JSON object to store various external IDs.
     * Example:
     * {
     *   oldPlatformUserId: "123",
     *   bookMasterId: "456",
     *   trackMasterId: "789",
     *   supaBaseId: "abc",
     *   venueBoostId: "def"
     * }
     */
    @Prop({ type: Object, default: {} })
    external_ids: Record<string, any>;

    @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Client' }] })
    client_ids: string[];

    /**
     * metadata: Use this Map to store additional information,
     * such as oldPlatformRegistrationType and gender.
     */
    @Prop({ type: Map, of: String, default: {} })
    metadata: Map<string, any>;

    @Prop({ default: true })
    isActive: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);