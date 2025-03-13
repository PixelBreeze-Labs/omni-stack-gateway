    // src/schemas/report.schema.ts
    import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
    import { Document, Schema as MongooseSchema } from 'mongoose';

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
        @Prop({ type: Object, required: true })
        clientApp: {
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

        @Prop({ required: true, enum: ['pending', 'reviewed', 'archived', 'in_progress', 'resolved', 'closed'], default: 'pending' })
        status: string;

        // Additional fields for community reports
        @Prop()
        title?: string;

        @Prop({ type: String })
        category?: string;

        @Prop({ type: Boolean, default: false })
        isAnonymous?: boolean;

        @Prop({ type: Location })
        location?: Location;

        @Prop({ type: String })
        authorId?: string;

        @Prop({ type: [String] })
        media?: string[];

        @Prop({ type: String })
        audio?: string;

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