// src/schemas/cron-job-history.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class CronJobHistory extends Document {
    @Prop({ required: true })
    jobName: string;
    
    @Prop({ required: true })
    startTime: Date;
    
    @Prop()
    endTime?: Date;
    
    @Prop()
    duration?: number;
    
    @Prop({ type: String, enum: ['started', 'completed', 'failed'] })
    status: 'started' | 'completed' | 'failed';
    
    @Prop()
    error?: string;
    
    @Prop({ type: Object })
    details?: Record<string, any>;
}

export const CronJobHistorySchema = SchemaFactory.createForClass(CronJobHistory);