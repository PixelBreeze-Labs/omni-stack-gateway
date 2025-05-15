// src/schemas/knowledge-document.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class KnowledgeDocument extends Document {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true, type: String })
  content: string;

  @Prop({ type: [String], index: true })
  keywords: string[];

  @Prop({ type: String, enum: ['article', 'faq', 'guide', 'announcement'], default: 'article' })
  type: string;

  @Prop({ type: [String] })
  categories: string[];

  @Prop({ type: [String], default: [] })
  applicableBusinessTypes: string[]; // e.g., 'field_service', 'construction', 'all'

  @Prop({ type: [String], default: [] })
  applicableFeatures: string[]; // e.g., 'project_management', 'time_tracking', 'all'

  @Prop({ type: String })
  createdBy: string;

  @Prop({ type: Boolean, default: true })
  active: boolean;
  
  @Prop({ type: Number, default: 0 })
  useCount: number; // Track how often this document is used
}

export const KnowledgeDocumentSchema = SchemaFactory.createForClass(KnowledgeDocument);

// Add indexes for efficient searching
KnowledgeDocumentSchema.index({ active: 1 });
KnowledgeDocumentSchema.index({ 
  title: 'text', 
  content: 'text', 
  keywords: 'text' 
});
KnowledgeDocumentSchema.index({ applicableBusinessTypes: 1 });
KnowledgeDocumentSchema.index({ applicableFeatures: 1 });
KnowledgeDocumentSchema.index({ categories: 1 });