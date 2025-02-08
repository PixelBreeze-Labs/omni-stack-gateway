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

    @Prop({
        type: String,
        enum: ['ACTIVE', 'INACTIVE', 'PENDING'],
        default: 'ACTIVE'
    })
    status: string;

    @Prop({ required: true, enum: ['REGULAR', 'VIP'] })
    type: string;

    @Prop()
    avatar?: string;

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

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Address' })
    addressId?: string;

    @Prop({ type: MongooseSchema.Types.Mixed })
    metadata?: Record<string, any>;
}

export type CustomerDocument = Customer & Document;
export const CustomerSchema = SchemaFactory.createForClass(Customer);

CustomerSchema.index({ email: 1, clientIds: 1, isActive: 1 });
CustomerSchema.index({ addressId: 1 });


