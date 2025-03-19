// src/schemas/checkin-form-config.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export interface FormField {
    name: string;
    type: 'text' | 'email' | 'tel' | 'select' | 'radio' | 'checkbox';
    label: { [key: string]: string }; // Multilingual labels
    placeholder?: { [key: string]: string }; // Multilingual placeholders
    required: boolean;
    options?: Array<{
        value: string;
        label: { [key: string]: string }; // Multilingual option labels
    }>;
    defaultValue?: any;
    validation?: string; // Validation rules as string (can be parsed to Yup schema)
}

@Schema({ timestamps: true })
export class CheckinFormConfig extends Document {
    @Prop({ required: true, unique: true })
    shortCode: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Property' })
    propertyId?: string;

    @Prop({ required: true })
    name: string;

    @Prop({ required: true, default: false })
    isActive: boolean;

    @Prop({ type: Object })
    formConfig: {
        fields: FormField[];
        sections: {
            name: string;
            title: { [key: string]: string }; // Multilingual section titles
            fields: string[]; // Field names that belong to this section
        }[];
        languages: string[]; // Available languages for the form
        defaultLanguage: string;
        submitButtonText: { [key: string]: string }; // Multilingual submit button text
    };

    @Prop({ type: Date })
    expiresAt?: Date;

    @Prop({ type: Object, default: {} })
    metadata?: Record<string, any>;
}

export const CheckinFormConfigSchema = SchemaFactory.createForClass(CheckinFormConfig);

// Indexes
CheckinFormConfigSchema.index({ shortCode: 1 }, { unique: true });
CheckinFormConfigSchema.index({ clientId: 1 });
CheckinFormConfigSchema.index({ propertyId: 1 });
CheckinFormConfigSchema.index({ isActive: 1 });