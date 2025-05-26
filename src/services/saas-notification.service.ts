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

  /**
 * Get business notification count
 */
async getBusinessNotificationCount(businessId: string, query?: any): Promise<number> {
  const countQuery = query || { businessId };
  return this.notificationModel.countDocuments(countQuery).exec();
}

/**
 * Get business notification statistics
 */
async getBusinessNotificationStats(businessId: string): Promise<{
  total: number;
  unread: number;
  highPriority: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  recentCount: number;
}> {
  try {
    const [
      total,
      unread,
      highPriority,
      typeStats,
      statusStats,
      recentCount
    ] = await Promise.all([
      // Total notifications
      this.notificationModel.countDocuments({ businessId }).exec(),
      
      // Unread notifications
      this.notificationModel.countDocuments({ 
        businessId, 
        status: { $ne: NotificationStatus.READ } 
      }).exec(),
      
      // High priority notifications
      this.notificationModel.countDocuments({ 
        businessId, 
        priority: { $in: ['high', 'urgent'] }
      }).exec(),
      
      // By type
      this.notificationModel.aggregate([
        { $match: { businessId } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]).exec(),
      
      // By status
      this.notificationModel.aggregate([
        { $match: { businessId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]).exec(),
      
      // Recent notifications (last 24 hours)
      this.notificationModel.countDocuments({
        businessId,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }).exec()
    ]);

    // Convert aggregation results to objects
    const byType: Record<string, number> = {};
    typeStats.forEach(stat => {
      byType[stat._id] = stat.count;
    });

    const byStatus: Record<string, number> = {};
    statusStats.forEach(stat => {
      byStatus[stat._id] = stat.count;
    });

    return {
      total,
      unread,
      highPriority,
      byType,
      byStatus,
      recentCount
    };

  } catch (error) {
    this.logger.error(`Error getting notification stats: ${error.message}`, error.stack);
    throw error;
  }
}

/**
 * Mark all business notifications as read
 */
async markAllBusinessNotificationsAsRead(businessId: string): Promise<number> {
  try {
    const result = await this.notificationModel.updateMany(
      { 
        businessId, 
        status: { $ne: NotificationStatus.READ } 
      },
      { 
        status: NotificationStatus.READ,
        readAt: new Date()
      }
    ).exec();

    return result.modifiedCount;
  } catch (error) {
    this.logger.error(`Error marking all business notifications as read: ${error.message}`, error.stack);
    throw error;
  }
}

/**
 * Get notifications with advanced filtering
 */
async getNotificationsWithFilters(filters: {
  businessId?: string;
  userId?: string;
  type?: NotificationType;
  status?: NotificationStatus;
  priority?: string;
  fromDate?: Date;
  toDate?: Date;
  skip?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<SaasNotification[]> {
  try {
    const query: any = {};
    
    if (filters.businessId) query.businessId = filters.businessId;
    if (filters.userId) query.userId = filters.userId;
    if (filters.type) query.type = filters.type;
    if (filters.status) query.status = filters.status;
    if (filters.priority) query.priority = filters.priority;
    
    if (filters.fromDate || filters.toDate) {
      query.createdAt = {};
      if (filters.fromDate) query.createdAt.$gte = filters.fromDate;
      if (filters.toDate) query.createdAt.$lte = filters.toDate;
    }

    const sortField = filters.sortBy || 'createdAt';
    const sortDirection = filters.sortOrder === 'asc' ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };

    return this.notificationModel
      .find(query)
      // @ts-ignore
      .sort(sortObj)
      .skip(filters.skip || 0)
      .limit(filters.limit || 20)
      .exec();

  } catch (error) {
    this.logger.error(`Error getting notifications with filters: ${error.message}`, error.stack);
    throw error;
  }
}
}