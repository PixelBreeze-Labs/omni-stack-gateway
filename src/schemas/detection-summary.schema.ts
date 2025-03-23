// src/schemas/detection-summary.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

// Interface for class detection summary
interface ClassSummary {
    className: string;
    count: number;
    highestScore: number;
    lowestScore: number;
    averageScore: number;
    detectionIds: string[]; // References to DetectionResult ids
}

@Schema({ timestamps: true })
export class DetectionSummary extends Document {
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'AiModel', required: true })
    modelId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', required: true })
    clientId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Camera', required: false })
    cameraId: string;

    @Prop({ type: Date, required: true })
    date: Date;

    @Prop({ type: String, required: true, enum: ['hourly', 'daily', 'weekly', 'monthly'] })
    summaryType: string;

    @Prop({ type: [Object], default: [] })
    classSummaries: ClassSummary[];

    @Prop({ type: Number, default: 0 })
    totalDetections: number;

    @Prop({ type: Map, of: Number, default: {} })
    classCounts: Map<string, number>;

    @Prop({ type: Object, default: {} })
    metadata: Record<string, any>;
}

export const DetectionSummarySchema = SchemaFactory.createForClass(DetectionSummary);

// Add indexes
DetectionSummarySchema.index({ modelId: 1 });
DetectionSummarySchema.index({ clientId: 1 });
DetectionSummarySchema.index({ cameraId: 1 });
DetectionSummarySchema.index({ date: 1 });
DetectionSummarySchema.index({ summaryType: 1 });
DetectionSummarySchema.index({ clientId: 1, date: 1, summaryType: 1 });