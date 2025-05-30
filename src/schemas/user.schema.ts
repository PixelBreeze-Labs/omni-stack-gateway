// src/schemas/user.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Schema as MongooseSchema } from 'mongoose';
import { Wallet } from "./wallet.schema";

export enum RegistrationSource {
    METROSUITES = 'metrosuites',
    METROSHOP = 'metroshop',
    BOOKMASTER = 'bookmaster',
    TRACKMASTER = 'trackmaster',
    OTHER = 'other',
    MANUAL = 'manual',
    STAFFLUENT = 'staffluent',
    QYTETARET = 'qytetaret',
    SNAPFOOD = 'snapfood'
}


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

    @Prop({
        type: String,
        enum: RegistrationSource,
        required: true
    })
    registrationSource: RegistrationSource;

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

    @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Store' }] })
    storeIds: string[];

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store' })
    primaryStoreId?: string;


    @Prop({ type: Number, default: 0 })
    points: number;

    @Prop({ type: Number, default: 0 })
    totalSpend: number;

    @Prop({ type: Date })
    birthday?: Date;

    @Prop({ type: Object, default: {} })
    clientTiers: Record<string, string>;

    // Soft delete fields
    @Prop({ default: false })
    isDeleted: boolean;

    @Prop({ type: Date })
    deletedAt?: Date;

    // Referral System
    @Prop({ type: String, sparse: true })
    referralCode?: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
    referredBy?: string;

    @Prop({ type: Number, default: 5 })
    referralsRemaining: number;

    @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }] })
    referrals: string[];

    // Wallet
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Wallet' })
    walletId: string | Wallet;

    @Prop({
        type: {
            oneSignalId: { type: String },
            deviceTokens: { type: [String] },
            preferences: {
                chatNotifications: { type: Boolean, default: true },
                marketingNotifications: { type: Boolean, default: true },
                mutedChats: { type: [mongoose.Schema.Types.ObjectId], ref: 'Chat' }
            }
        },
        _id: false
    })
    notifications?: {
        oneSignalId?: string;
        deviceTokens?: string[];
        preferences?: {
            chatNotifications: boolean;
            marketingNotifications: boolean;
            mutedChats: string[];
        }
    };
}

export const UserSchema = SchemaFactory.createForClass(User);

// Add indexes
UserSchema.index({ email: 1 });
UserSchema.index({ referralCode: 1 });
UserSchema.index({ client_ids: 1 });
UserSchema.index({ isDeleted: 1 });
