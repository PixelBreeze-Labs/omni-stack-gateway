// src/schemas/wallet.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ _id: false })
export class WalletTransaction {
    @Prop({ required: true })
    amount: number;

    @Prop({ required: true })
    currency: string;

    @Prop({ required: true })
    type: 'credit' | 'debit';

    @Prop({ required: true })
    description: string;

    @Prop({
        type: String,
        enum: ['points_redemption', 'refund', 'manual_adjustment', 'reward'],
        required: true
    })
    source: string;

    @Prop({ type: MongooseSchema.Types.Mixed })
    metadata?: Record<string, any>;

    @Prop({ type: Date, default: Date.now })
    timestamp: Date;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
    processedBy?: string;
}

export const WalletTransactionSchema = SchemaFactory.createForClass(WalletTransaction);

@Schema({ timestamps: true })
export class Wallet extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
    userId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true, default: 0 })
    balance: number;

    @Prop({ required: true, default: 'EUR' })
    currency: string;

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ type: [WalletTransactionSchema], default: [] })
    transactions: WalletTransaction[];
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);

// Add indexes for common queries
WalletSchema.index({ userId: 1, clientId: 1 }, { unique: true });
WalletSchema.index({ 'transactions.timestamp': 1 });
WalletSchema.index({ 'transactions.source': 1 });