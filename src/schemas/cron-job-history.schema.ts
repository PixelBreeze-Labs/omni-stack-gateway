// src/schemas/cron-job-history.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class CronJobHistory extends Document {
    @Prop({ required: true })
    jobName: string;
    
    @Prop({ required: true })
    startTime: Date;
    
    @Prop()
    endTime?: Date;
    
    @Prop()
    duration?: number; // in seconds
    
    @Prop({ type: String, enum: ['started', 'completed', 'failed'] })
    status: 'started' | 'completed' | 'failed';
    
    @Prop()
    error?: string;
    
    @Prop({ type: MongooseSchema.Types.Mixed })
    details?: Record<string, any>;
    
    @Prop()
    businessId?: string;
    
    @Prop({ type: [String] })
    businessIds?: string[];
    
    @Prop()
    targetCount?: number; // Number of items found for processing
    
    @Prop()
    processedCount?: number; // Number of items successfully processed
    
    @Prop()
    failedCount?: number; // Number of items that failed processing
    
    @Prop({ type: MongooseSchema.Types.Mixed })
    syncSummary?: {
        added: number;
        updated: number;
        skipped: number;
        failed: number;
    };
}

export const CronJobHistorySchema = SchemaFactory.createForClass(CronJobHistory);