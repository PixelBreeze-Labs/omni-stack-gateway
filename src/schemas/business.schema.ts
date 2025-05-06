// src/schemas/business.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Currency } from '../enums/currency.enum';

export enum AgentFeatureFlag {
    AUTO_ASSIGNMENT_AGENT = 'auto_assignment_agent',
    COMPLIANCE_MONITORING_AGENT = 'compliance_monitoring_agent',
    REPORT_GENERATION_AGENT = 'report_generation_agent',
    CLIENT_COMMUNICATION_AGENT = 'client_communication_agent',
    RESOURCE_REQUEST_AGENT = 'resource_request_agent',
    SHIFT_OPTIMIZATION_AGENT = 'shift_optimization_agent'
}

export enum BusinessType {
    // Companies
    CORPORATION = 'corporation',
    PRIVATE_COMPANY = 'private_company',
    PUBLIC_COMPANY = 'public_company',
    LLC = 'llc',

    // Partnerships
    PARTNERSHIP = 'partnership',
    LIMITED_PARTNERSHIP = 'limited_partnership',
    GENERAL_PARTNERSHIP = 'general_partnership',

    // Individual Ownership
    SOLE_PROPRIETORSHIP = 'sole_proprietorship',
    SOLO_OWNERSHIP = 'solo_ownership',
    FREELANCER = 'freelancer',

    // Special Types
    STARTUP = 'startup',
    NONPROFIT = 'nonprofit',
    COOPERATIVE = 'cooperative',

    // Regional Types
    PLC = 'plc',                    // Public Limited Company (UK)
    LTD = 'ltd',                    // Limited Company (UK)
    GMBH = 'gmbh',                  // German Company Type
    SARL = 'sarl',                  // French Company Type

    // Other Categories
    FRANCHISE = 'franchise',
    FAMILY_BUSINESS = 'family_business',
    JOINT_VENTURE = 'joint_venture',
    OTHER = 'other'
}

export enum SubscriptionStatus {
    ACTIVE = 'active',
    PAST_DUE = 'past_due',
    CANCELED = 'canceled',
    INCOMPLETE = 'incomplete',
    TRIALING = 'trialing'
}

@Schema({ timestamps: true })
export class Business extends Document {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
    adminUserId: string;

    @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }] })
    userIds: string[];

    @Prop({
        type: String,
        enum: BusinessType,
        required: true
    })
    type: BusinessType;

    @Prop({ required: true })
    email: string;

    @Prop()
    phone?: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Address' })
    addressId?: string;

    @Prop({ type: String, enum: Currency, default: Currency.USD })
    currency: Currency;

    // Stripe Related Fields
    @Prop()
    stripeCustomerId?: string;

    @Prop()
    stripeSubscriptionId?: string;

    @Prop({
        type: String,
        enum: SubscriptionStatus,
        default: SubscriptionStatus.INCOMPLETE
    })
    subscriptionStatus: SubscriptionStatus;

    @Prop({ type: Date })
    subscriptionEndDate?: Date;

    @Prop({ type: MongooseSchema.Types.Mixed })
    subscriptionDetails?: {
        planId: string;
        priceId: string;
        interval: 'month' | 'year';
        amount: number;
        currency: Currency;
    };

    @Prop({ type: [String], enum: Object.values(AgentFeatureFlag), default: [] })
    includedFeatures: AgentFeatureFlag[];

    // Employee capability flags
    @Prop({ type: Boolean, default: true })
    allow_clockinout: boolean;

    @Prop({ type: Boolean, default: true })
    has_app_access: boolean;

    @Prop({ type: Boolean, default: true })
    allow_checkin: boolean;

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ type: Map, of: String, default: {} })
    metadata: Map<string, any>;

    // For VAT/Tax purposes
    @Prop()
    taxId?: string;

    @Prop()
    vatNumber?: string;

    // Soft delete fields
    @Prop({ default: false })
    isDeleted: boolean;

    @Prop({ type: Date })
    deletedAt?: Date;
}

export const BusinessSchema = SchemaFactory.createForClass(Business);

// Add indexes
BusinessSchema.index({ clientId: 1 });
BusinessSchema.index({ adminUserId: 1 });
BusinessSchema.index({ stripeCustomerId: 1 });
BusinessSchema.index({ subscriptionStatus: 1 });

BusinessSchema.virtual('address', {
    ref: 'Address',
    localField: 'addressId',
    foreignField: '_id',
    justOne: true
});