// src/schemas/unrecognized-query.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class UnrecognizedQuery extends Document {
  @Prop({ type: String })
  businessType: string;
  
  @Prop({ type: String })
  userId: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: Object })
  context: Record<string, any>;

  @Prop({ type: String })
  sessionId: string;

  @Prop({ default: false })
  resolved: boolean;
  
  @Prop({ type: String, enum: ['pending', 'reviewed', 'answered'], default: 'pending' })
  status: string;

  @Prop({ type: String })
  response: string;
  
  @Prop({ type: String })
  answeredBy: string;
  
  @Prop({ type: Date })
  answeredAt: Date;

  @Prop({ type: Number, default: 1 })
  frequency: number; // Count similar questions
  
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'KnowledgeDocument' })
  knowledgeDocumentId: MongooseSchema.Types.ObjectId; // If we create a knowledge doc for this
}

export const UnrecognizedQuerySchema = SchemaFactory.createForClass(UnrecognizedQuery);

// Add indexes for efficient queries
UnrecognizedQuerySchema.index({ businessType: 1, message: 1 });
UnrecognizedQuerySchema.index({ status: 1 });
UnrecognizedQuerySchema.index({ frequency: -1 });
UnrecognizedQuerySchema.index({ message: 'text' });