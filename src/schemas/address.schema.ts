// src/schemas/address.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Address extends Document {
    @Prop({ required: true })
    addressLine1: string;

    @Prop()
    addressLine2?: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'City', required: true })
    cityId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'State', required: true })
    stateId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Country', required: true })
    countryId: string;

    @Prop()
    postcode?: string;

    @Prop({ type: Number })
    latitude?: number;

    @Prop({ type: Number })
    longitude?: number;

    @Prop({ default: true })
    active: boolean;

    @Prop({ default: false })
    isForRetail: boolean;
}

export const AddressSchema = SchemaFactory.createForClass(Address);

// Add virtual populate for relationships
AddressSchema.virtual('city', {
    ref: 'City',
    localField: 'cityId',
    foreignField: '_id',
    justOne: true
});

AddressSchema.virtual('state', {
    ref: 'State',
    localField: 'stateId',
    foreignField: '_id',
    justOne: true
});

AddressSchema.virtual('country', {
    ref: 'Country',
    localField: 'countryId',
    foreignField: '_id',
    justOne: true
});