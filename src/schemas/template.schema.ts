// src/schemas/template.schema.ts
import {Prop, Schema, SchemaFactory} from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class ImportTemplate extends Document {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true, enum: ['simple', 'variation', 'matrix'] })
    type: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ type: Object })
    mappings: {
        required: string[];
        optional: string[];
        variations?: {
            identifiers: string[];
            attributes: string[];
        }
    };

    @Prop({ type: Object })
    validations: {
        [key: string]: {
            type: string;
            rules: any[];
        }
    };

    @Prop()
    description?: string;
}

export const ImportTemplateSchema = SchemaFactory.createForClass(ImportTemplate);
