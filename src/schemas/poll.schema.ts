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
  
  @Prop({ default: false })
  autoEmbedAllPosts: boolean;

  @Prop({ type: [Number], default: [] })
  autoEmbedLocations: number[];

  @Prop({ type: [PollOptionSchema], default: [] })
  options: PollOption[];

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  // Modified: Make this an array to support multiple clients
  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Client' }], required: true })
  clientIds: string[];

  // Keep the original clientId for backward compatibility and as the primary client
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', required: true })
  clientId: string;

  @Prop()
  wordpressId?: number;

  // New property for unified/multi-client polls
  @Prop({ default: false })
  isMultiClient: boolean;

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
  
  @Prop({ default: '#ffffff' })
  percentageLabelColor: string;
  
  @Prop({ default: '#d0d5dd' })
  iconColor: string;
  
  @Prop({ default: '#2597a4' })
  iconHoverColor: string;
  
  // Dark mode properties
  @Prop({ default: false })
  darkMode: boolean;
  
  @Prop({ default: '#222222' })
  darkModeBackground: string;
  
  @Prop({ default: '#ffffff' })
  darkModeTextColor: string;
  
  @Prop({ default: '#333333' })
  darkModeOptionBackground: string;
  
  @Prop({ default: '#444444' })
  darkModeOptionHover: string;
  
  @Prop({ default: '#ffffff' })
  darkModeLinkColor: string;
  
  @Prop({ default: '#2597a4' })
  darkModeLinkHoverColor: string;
  
  @Prop({ default: '#444444' })
  darkModeProgressBackground: string;
  
  @Prop({ default: '#ffffff' })
  darkModePercentageLabelColor: string;
  
  @Prop({ default: '#ffffff' })
  darkModeIconColor: string;
  
  @Prop({ default: '#2597a4' })
  darkModeIconHoverColor: string;

  // Radio button styling
  @Prop({ default: '#d0d5dd' })
  radioBorderColor: string;

  @Prop({ default: '#2597a4' })
  radioCheckedBorderColor: string;

  @Prop({ default: '#2597a4' })
  radioCheckedDotColor: string;

  // Dark mode versions
  @Prop({ default: '#444444' })
  darkModeRadioBorder: string;

  @Prop({ default: '#2597a4' })
  darkModeRadioCheckedBorder: string;

  @Prop({ default: '#2597a4' })
  darkModeRadioCheckedDot: string;

  @Prop({ default: false })
  allowMultipleVotes: boolean;

  // Client-specific overrides for styling - stored as a map of clientId to override values
  @Prop({ type: Map, of: Object, default: () => new Map() })
clientStyleOverrides: Map<string, {
    highlightColor?: string;
    voteButtonColor?: string;
    voteButtonHoverColor?: string;
    iconColor?: string;
    iconHoverColor?: string;
    resultsLinkColor?: string;
    resultsLinkHoverColor?: string;
    radioCheckedBorderColor?: string;
    radioCheckedDotColor?: string;
  }>;
}

export const PollSchema = SchemaFactory.createForClass(Poll);

// Add index for efficient multi-client queries
PollSchema.index({ clientIds: 1 });