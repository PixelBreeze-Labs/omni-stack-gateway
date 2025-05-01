// src/schemas/poll.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema()
export class PollOption {
  @Prop({ required: true })
  optionText: string;

  @Prop({ default: 0 })
  votes: number;

  // New: Track votes by client ID
  @Prop({ type: Map, of: Number, default: () => new Map() })
  clientVotes: Map<string, number>;

  @Prop()
  customHighlight?: string;
}

export const PollOptionSchema = SchemaFactory.createForClass(PollOption);

// Define all potential style overrides a client can have
@Schema({ _id: false })
export class ClientStyleOverride {
  // Light mode colors
  @Prop()
  highlightColor?: string;

  @Prop()
  voteButtonColor?: string;

  @Prop()
  voteButtonHoverColor?: string;

  @Prop()
  optionsBackgroundColor?: string;

  @Prop()
  optionsHoverColor?: string;

  @Prop()
  resultsLinkColor?: string;

  @Prop()
  resultsLinkHoverColor?: string;

  @Prop()
  progressBarBackgroundColor?: string;

  @Prop()
  percentageLabelColor?: string;

  @Prop()
  iconColor?: string;

  @Prop()
  iconHoverColor?: string;

  @Prop()
  radioBorderColor?: string;

  @Prop()
  radioCheckedBorderColor?: string;

  @Prop()
  radioCheckedDotColor?: string;

  // Dark mode specific styles
  @Prop()
  darkMode?: boolean;

  @Prop()
  darkModeBackground?: string;

  @Prop()
  darkModeTextColor?: string;

  @Prop()
  darkModeOptionBackground?: string;

  @Prop()
  darkModeOptionHover?: string;

  @Prop()
  darkModeLinkColor?: string;

  @Prop()
  darkModeLinkHoverColor?: string;

  @Prop()
  darkModeProgressBackground?: string;

  @Prop()
  darkModePercentageLabelColor?: string;

  @Prop()
  darkModeIconColor?: string;

  @Prop()
  darkModeIconHoverColor?: string;

  @Prop()
  darkModeRadioBorder?: string;

  @Prop()
  darkModeRadioCheckedBorder?: string;

  @Prop()
  darkModeRadioCheckedDot?: string;
}

export const ClientStyleOverrideSchema = SchemaFactory.createForClass(ClientStyleOverride);

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


  // Multi-client properties
  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Client' }], required: true })
  clientIds: string[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', required: true })
  clientId: string; // Primary client who created the poll

  @Prop({ default: false })
  isMultiClient: boolean;

  @Prop()
  wordpressId?: number;

  // Style customization properties - base styles
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
  
  // Radio button styling
  @Prop({ default: '#d0d5dd' })
  radioBorderColor: string;

  @Prop({ default: '#2597a4' })
  radioCheckedBorderColor: string;

  @Prop({ default: '#2597a4' })
  radioCheckedDotColor: string;
  
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

  @Prop({ default: '#444444' })
  darkModeRadioBorder: string;

  @Prop({ default: '#2597a4' })
  darkModeRadioCheckedBorder: string;

  @Prop({ default: '#2597a4' })
  darkModeRadioCheckedDot: string;

  @Prop({ default: false })
  allowMultipleVotes: boolean;

  // Client-specific style overrides - store all style overrides for each client
  @Prop({ type: Map, of: ClientStyleOverrideSchema, default: () => new Map() })
  clientStyleOverrides: Map<string, ClientStyleOverride>;
}

export const PollSchema = SchemaFactory.createForClass(Poll);

// Add index for efficient multi-client queries
PollSchema.index({ clientIds: 1 });
PollSchema.index({ clientId: 1 });

// Add this to your PollSchema definition
PollSchema.set('toJSON', {
  virtuals: true,
  getters: true,
  transform: function(doc: any, ret: any) {
      // Use explicit any typing to bypass TypeScript errors
      const docAny = doc as any;
      if (docAny.clientStyleOverrides instanceof Map) {
          ret.clientStyleOverrides = {};
          for (const [key, value] of docAny.clientStyleOverrides.entries()) {
              ret.clientStyleOverrides[key] = value;
          }
      }
      return ret;
  }
});

// Also add toObject transform for consistency
PollSchema.set('toObject', {
  virtuals: true,
  getters: true,
  transform: function(doc: any, ret: any) {
      // Use explicit any typing to bypass TypeScript errors
      const docAny = doc as any;
      if (docAny.clientStyleOverrides instanceof Map) {
          ret.clientStyleOverrides = {};
          for (const [key, value] of docAny.clientStyleOverrides.entries()) {
              ret.clientStyleOverrides[key] = value;
          }
      }
      return ret;
  }
});