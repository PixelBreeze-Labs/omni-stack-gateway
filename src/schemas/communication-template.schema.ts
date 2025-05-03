// src/schemas/communication-template.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { MessageChannel } from './client-message.schema';

export enum TemplateType {
  UPDATE = 'update',
  NOTIFICATION = 'notification',
  ALERT = 'alert',
  WELCOME = 'welcome',
  FOLLOWUP = 'followup',
  REMINDER = 'reminder',
  CUSTOM = 'custom'
}

export enum TemplateScheduleType {
  MANUAL = 'manual',
  AUTO_TRIGGER = 'auto_trigger',
  SCHEDULED = 'scheduled'
}

@Schema({ timestamps: true })
export class CommunicationTemplate extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop({ 
    type: String,
    enum: TemplateType,
    required: true 
  })
  type: TemplateType;

  @Prop({ 
    type: [String],
    enum: Object.values(MessageChannel),
    default: [MessageChannel.EMAIL]
  })
  channels: MessageChannel[];

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({
    type: String,
    enum: TemplateScheduleType,
    default: TemplateScheduleType.MANUAL
  })
  scheduleType: TemplateScheduleType;

  @Prop({ type: MongooseSchema.Types.Mixed })
  triggerConditions: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  scheduleConfig: {
    frequency?: string;
    days?: number[];
    time?: string;
    timezone?: string;
  };

  @Prop({ type: MongooseSchema.Types.Mixed })
  placeholders: string[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const CommunicationTemplateSchema = SchemaFactory.createForClass(CommunicationTemplate);

// Add indexes
CommunicationTemplateSchema.index({ businessId: 1 });
CommunicationTemplateSchema.index({ type: 1 });
CommunicationTemplateSchema.index({ isActive: 1 });