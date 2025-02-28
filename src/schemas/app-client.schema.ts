// src/schemas/app-client.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum ClientType {
    INDIVIDUAL = 'individual',
    COMPANY = 'company',
    ORGANIZATION = 'organization',
    HOMEOWNER = 'homeowner',
    CONTRACTOR = 'contractor',
    SAAS = 'saas', // For SAAS clients
    OTHER = 'other',
}

@Schema({ timestamps: true })
export class AppClient extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true })
    name: string;

    @Prop({
        type: String,
        enum: ClientType,
        default: ClientType.INDIVIDUAL
    })
    type: ClientType;

    @Prop()
    contact_person?: string;

    @Prop()
    email?: string;

    @Prop()
    phone?: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Address' })
    address_id?: string;

    @Prop()
    notes?: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
    user_id?: string;

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

    @Prop({ default: true })
    is_active: boolean;

    @Prop({ type: Map, of: String, default: {} })
    metadata: Map<string, any>;
}

export const AppClientSchema = SchemaFactory.createForClass(AppClient);

// Add indexes for commonly queried fields
AppClientSchema.index({ name: 1 });
AppClientSchema.index({ type: 1 });
AppClientSchema.index({ user_id: 1 });
AppClientSchema.index({ email: 1 });