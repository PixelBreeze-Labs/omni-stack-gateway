import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { User } from './user.schema';

@Schema({ timestamps: true })
export class Guest extends Document {
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false })
    userId?: User | string;

    @Prop({ required: true })
    name: string;

    @Prop()
    email?: string;

    @Prop()
    phone?: string;

    @Prop({
        type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Client' }],
        required: true,
    })
    clientIds: string[];

    @Prop({ default: true })
    isActive: boolean;

    /**
     * external_ids: A JSON object to store various external IDs.
     * Example:
     * {
     *   venueBoostId: "123"
     * }
     */
    @Prop({ type: Object, default: {} })
    external_ids: Record<string, any>;

    createdAt?: Date;
    updatedAt?: Date;
}

export type GuestDocument = Guest & Document;
export const GuestSchema = SchemaFactory.createForClass(Guest);

// Add indexes
GuestSchema.index({ email: 1 });
GuestSchema.index({ userId: 1 });
GuestSchema.index({ clientIds: 1 });  // Add index for clientIds
GuestSchema.index({ 'external_ids.venueBoostId': 1 });