// src/schemas/ai-model.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class AiModel extends Document {
    @Prop({ required: true })
    name: string;

    @Prop()
    description: string;

    @Prop()
    image: string;

    @Prop({ type: Object, default: {} })
    externalIds: {
        nextJsId?: string;
        visionTrackId?: string;
        [key: string]: string;
    };

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', required: true })
    clientId: string;

    @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'AiModelClass' }] })
    classIds: string[];

    @Prop({ type: String })
    version: string;

    @Prop({ type: Object, default: {} })
    metadata: Record<string, any>;
}

export const AiModelSchema = SchemaFactory.createForClass(AiModel);

// Add indexes
AiModelSchema.index({ clientId: 1 });
AiModelSchema.index({ 'externalIds.visionTrackId': 1 });
AiModelSchema.index({ 'externalIds.nextJsId': 1 });