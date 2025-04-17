// src/schemas/poll.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema()
export class PollOption {
  @Prop({ required: true })
  optionText: string;

  @Prop({ default: 0 })
  votes: number;

  @Prop()
  customHighlight?: string;
}

export const PollOptionSchema = SchemaFactory.createForClass(PollOption);

@Schema({ timestamps: true })
export class Poll extends Document {
  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ default: '#2597a4' })
  highlightColor: string;

  @Prop({ default: 'fade', enum: ['fade', 'slide', 'pulse', 'bounce', 'none'] })
  highlightAnimation: string;

  @Prop({ default: true })
  showResults: boolean;

  @Prop({ default: false })
  autoEmbed: boolean;

  @Prop({ type: [Number], default: [] })
  autoEmbedLocations: number[];

  @Prop({ type: [PollOptionSchema], default: [] })
  options: PollOption[];

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', required: true })
  clientId: string;

  @Prop()
  wordpressId?: number;

  // Style customization properties
  @Prop({ default: '#0a0a0a' })
  voteButtonColor: string;
  
  @Prop({ default: '#1d7a84' })
  voteButtonHoverColor: string;
  
  @Prop({ default: '#fcfcfc' })
  optionsBackgroundColor: string;
  
  @Prop({ default: '#f7f9fc' })
  optionsHoverColor: string;
  
  @Prop({ default: '#0a0a0a' })
  resultsLinkColor: string;
  
  @Prop({ default: '#1d7a84' })
  resultsLinkHoverColor: string;
  
  @Prop({ default: '#f0f0f5' })
  progressBarBackgroundColor: string;
}

export const PollSchema = SchemaFactory.createForClass(Poll);