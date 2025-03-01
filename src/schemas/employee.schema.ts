// src/schemas/employee.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum EmployeeStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    ON_LEAVE = 'on_leave',
    TERMINATED = 'terminated',
}

@Schema({ timestamps: true })
export class Employee extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Business' })
    businessId?: string;

    @Prop({ required: true })
    name: string;

    @Prop({ required: true, unique: true })
    email: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
    user_id?: string;

    /**
     * external_ids: A JSON object to store various external IDs.
     * Example:
     * {
     *   oldPlatformUserId: "123",
     *   bookMasterId: "456",
     *   trackMasterId: "789",
     *   supaBaseId: "abc",
     *   venueBoostId: "def"
     * }
     */
    @Prop({ type: Object, default: {} })
    external_ids: Record<string, any>;

    @Prop({ type: Map, of: String, default: {} })
    metadata: Map<string, any>;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);

// Add indexes for commonly queried fields
EmployeeSchema.index({ email: 1 }, { unique: true });
EmployeeSchema.index({ user_id: 1 });
EmployeeSchema.index({ status: 1 });
EmployeeSchema.index({ businessId: 1 });