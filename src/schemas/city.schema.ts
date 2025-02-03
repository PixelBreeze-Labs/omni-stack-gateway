// src/schemas/city.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class City extends Document {
    @Prop({ required: true })
    name: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'State', required: true })
    stateId: string;

    @Prop({ required: true })
    geonameId: number;
}

export const CitySchema = SchemaFactory.createForClass(City);