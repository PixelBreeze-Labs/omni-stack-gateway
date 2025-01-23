// src/schemas/operation.schema.ts
import { Prop, Schema } from '@nestjs/mongoose';
import {OperationStatus, OperationType} from "./enums";

@Schema({ timestamps: true })
export class Operation {
    @Prop({ required: true })
    clientId: string;

    @Prop({ required: true })
    warehouseId: string;

    @Prop({ type: String, enum: OperationType, required: true })
    type: OperationType;

    @Prop({ required: true })
    number: string;

    @Prop({ type: String, enum: OperationStatus, default: OperationStatus.DRAFT })
    status: OperationStatus;

    @Prop()
    batchId?: string;

    @Prop()
    externalVendorId?: string;

    @Prop()
    reference?: string;

    @Prop()
    notes?: string;
}
