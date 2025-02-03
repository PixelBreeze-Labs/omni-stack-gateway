// src/schemas/store.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Address } from './address.schema';
import { Client } from './client.schema';

@Schema({
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
})
export class Store extends Document {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    code: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', required: true })
    clientId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Address' })
    addressId: string;

    @Prop({ type: Object, default: {} })
    externalIds: {
        venueboostId?: string;
        [key: string]: string;
    };

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ type: Date })
    deletedAt?: Date;
}

export const StoreSchema = SchemaFactory.createForClass(Store);

// Add virtual populate for address and client
StoreSchema.virtual('address', {
    ref: 'Address',
    localField: 'addressId',
    foreignField: '_id',
    justOne: true
});

StoreSchema.virtual('client', {
    ref: 'Client',
    localField: 'clientId',
    foreignField: '_id',
    justOne: true
});