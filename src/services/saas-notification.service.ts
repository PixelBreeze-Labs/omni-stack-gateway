// src/services/notification.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SaasNotification, NotificationType, NotificationPriority, DeliveryChannel, NotificationStatus } from '../schemas/saas-notification.schema';

@Injectable()
export class SaasNotificationService {
  private readonly logger = new Logger(SaasNotificationService.name);

  constructor(
    @InjectModel(SaasNotification.name) private notificationModel: Model<SaasNotification>
  ) {}

  /**
   * Create a new notification
   */
  async createNotification(params: {
    businessId: string;
    title: string;
    body: string;
    type: NotificationType | string;
    priority?: NotificationPriority | string;
    userId?: string;
    channels?: DeliveryChannel[];
    reference?: {
      type: string;
      id: string;
      venueBoostNotificationId?: string;
    };
    actionData?: {
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
    expiresAt?: Date;
    isBroadcast?: boolean;
    metadata?: Record<string, any>;
  }): Promise<SaasNotification> {
    try {
      const notification = new this.notificationModel({
        businessId: params.businessId,
        title: params.title,
        body: params.body,
        type: params.type,
        priority: params.priority || NotificationPriority.MEDIUM,
        userId: params.userId,
        channels: params.channels || [DeliveryChannel.APP],
        reference: params.reference,
        actionData: params.actionData,
        expiresAt: params.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days by default
        isBroadcast: params.isBroadcast || false,
        metadata: params.metadata || {}
      });
      
      await notification.save();
      
      // TODO: Trigger notification delivery based on channels
      // For example, if channels include EMAIL, send an email
      // if channels include PUSH, send a push notification
      // this.deliverNotification(notification);
      
      return notification;
    } catch (error) {
      this.logger.error(`Error creating notification: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId: string, options?: {
    limit?: number;
    skip?: number;
    type?: NotificationType;
    status?: string;
  }): Promise<SaasNotification[]> {
    const query: any = { userId };
    
    if (options?.type) {
      query.type = options.type;
    }
    
    if (options?.status) {
      query.status = options.status;
    }
    
    return this.notificationModel.find(query)
      .sort({ createdAt: -1 })
      .skip(options?.skip || 0)
      .limit(options?.limit || 50)
      .exec();
  }
  
  /**
   * Get business notifications
   */
  async getBusinessNotifications(businessId: string, options?: {
    limit?: number;
    skip?: number;
    type?: NotificationType;
    status?: string;
  }): Promise<SaasNotification[]> {
    const query: any = { businessId };
    
    if (options?.type) {
      query.type = options.type;
    }
    
    if (options?.status) {
      query.status = options.status;
    }
    
    return this.notificationModel.find(query)
      .sort({ createdAt: -1 })
      .skip(options?.skip || 0)
      .limit(options?.limit || 50)
      .exec();
  }
  
  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<SaasNotification> {
    return this.notificationModel.findByIdAndUpdate(
      notificationId,
      { 
        status: NotificationStatus.READ,
        readAt: new Date()
      },
      { new: true }
    ).exec();
  }
  
  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationModel.updateMany(
      { userId, status: { $ne: NotificationStatus.READ } },
      { 
        status: NotificationStatus.READ,
        readAt: new Date()
      }
    ).exec();
  }
  
  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string): Promise<void> {
    await this.notificationModel.findByIdAndDelete(notificationId).exec();
  }
  
  /**
   * Send multiple notifications to users
   */
  async sendBulkNotifications(userIds: string[], notificationData: {
    businessId: string;
    title: string;
    body: string;
    type: NotificationType | string;
    priority?: NotificationPriority | string;
    reference?: any;
    actionData?: any;
  }): Promise<number> {
    try {
      const notifications = userIds.map(userId => ({
        ...notificationData,
        userId,
        status: NotificationStatus.PENDING,
        channels: [DeliveryChannel.APP, DeliveryChannel.EMAIL],
        createdAt: new Date(),
        updatedAt: new Date()
      }));
      
      const result = await this.notificationModel.insertMany(notifications);
      return result.length;
    } catch (error) {
      this.logger.error(`Error sending bulk notifications: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Send broadcast notification to all business users
   */
  async sendBusinessBroadcast(businessId: string, notificationData: {
    title: string;
    body: string;
    type: NotificationType | string;
    priority?: NotificationPriority | string;
    reference?: any;
    actionData?: any;
  }): Promise<SaasNotification> {
    try {
      const notification = await this.createNotification({
        businessId,
        title: notificationData.title,
        body: notificationData.body,
        type: notificationData.type,
        priority: notificationData.priority,
        reference: notificationData.reference,
        actionData: notificationData.actionData,
        channels: [DeliveryChannel.APP],
        isBroadcast: true
      });
      
      return notification;
    } catch (error) {
      this.logger.error(`Error sending business broadcast: ${error.message}`, error.stack);
      throw error;
    }
  }
}