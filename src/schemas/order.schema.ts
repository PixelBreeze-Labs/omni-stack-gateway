// schemas/order.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Order extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Customer' })
    customerId: string;

    @Prop({ required: true, type: Number })
    total: number;

    @Prop({ required: true, enum: ['PENDING', 'COMPLETED', 'CANCELLED'], default: 'PENDING' })
    status: string;

    @Prop({ type: Object })
    metadata: Record<string, any>;

    @Prop({ type: Date, default: Date.now })
    createdAt: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
