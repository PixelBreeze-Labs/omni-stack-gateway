// src/schemas/report.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ReportTag } from './report-tag.schema';

export enum ReportStatus {
    PENDING= 'pending',
    PENDING_REVIEW = 'pending_review',
    REJECTED = 'rejected',
    ACTIVE = 'active',
    IN_PROGRESS = 'in_progress',
    RESOLVED = 'resolved',
    CLOSED = 'closed',
    NO_RESOLUTION = 'no_resolution'
}

@Schema()
export class FileAttachment {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    type: string;

    @Prop({ required: true })
    url: string;

    @Prop()
    size: number;
}

@Schema()
export class Location {
    @Prop({ type: Number })
    lat: number;

    @Prop({ type: Number })
    lng: number;

    @Prop({ type: Number })
    accuracy?: number;
}

@Schema()
export class Report extends Document {
    @Prop({ type: Object, required: false })
    clientApp?: {
        id: string;
        type: string;
        domain: string;
        version: string;
    };

    @Prop({ type: Object, required: true })
    content: {
        message: string;
        name?: string;
        files?: FileAttachment[];
    };

    @Prop({ type: Object, required: true })
    metadata: {
        timestamp: Date;
        ipHash: string;
        userAgent: string;
    };

    @Prop({
        required: true,
        enum: Object.values(ReportStatus),
        default: ReportStatus.PENDING_REVIEW
    })
    status: string;

    // Additional fields for community reports
    @Prop()
    title?: string;

    @Prop({ type: String })
    category?: string;

    @Prop({ type: Boolean, default: false })
    isAnonymous?: boolean;

    @Prop({ type: Boolean, default: false })
    isFeatured?: boolean;

    @Prop({ type: String, required: false })
    customAuthorName?: string;

    @Prop({ type: Boolean, default: true })
    visibleOnWeb?: boolean;

    @Prop({ type: Location })
    location?: Location;

    @Prop({ type: String })
    authorId?: string;

    @Prop({ type: [String] })
    media?: string[];

    @Prop({ type: String })
    audio?: string;

    // String-based tags (deprecated but kept for backward compatibility)
    @Prop({ type: [String], required: false, default: [] })
    tags?: string[];

    // Reference to ReportTag documents
    @Prop({
        type: [{ type: MongooseSchema.Types.ObjectId, ref: 'ReportTag' }],
        default: []
    })
    reportTags?: ReportTag[] | string[];

    @Prop({ type: Date })
    createdAt?: Date;

    @Prop({ type: Date })
    updatedAt?: Date;

    @Prop({ type: Boolean, default: false })
    isCommunityReport?: boolean;

    @Prop({ type: Boolean, default: false })
    isFromChatbot?: boolean;  // New field to track if report was created via chatbot

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', required: false })
    clientId?: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false })
    userId?: string;
}

export const ReportSchema = SchemaFactory.createForClass(Report);

// Add index for geolocation queries
ReportSchema.index({ location: '2dsphere' });

// Add index for reportTags for faster lookups
ReportSchema.index({ reportTags: 1 });