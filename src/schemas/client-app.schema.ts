// src/schemas/client-app.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class ClientApp extends Document {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true, enum: ['wordpress', 'react', 'vue', 'other'] })
    type: string;

    @Prop({ required: true, unique: true })
    apiKey: string;

    @Prop({ type: [String], required: true })
    domain: string[];

    @Prop({ required: true })
    configuredAt: Date;

    @Prop({ required: true, enum: ['active', 'inactive'], default: 'active' })
    status: string;
}

export const ClientAppSchema = SchemaFactory.createForClass(ClientApp);