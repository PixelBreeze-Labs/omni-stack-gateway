// src/schemas/customer.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { User } from './user.schema';

@Schema({ timestamps: true })
export class Customer extends Document {
    // Optional reference to the User (foreign key)
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: false })
    userId?: string;

    @Prop({ required: true })
    firstName: string;

    @Prop({ required: true })
    lastName: string;

    @Prop({ required: true, unique: true })
    email: string;

    @Prop()
    phone?: string;

    @Prop({ required: true, default: 'ACTIVE', enum: ['ACTIVE', 'INACTIVE'] })
    status: string;

    @Prop({ required: true, enum: ['REGULAR', 'VIP'] })
    type: string;

    @Prop({
        type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Client' }],
        required: true,
    })
    clientIds: string[];

    @Prop({ default: true })
    isActive: boolean;

    /**
     * external_ids: A JSON object to store various external IDs.
     * For example:
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
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
