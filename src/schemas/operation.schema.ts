// src/schemas/operation.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { OperationStatus, OperationType } from '../enums/operations.enum';

@Schema({ timestamps: true })
export class Operation extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Warehouse' })
    warehouseId: string;

    @Prop({ type: String, enum: OperationType, required: true })
    type: OperationType;

    @Prop({ required: true })
    number: string;

    @Prop({ type: String, enum: OperationStatus, default: OperationStatus.DRAFT })
    status: OperationStatus;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Batch' })
    batchId?: string;

    @Prop()
    externalVendorId?: string;

    @Prop()
    reference?: string;

    @Prop()
    notes?: string;
}

export const OperationSchema = SchemaFactory.createForClass(Operation);
