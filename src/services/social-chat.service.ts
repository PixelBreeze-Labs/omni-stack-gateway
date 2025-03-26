// src/services/social-chat.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { SocialChat, ChatType } from '../schemas/social-chat.schema';
import { SocialMessage, MessageType, MessageStatus } from '../schemas/social-message.schema';
import { User } from '../schemas/user.schema';
import { CoreNotificationService } from './core-notification.service';
import { CreateSocialMessageDto } from '../dtos/social-message.dto';
import { CreateSocialChatDto } from '../dtos/social-chat.dto';

interface ReplySocialMessageDto extends CreateSocialMessageDto {
    replyToId: string;
}

@Injectable()
export class SocialChatService {
    private readonly logger = new Logger(SocialChatService.name);
    private supabase: SupabaseClient;

    constructor(
        @InjectModel(SocialMessage.name) private messageModel: Model<SocialMessage>,
        @InjectModel(SocialChat.name) private chatModel: Model<SocialChat>,
        @InjectModel(User.name) private userModel: Model<User>,
        private configService: ConfigService,
        private coreNotificationService: CoreNotificationService
    ) {
        this.supabase = createClient(
            this.configService.get('SUPABASE_URL'),
            this.configService.get('SUPABASE_SERVICE_KEY')
        );

        // Set up MongoDB change streams to broadcast to Supabase
        this.initChangeStreams();
    }

    // Update in src/services/social-chat.service.ts
    private initChangeStreams() {
        // Watch for new messages
        this.messageModel.watch().on('change', async (change) => {
            try {
                if (change.operationType === 'insert') {
                    const message = await this.messageModel.findById(change.documentKey._id)
                        .populate('senderId', 'name surname notifications')
                        .lean();

                    if (!message) {
                        this.logger.warn(`Message not found for change stream: ${change.documentKey._id}`);
                        return;
                    }

                    // Broadcast to Supabase chat room
                    await this.supabase.channel(`chat:${message.chatId}`)
                        .send({
                            type: 'broadcast',
                            event: 'new_message',
                            payload: message
                        });

                    // Send push notification for the new message
                    await this.coreNotificationService.sendChatMessageNotification({
                        chatId: message.chatId.toString(),
                        messageId: message._id.toString(),
                        senderId: message.senderId.toString() // Fix here - don't assume _id is accessible
                    }).catch(err => {
                        this.logger.error(`Error sending notification for message: ${err.message}`);
                    });
                }
            } catch (error) {
                this.logger.error(`Error in change stream handler: ${error.message}`, error.stack);
            }
        });
    }

    /**
     * Create a new chat
     */
    async createChat(chatData: CreateSocialChatDto) {
        try {
            // Create the chat in MongoDB
            const chat = new this.chatModel({
                ...chatData,
                createdAt: new Date(),
                updatedAt: new Date()
            });

            await chat.save();

            // Create a Supabase channel for this chat
            await this.supabase.channel(`chat:${chat._id}`)
                .subscribe();

            return { success: true, data: chat };
        } catch (error) {
            this.logger.error(`Error creating chat: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Get messages from a chat with pagination
     */
    async getChatMessages(chatId: string, page: number = 1, limit: number = 20) {
        try {
            const skip = (page - 1) * limit;

            // Fetch messages with populated sender and reply info
            const messages = await this.messageModel.find({ chatId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('senderId', 'name surname')
                .populate('replyToId')
                .lean();

            const total = await this.messageModel.countDocuments({ chatId });

            return {
                data: messages,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                    hasNextPage: page < Math.ceil(total / limit),
                    hasPrevPage: page > 1
                }
            };
        } catch (error) {
            this.logger.error(`Error getting chat messages: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Send a new message to a chat
     */
    async sendMessage(messageData: CreateSocialMessageDto) {
        try {
            // Create message in MongoDB
            const message = new this.messageModel({
                ...messageData,
                createdAt: new Date(),
                updatedAt: new Date()
            });

            await message.save();

            // Update last message in chat
            await this.chatModel.findByIdAndUpdate(
                messageData.chatId,
                {
                    lastMessageId: message._id,
                    updatedAt: new Date()
                }
            );

            return { success: true, data: message };
        } catch (error) {
            this.logger.error(`Error sending message: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Forward a message to another chat
     */
    async forwardMessage(messageId: string, toChatId: string, userId: string) {
        try {
            const originalMessage = await this.messageModel.findById(messageId);

            if (!originalMessage) {
                throw new Error('Original message not found');
            }

            const forwardedMessage = new this.messageModel({
                senderId: userId,
                chatId: toChatId,
                content: originalMessage.content,
                type: originalMessage.type,
                forwardedFromId: messageId,
                clientId: originalMessage.clientId,
                createdAt: new Date(),
                updatedAt: new Date()
            });

            await forwardedMessage.save();

            // Update last message in chat
            await this.chatModel.findByIdAndUpdate(
                toChatId,
                {
                    lastMessageId: forwardedMessage._id,
                    updatedAt: new Date()
                }
            );

            return { success: true, data: forwardedMessage };
        } catch (error) {
            this.logger.error(`Error forwarding message: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Reply to a message
     */
    async replyToMessage(replyData: ReplySocialMessageDto) {
        try {
            const reply = new this.messageModel({
                ...replyData,
                replyToId: replyData.replyToId,
                createdAt: new Date(),
                updatedAt: new Date()
            });

            await reply.save();

            // Update last message in chat
            await this.chatModel.findByIdAndUpdate(
                replyData.chatId,
                {
                    lastMessageId: reply._id,
                    updatedAt: new Date()
                }
            );

            return { success: true, data: reply };
        } catch (error) {
            this.logger.error(`Error replying to message: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Mark a message as read by a user
     */
    async markMessageAsRead(messageId: string, userId: string) {
        try {
            const result = await this.messageModel.findByIdAndUpdate(
                messageId,
                {
                    $addToSet: {
                        readReceipts: {
                            userId,
                            status: MessageStatus.READ,
                            timestamp: new Date()
                        }
                    }
                },
                { new: true }
            );

            return { success: true, data: result };
        } catch (error) {
            this.logger.error(`Error marking message as read: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Delete a message (soft delete)
     */
    async deleteMessage(messageId: string, userId: string) {
        try {
            const message = await this.messageModel.findById(messageId);

            if (!message) {
                throw new Error('Message not found');
            }

            // Check if user is the sender
            if (message.senderId.toString() !== userId) {
                throw new Error('Only the sender can delete this message');
            }

            // Soft delete
            message.isActive = false;
            message.metadata = {
                ...message.metadata,
                deletedAt: new Date()
            };
            await message.save();

            // Broadcast deletion through Supabase
            await this.supabase.channel(`chat:${message.chatId}`)
                .send({
                    type: 'broadcast',
                    event: 'message_deleted',
                    payload: { messageId: message._id }
                });

            return { success: true };
        } catch (error) {
            this.logger.error(`Error deleting message: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Get chat details including participants
     */
    async getChatById(chatId: string) {
        try {
            const chat = await this.chatModel.findById(chatId)
                .populate('participants', 'name surname')
                .populate('lastMessageId')
                .lean();

            if (!chat) {
                throw new Error('Chat not found');
            }

            return { success: true, data: chat };
        } catch (error) {
            this.logger.error(`Error getting chat: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Get all chats for a user
     */
    async getUserChats(userId: string, clientId: string) {
        try {
            const chats = await this.chatModel.find({
                participants: { $in: [userId] },
                clientId: clientId,
                isActive: true
            })
                .populate('participants', 'name surname')
                .populate('lastMessageId')
                .sort({ updatedAt: -1 })
                .lean();

            return { success: true, data: chats };
        } catch (error) {
            this.logger.error(`Error getting user chats: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Update a chat (rename, add/remove participants)
     */
    async updateChat(chatId: string, updateData: Partial<SocialChat>) {
        try {
            const updatedChat = await this.chatModel.findByIdAndUpdate(
                chatId,
                {
                    $set: {
                        ...updateData,
                        updatedAt: new Date()
                    }
                },
                { new: true }
            )
                .populate('participants', 'name surname')
                .lean();

            if (!updatedChat) {
                throw new Error('Chat not found');
            }

            // Broadcast chat update through Supabase
            await this.supabase.channel(`chat:${chatId}`)
                .send({
                    type: 'broadcast',
                    event: 'chat_updated',
                    payload: updatedChat
                });

            return { success: true, data: updatedChat };
        } catch (error) {
            this.logger.error(`Error updating chat: ${error.message}`, error.stack);
            throw error;
        }
    }
}