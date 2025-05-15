// src/schemas/chatbot-message.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class ChatbotMessage extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
  clientId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId: string;

  @Prop({ required: true, enum: ['user', 'bot'] })
  sender: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  suggestions: {
    id: string;
    text: string;
  }[];

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: Record<string, any>;

  @Prop({ type: String })
  sessionId: string;
}

export const ChatbotMessageSchema = SchemaFactory.createForClass(ChatbotMessage);

// Add indexes for efficient queries
ChatbotMessageSchema.index({ businessId: 1, userId: 1 });
ChatbotMessageSchema.index({ businessId: 1, sessionId: 1 });
ChatbotMessageSchema.index({ sessionId: 1 });
ChatbotMessageSchema.index({ createdAt: 1 });