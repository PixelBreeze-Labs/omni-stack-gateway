// schemas/family-account.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Customer } from './customer.schema';

export interface FamilyMember {
    customerId: MongooseSchema.Types.ObjectId;
    relationship: string;
    joinDate: Date;
    status: string;
}

export type FamilyAccountDocument = FamilyAccount & Document;

@Schema({ timestamps: true })
export class FamilyAccount extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: MongooseSchema.Types.ObjectId;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Customer' })
    mainCustomerId: MongooseSchema.Types.ObjectId;

    @Prop([{
        customerId: { type: MongooseSchema.Types.ObjectId, ref: 'Customer' },
        relationship: { type: String, required: true },
        joinDate: { type: Date, default: Date.now },
        status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' }
    }])
    members: FamilyMember[];

    @Prop([{ type: MongooseSchema.Types.ObjectId, ref: 'Benefit' }])
    sharedBenefits: MongooseSchema.Types.ObjectId[];

    @Prop({ type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
    status: string;

    @Prop({ type: Date, default: Date.now })
    lastActivity: Date;

    @Prop({ type: Number, default: 0 })
    totalSpent: number;

    @Prop({ type: Date, default: Date.now })
    createdAt: Date;

    @Prop({ type: Date, default: Date.now })
    updatedAt: Date;
}

export const FamilyAccountSchema = SchemaFactory.createForClass(FamilyAccount);