// schemas/family-account.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class FamilyAccount extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({
        type: {
            name: { type: String, required: true },
            email: { type: String, required: true },
            phone: String,
            avatar: String,
            status: { type: String, enum: ['ACTIVE', 'INACTIVE'] },
            joinDate: Date
        },
        required: true
    })
    mainAccount: {
        name: string;
        email: string;
        phone?: string;
        avatar?: string;
        status: string;
        joinDate: Date;
    };

    @Prop([{
        name: { type: String, required: true },
        email: { type: String, required: true },
        phone: String,
        relationship: { type: String, required: true },
        status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'PENDING'] },
        joinDate: Date
    }])
    members: Array<{
        name: string;
        email: string;
        phone?: string;
        relationship: string;
        status: string;
        joinDate: Date;
    }>;

    @Prop({ type: [String] })
    sharedBenefits: string[];

    @Prop({ type: Number, default: 0 })
    totalSpent: number;

    @Prop()
    lastActivity: Date;
}

export const FamilyAccountSchema = SchemaFactory.createForClass(FamilyAccount);