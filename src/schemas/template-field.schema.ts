// src/schemas/template-field.schema.ts
import {Prop, Schema, SchemaFactory} from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema } from 'mongoose';
import {ImportTemplate} from "./template.schema";

@Schema({ timestamps: true })
export class TemplateField extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'ImportTemplate' })
    templateId: string;

    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    label: string;

    @Prop({ required: true, enum: ['string', 'number', 'boolean', 'date', 'object'] })
    type: string;

    @Prop({ default: false })
    required: boolean;

    @Prop({ type: Object })
    validation: {
        type: string;
        pattern?: string;
        min?: number;
        max?: number;
        options?: string[];
    };

    @Prop({ type: String })
    mapping: string;
}
export const TemplateFieldSchema = SchemaFactory.createForClass(TemplateField);
