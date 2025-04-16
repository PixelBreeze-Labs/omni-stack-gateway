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

  @Prop()
  autoEmbedLocations?: string;

  @Prop({ type: [PollOptionSchema], default: [] })
  options: PollOption[];

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', required: true })
  clientId: string;

  @Prop()
  wordpressId?: number;
}

export const PollSchema = SchemaFactory.createForClass(Poll);