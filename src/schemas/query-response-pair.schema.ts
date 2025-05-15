// src/schemas/query-response-pair.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class QueryResponsePair extends Document {
  @Prop({ required: true })
  query: string;

  @Prop({ required: true })
  response: string;

  @Prop({ type: [String], index: true })
  keywords: string[];
  
  @Prop({ type: String })
  category: string;
  
  @Prop({ type: Boolean, default: true })
  active: boolean;
  
  @Prop({ type: Number, default: 0 })
  useCount: number;
  
  @Prop({ type: Number, default: 0 })
  successRate: number; // Track how successful this response is
}

export const QueryResponsePairSchema = SchemaFactory.createForClass(QueryResponsePair);

// Add indexes
QueryResponsePairSchema.index({ active: 1 });
QueryResponsePairSchema.index({ query: 'text', keywords: 'text' });