// schemas/activity.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Activity extends Document {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Customer' })
    customerId: string;

    @Prop({ required: true })
    type: string;

    @Prop({ required: true })
    description: string;

    @Prop({ type: Object })
    metadata: Record<string, any>;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);
