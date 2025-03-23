// src/schemas/detection-result.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

// Interface for coordinates
interface Coordinates {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
}

// Interface for a single prediction
interface Prediction {
    class_title: string;
    model_id: number;
    score: number;
    coordinates: Coordinates;
    track_id?: string;
    id?: string;
    index?: number;
}

@Schema({ timestamps: true })
export class DetectionResult extends Document {
    @Prop({ required: true })
    prediction_type: string;

    @Prop({ required: true })
    status: string;

    @Prop({ type: MongooseSchema.Types.Mixed })
    output_data: any;

    @Prop({ type: [Object], required: true })
    predictions: Prediction[];

    @Prop()
    image_meta: string;

    @Prop()
    image_url: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'AiModel' })
    modelId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', required: true })
    clientId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Camera', required: false })
    cameraId: string;

    @Prop({ type: Date, default: Date.now })
    detectionTime: Date;

    @Prop({ type: Object, default: {} })
    metadata: Record<string, any>;
}

export const DetectionResultSchema = SchemaFactory.createForClass(DetectionResult);

// Add indexes
DetectionResultSchema.index({ modelId: 1 });
DetectionResultSchema.index({ clientId: 1 });
DetectionResultSchema.index({ cameraId: 1 });
DetectionResultSchema.index({ detectionTime: 1 });
DetectionResultSchema.index({ 'predictions.class_title': 1 });