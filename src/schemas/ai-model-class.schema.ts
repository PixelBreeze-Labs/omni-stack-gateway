// src/schemas/ai-model-class.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class AiModelClass extends Document {
    @Prop({ required: true })
    name: string;

    @Prop()
    image: string;

    @Prop()
    description: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'AiModel', required: true })
    modelId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', required: true })
    clientId: string;

    @Prop({ type: Object, default: {} })
    metadata: Record<string, any>;

    @Prop({ default: true })
    isActive: boolean;
}

export const AiModelClassSchema = SchemaFactory.createForClass(AiModelClass);

// Add indexes
AiModelClassSchema.index({ modelId: 1 });
AiModelClassSchema.index({ clientId: 1 });
AiModelClassSchema.index({ name: 1, modelId: 1 });