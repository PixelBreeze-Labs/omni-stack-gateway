// src/schemas/checkin-submission.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum SubmissionStatus {
    PENDING = 'pending',
    COMPLETED = 'completed',
    VERIFIED = 'verified',
    REJECTED = 'rejected',
}

@Schema({ timestamps: true })
export class CheckinSubmission extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'CheckinFormConfig' })
    formConfigId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Property' })
    propertyId?: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Guest' })
    guestId?: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Booking' })
    bookingId?: string;

    @Prop({ type: Object, required: true })
    formData: Record<string, any>; // Dynamic form data based on the form configuration

    // Basic fields that will always be present, for easier querying
    @Prop({ required: true })
    firstName: string;

    @Prop({ required: true })
    lastName: string;

    @Prop({ required: true })
    email: string;

    @Prop()
    phoneNumber?: string;

    @Prop({
        type: String,
        enum: Object.values(SubmissionStatus),
        default: SubmissionStatus.PENDING,
    })
    status: SubmissionStatus;

    @Prop()
    verifiedAt?: Date;

    @Prop()
    verifiedBy?: string;

    @Prop({ type: Object })
    verificationData?: Record<string, any>;

    @Prop({ type: [String], default: [] })
    attachmentUrls: string[];

    @Prop({ type: Boolean, default: false })
    needsParkingSpot: boolean;

    @Prop()
    expectedArrivalTime?: string;

    @Prop({ type: [String], default: [] })
    specialRequests: string[];

    @Prop({ type: Object, default: {} })
    metadata?: Record<string, any>;
}

export const CheckinSubmissionSchema = SchemaFactory.createForClass(CheckinSubmission);

// Indexes
CheckinSubmissionSchema.index({ formConfigId: 1 });
CheckinSubmissionSchema.index({ clientId: 1 });
CheckinSubmissionSchema.index({ propertyId: 1 });
CheckinSubmissionSchema.index({ guestId: 1 });
CheckinSubmissionSchema.index({ bookingId: 1 });
CheckinSubmissionSchema.index({ email: 1 });
CheckinSubmissionSchema.index({ status: 1 });
CheckinSubmissionSchema.index({ createdAt: 1 });
CheckinSubmissionSchema.index({ 'formData.idType': 1 });
CheckinSubmissionSchema.index({ needsParkingSpot: 1 });