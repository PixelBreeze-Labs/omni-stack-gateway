// src/services/core-notification.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../schemas/user.schema';
import { OneSignalService } from './onesignal.service';
import { SupabaseService } from './supabase.service';
import { Message } from '../schemas/message.schema';
import { Chat } from '../schemas/chat.schema';

export interface ChatNotificationOptions {
    chatId: string;
    messageId: string;
    senderId: string;
    excludeUsers?: string[];
    title?: string;
    message?: string;
    data?: any;
}

@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);

    constructor(
        @InjectModel(User.name) private userModel: Model<User>,
        @InjectModel(Chat.name) private chatModel: Model<Chat>,
        @InjectModel(Message.name) private messageModel: Model<Message>,
        private readonly oneSignalService: OneSignalService,
        private readonly supabaseService: SupabaseService,
    ) {}

    /**
     * Send a chat message notification
     */
    async sendChatMessageNotification(options: ChatNotificationOptions): Promise<any> {
        try {
            // Get the chat to find participants
            const chat = await this.chatModel.findById(options.chatId).lean();
            if (!chat) {
                throw new Error(`Chat not found with ID: ${options.chatId}`);
            }

            // Get the message details
            const message = await this.messageModel.findById(options.messageId).lean();
            if (!message) {
                throw new Error(`Message not found with ID: ${options.messageId}`);
            }

            // Get the sender info
            const sender = await this.userModel.findById(options.senderId).lean();
            if (!sender) {
                throw new Error(`Sender not found with ID: ${options.senderId}`);
            }

            // Prepare the list of recipients (participants excluding sender and any specified excludes)
            const excludeUserIds = new Set([
                options.senderId,
                ...(options.excludeUsers || []),
            ]);

            const recipientIds = chat.participants.filter(
                (userId) => !excludeUserIds.has(userId.toString()),
            );

            if (recipientIds.length === 0) {
                this.logger.debug('No recipients to notify');
                return { success: true, message: 'No recipients to notify' };
            }

            // Find all recipients to get their device tokens
            const recipients = await this.userModel
                .find({ _id: { $in: recipientIds } })
                .select('name deviceTokens external_ids')
                .lean();

            // Get all external user IDs for recipients (OneSignal)
            const externalUserIds = recipients
                .map(user => user.external_ids?.oneSignalId)
                .filter(Boolean);

            // Prepare notification content
            const title = options.title ||
                (chat.type === 'group' ? `${sender.name} in ${chat.name || 'Group Chat'}` : sender.name);

            let notificationMessage = options.message;
            if (!notificationMessage) {
                // Create a default message based on message type
                switch(message.type) {
                    case 'text':
                        notificationMessage = message.content.length > 50
                            ? `${message.content.substring(0, 47)}...`
                            : message.content;
                        break;
                    case 'image':
                        notificationMessage = '📷 Image';
                        break;
                    case 'video':
                        notificationMessage = '🎥 Video';
                        break;
                    case 'audio':
                        notificationMessage = '🎵 Audio message';
                        break;
                    case 'file':
                        notificationMessage = '📎 File';
                        break;
                    case 'location':
                        notificationMessage = '📍 Location';
                        break;
                    default:
                        notificationMessage = 'New message';
                }

                // Add context for replies/forwards
                if (message.replyToId) {
                    notificationMessage = `↩️ ${notificationMessage}`;
                }

                if (message.forwardedFromId) {
                    notificationMessage = `↪️ ${notificationMessage}`;
                }
            }

            // Send notification through OneSignal
            if (externalUserIds.length > 0) {
                await this.oneSignalService.sendNotification({
                    headings: { en: title },
                    contents: { en: notificationMessage },
                    include_external_user_ids: externalUserIds,
                    data: {
                        type: 'chat_message',
                        chatId: options.chatId,
                        messageId: options.messageId,
                        senderId: options.senderId,
                        ...(options.data || {}),
                    },
                    android_channel_id: 'chat-messages',
                    ios_category: 'chat-message',
                    ios_badgeType: 'Increase',
                    ios_badgeCount: 1,
                    collapse_id: options.chatId,
                    priority: 10,
                    ttl: 259200, // 3 days
                });
            }

            return {
                success: true,
                message: 'Notifications sent successfully',
                recipientCount: externalUserIds.length,
            };
        } catch (error) {
            this.logger.error(
                `Error sending chat notification: ${error.message}`,
                error.stack,
            );
            throw error;
        }
    }

    /**
     * Update user's OneSignal player ID
     */
    async updateUserOneSignalId(userId: string, oneSignalId: string): Promise<any> {
        try {
            return await this.userModel.findByIdAndUpdate(
                userId,
                {
                    $set: { 'external_ids.oneSignalId': oneSignalId }
                },
                { new: true }
            );
        } catch (error) {
            this.logger.error(
                `Error updating user OneSignal ID: ${error.message}`,
                error.stack,
            );
            throw error;
        }
    }

    /**
     * Test function to send a notification to a user
     */
    async sendTestNotificationToUser(
        userId: string,
        title: string = 'Test Notification',
        message: string = 'This is a test notification',
    ): Promise<any> {
        try {
            // Find the user
            const user = await this.userModel.findById(userId).lean();
            if (!user) {
                throw new Error(`User not found with ID: ${userId}`);
            }

            // Check if the user has a OneSignal ID
            const oneSignalId = user.external_ids?.oneSignalId;
            if (!oneSignalId) {
                throw new Error('User does not have a OneSignal ID');
            }

            // Send notification
            return await this.oneSignalService.sendNotification({
                headings: { en: title },
                contents: { en: message },
                include_external_user_ids: [oneSignalId],
                data: {
                    type: 'test',
                    timestamp: new Date().toISOString(),
                },
            });
        } catch (error) {
            this.logger.error(
                `Error sending test notification to user: ${error.message}`,
                error.stack,
            );
            throw error;
        }
    }
}