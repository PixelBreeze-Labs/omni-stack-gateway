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

    @Prop({
        type: {
            form: {
                title: { type: String, required: true },
                subtitle: { type: String, required: true },
                nameInput: {
                    placeholder: { type: String, required: true },
                    required: { type: Boolean, default: false }
                },
                messageInput: {
                    placeholder: { type: String, required: true },
                    required: { type: Boolean, default: true }
                },
                submitButton: {
                    text: { type: String, required: true },
                    backgroundColor: { type: String, required: true },
                    textColor: { type: String, required: true },
                    iconColor: { type: String, required: true }
                }
            },
            email: {
                recipients: { type: [String], required: true },
                fromName: { type: String, required: true },
                fromEmail: { type: String, required: true },
                subject: { type: String, required: true },
                template: { type: String }
            }
        },
        required: true,
        _id: false
    })
    reportConfig: {
        form: {
            title: string;
            subtitle: string;
            nameInput: {
                placeholder: string;
                required: boolean;
            };
            messageInput: {
                placeholder: string;
                required: boolean;
            };
            submitButton: {
                text: string;
                backgroundColor: string;
                textColor: string;
                iconColor: string;
            };
        };
        email: {
            recipients: string[];
            fromName: string;
            fromEmail: string;
            subject: string;
            template?: string;
        };
    };
}

export const ClientAppSchema = SchemaFactory.createForClass(ClientApp);