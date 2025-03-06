// src/schemas/property.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum PropertyType {
    APARTMENT = 'apartment',
    HOUSE = 'house',
    VILLA = 'villa',
    CABIN = 'cabin',
    STUDIO = 'studio',
    HOTEL_ROOM = 'hotel_room',
    HOSTEL = 'hostel',
    RESORT = 'resort',
    CONDO = 'condo',
    BUNGALOW = 'bungalow',
    CHALET = 'chalet',
    COTTAGE = 'cottage',
    GUEST_HOUSE = 'guest_house',
    FARM_STAY = 'farm_stay',
    OTHER = 'other'
}

export enum PropertyStatus {
    ACTIVE = 'active',
    MAINTENANCE = 'maintenance',
    INACTIVE = 'inactive'
}

@Schema({ timestamps: true })
export class Property extends Document {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({
        type: String,
        enum: PropertyType,
        default: PropertyType.APARTMENT
    })
    type: PropertyType;

    @Prop({ default: 'EUR' })
    currency: string;

    @Prop({
        type: String,
        enum: PropertyStatus,
        default: PropertyStatus.ACTIVE
    })
    status: PropertyStatus;

    @Prop({ type: Object, default: {} })
    externalIds: {
        venueboostId?: string;
        [key: string]: string;
    };

    @Prop({ type: Map, of: String, default: {} })
    metadata: Map<string, any>;
}

export const PropertySchema = SchemaFactory.createForClass(Property);

// Basic indexes
PropertySchema.index({ clientId: 1 });
PropertySchema.index({ type: 1 });
PropertySchema.index({ status: 1 });
PropertySchema.index({ 'externalIds.venueboostId': 1 });