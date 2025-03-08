import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum BookingStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    CONFIRMED = 'confirmed',
    CANCELLED = 'cancelled',
    COMPLETED = 'completed'
}

export enum PaymentMethod {
    CARD = 'card',
    CASH = 'cash'
}

@Schema({ timestamps: true })
export class Booking extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Property' })
    propertyId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Guest' })
    guestId: string;

    @Prop({ required: true })
    guestCount: number;

    @Prop({ required: true, type: Date })
    checkInDate: Date;

    @Prop({ required: true, type: Date })
    checkOutDate: Date;

    @Prop({ required: true, type: Number })
    totalAmount: number;

    @Prop({ type: Number, default: 0 })
    discountAmount: number;

    @Prop({ type: Number, required: true })
    subtotal: number;

    @Prop({
        type: String,
        enum: BookingStatus,
        default: BookingStatus.PENDING
    })
    status: BookingStatus;

    @Prop({
        type: String,
        enum: PaymentMethod,
        required: true
    })
    paymentMethod: PaymentMethod;

    @Prop({ type: Number, default: 0 })
    prepaymentAmount: number;

    @Prop({ type: String, required: false }) // Made optional
    stripePaymentId?: string;

    @Prop({ required: true, unique: true })
    confirmationCode: string;

    @Prop({ type: Object, default: {} })
    externalIds: {
        venueboostId?: string;
        [key: string]: string;
    };

    @Prop({ type: Map, of: String, default: {} })
    metadata: Map<string, any>;

    @Prop({ type: String, required: false }) // Optional notes
    notes?: string;

    @Prop({ type: String, required: false }) // Optional cancellation reason
    cancellationReason?: string;

    @Prop({ type: Date, required: false }) // Optional date when booking was cancelled
    cancelledAt?: Date;

    @Prop({ type: Boolean, default: false }) // Track if refund was issued
    refundIssued?: boolean;

    @Prop({ type: Number, required: false }) // Optional refund amount
    refundAmount?: number;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);

// Indexes
BookingSchema.index({ clientId: 1 });
BookingSchema.index({ propertyId: 1 });
BookingSchema.index({ guestId: 1 });
BookingSchema.index({ status: 1 });
BookingSchema.index({ checkInDate: 1, checkOutDate: 1 });
BookingSchema.index({ 'externalIds.venueboostId': 1 });
BookingSchema.index({ confirmationCode: 1 }, { unique: true });