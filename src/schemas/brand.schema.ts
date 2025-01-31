// src/schemas/brand.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Brand extends Document {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    code: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop()
    description?: string;


    @Prop()
    externalId?: string;

    @Prop({ default: true })
    isActive: boolean;
}

export const BrandSchema = SchemaFactory.createForClass(Brand);
