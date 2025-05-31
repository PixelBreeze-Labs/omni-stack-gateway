import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class QueryResponsePair extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', required: true })
  clientId: string;

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

  @Prop({ type: Number, default: 0 })
  similarity: number;
}

export const QueryResponsePairSchema = SchemaFactory.createForClass(QueryResponsePair);

// Add indexes
QueryResponsePairSchema.index({ clientId: 1 });
QueryResponsePairSchema.index({ active: 1 });
QueryResponsePairSchema.index({ query: 'text', keywords: 'text' });
QueryResponsePairSchema.index({ clientId: 1, category: 1 }); // For efficiently querying client's responses by category
QueryResponsePairSchema.index({ clientId: 1, active: 1 }); // For efficiently querying client's active responses