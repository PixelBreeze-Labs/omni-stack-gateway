import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { User } from './user.schema';

export type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';
export type CustomerType = 'REGULAR' | 'VIP';

@Schema({ timestamps: true })
export class Customer extends Document {
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false })
    userId?: User | string;

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
    status: CustomerStatus;

    @Prop({ required: true, enum: ['REGULAR', 'VIP'] })
    type: CustomerType;

    @Prop()
    avatar?: string;

    @Prop({
        type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Client' }],
        required: true,
    })
    clientIds: string[];

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ type: Object, default: {} })
    external_ids: Record<string, any>;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Address' })
    addressId?: string;

    @Prop({ type: MongooseSchema.Types.Mixed })
    metadata?: Record<string, any>;

    createdAt?: Date;
    updatedAt?: Date;
}

export type CustomerDocument = Customer & Document;
export const CustomerSchema = SchemaFactory.createForClass(Customer);

CustomerSchema.index({ email: 1, clientIds: 1, isActive: 1 });