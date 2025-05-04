import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class GeneratedImage extends Document {
    @Prop({ required: true })
    path: string;

    @Prop({ required: true, default: Date.now })
    generationTime: Date;

    @Prop()
    downloadTime?: Date;

    @Prop({ required: true })
    sessionId: string;

    @Prop({ required: true })
    templateType: string;

    @Prop()
    subtitle?: string;

    @Prop({ required: true, enum: ['iconstyle', 'gazetareforma', 'other'] })
    entity: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop()
    articleUrl?: string;
}

export const GeneratedImageSchema = SchemaFactory.createForClass(GeneratedImage);