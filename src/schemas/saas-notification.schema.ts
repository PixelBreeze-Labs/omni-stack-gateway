// src/schemas/saas-notification.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum NotificationType {
  SYSTEM = 'system',
  WEATHER = 'weather',
  PROJECT = 'project',
  TASK = 'task',
  SIGNATURE = 'signature',
  INVOICE = 'invoice',
  ALERT = 'alert',
  TICKET = 'ticket'
}

export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed'
}

export enum DeliveryChannel {
  APP = 'app',
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push'
}

@Schema({ timestamps: true })
export class SaasNotification extends Document {
  @Prop({ required: true })
  title: string;
  
  @Prop({ required: true })
  body: string;
  
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;
  
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId: string;
  
  @Prop({ type: String, enum: NotificationType, required: true })
  type: NotificationType;
  
  @Prop({ type: String, enum: NotificationPriority, default: NotificationPriority.MEDIUM })
  priority: NotificationPriority;
  
  @Prop({ type: String, enum: NotificationStatus, default: NotificationStatus.PENDING })
  status: NotificationStatus;
  
  @Prop({ type: [String], enum: Object.values(DeliveryChannel) })
  channels: DeliveryChannel[];
  
  @Prop({ type: Object })
  deliveryStatus: {
    [DeliveryChannel.APP]?: NotificationStatus;
    [DeliveryChannel.EMAIL]?: NotificationStatus;
    [DeliveryChannel.SMS]?: NotificationStatus;
    [DeliveryChannel.PUSH]?: NotificationStatus;
  };
  
  @Prop({ type: Date })
  readAt: Date;
  
  @Prop({ type: Date })
  expiresAt: Date;
  
  @Prop({ type: Object })
  actionData: {
    type?: string;
    url?: string;
    entityId?: string;
    entityType?: string;
    buttons?: Array<{
      text: string;
      action: string;
      data?: any;
    }>;
  };
  
  @Prop({ type: Object })
  reference: {
    type: string;
    id: string;
    venueBoostNotificationId?: string;
  };
  
  @Prop({ type: Boolean, default: false })
  isBroadcast: boolean;
  
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: Record<string, any>;
}

export const SaasNotificationSchema = SchemaFactory.createForClass(SaasNotification);

// Add indexes
SaasNotificationSchema.index({ businessId: 1 });
SaasNotificationSchema.index({ userId: 1 });
SaasNotificationSchema.index({ status: 1 });
SaasNotificationSchema.index({ type: 1 });
SaasNotificationSchema.index({ 'reference.type': 1, 'reference.id': 1 });