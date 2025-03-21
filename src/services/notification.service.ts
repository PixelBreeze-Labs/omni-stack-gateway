// src/services/notification.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification, NotificationType } from '../schemas/notification.schema';
import { CreateNotificationDto, ListNotificationDto, MarkNotificationsReadDto } from '../dtos/notification.dto';
import { ReportStatus } from '../schemas/report.schema';

@Injectable()
export class NotificationService {
    constructor(
        @InjectModel(Notification.name) private notificationModel: Model<Notification>
    ) {}

    async create(createDto: CreateNotificationDto): Promise<Notification> {
        const notification = new this.notificationModel({
            ...createDto,
            read: false,
            createdAt: new Date()
        });
        return notification.save();
    }

    async createStatusChangeNotification(
        userId: string,
        clientId: string,
        reportId: string,
        oldStatus: string,
        newStatus: string,
        reportTitle: string
    ): Promise<Notification> {
        const statusMap = {
            [ReportStatus.PENDING_REVIEW]: 'Pending Review',
            [ReportStatus.REJECTED]: 'Rejected',
            [ReportStatus.ACTIVE]: 'Active',
            [ReportStatus.IN_PROGRESS]: 'In Progress',
            [ReportStatus.RESOLVED]: 'Resolved',
            [ReportStatus.CLOSED]: 'Closed',
            [ReportStatus.NO_RESOLUTION]: 'No Resolution'
        };

        const title = 'Report Status Updated';
        const message = `Your report "${reportTitle}" has been updated from ${statusMap[oldStatus] || oldStatus} to ${statusMap[newStatus] || newStatus}.`;

        return this.create({
            userId,
            clientId,
            reportId,
            type: NotificationType.REPORT_STATUS_CHANGE,
            title,
            message,
            data: {
                oldStatus,
                newStatus,
                reportTitle
            }
        });
    }

    async createCommentNotification(
        userId: string,
        clientId: string,
        reportId: string,
        commentAuthorName: string,
        reportTitle: string
    ): Promise<Notification> {
        const title = 'New Comment on Your Report';
        const message = `${commentAuthorName} commented on your report "${reportTitle}".`;

        return this.create({
            userId,
            clientId,
            reportId,
            type: NotificationType.REPORT_COMMENT,
            title,
            message,
            data: {
                commentAuthorName,
                reportTitle
            }
        });
    }

    async findUserNotifications(userId: string, clientId: string, query: ListNotificationDto) {
        const { page = 1, limit = 10, unreadOnly = false } = query;
        const skip = (page - 1) * limit;

        const filter: any = {
            userId,
            clientId
        };

        if (unreadOnly) {
            filter.read = false;
        }

        const total = await this.notificationModel.countDocuments(filter);
        const notifications = await this.notificationModel.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const unreadCount = await this.notificationModel.countDocuments({
            userId,
            clientId,
            read: false
        });

        return {
            data: notifications,
            meta: {
                total,
                page,
                limit,
                unreadCount,
                hasMore: total > skip + notifications.length
            }
        };
    }

    async markAsRead(userId: string, clientId: string, dto: MarkNotificationsReadDto) {
        const { ids, markAll } = dto;

        if (markAll) {
            await this.notificationModel.updateMany(
                { userId, clientId, read: false },
                { $set: { read: true } }
            );
            return { success: true, count: await this.notificationModel.countDocuments({ userId, clientId, read: false }) };
        }

        if (ids && ids.length > 0) {
            await this.notificationModel.updateMany(
                { _id: { $in: ids }, userId, clientId },
                { $set: { read: true } }
            );
            return { success: true, count: ids.length };
        }

        return { success: false, count: 0 };
    }

    async getUnreadCount(userId: string, clientId: string): Promise<number> {
        return this.notificationModel.countDocuments({
            userId,
            clientId,
            read: false
        });
    }
}