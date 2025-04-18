// src/services/social-chat.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
import { ChatGateway } from '../gateways/chat.gateway';

interface ReplySocialMessageDto extends CreateSocialMessageDto {
    replyToId: string;
}

@Injectable()
export class SocialChatService implements OnModuleInit {
    private readonly logger = new Logger(SocialChatService.name);
    private supabase: SupabaseClient;
    private realtimeEnabled = false;
    private channelStore = {};

    constructor(
        @InjectModel(SocialMessage.name) private messageModel: Model<SocialMessage>,
        @InjectModel(SocialChat.name) private chatModel: Model<SocialChat>,
        @InjectModel(User.name) private userModel: Model<User>,
        private configService: ConfigService,
        private coreNotificationService: CoreNotificationService,
        private chatGateway: ChatGateway // Inject the chat gateway
    ) {
        // Initialize Supabase client
        const supabaseUrl = this.configService.get('SUPABASE_URL');
        const supabaseKey = this.configService.get('SUPABASE_SERVICE_KEY');

        if (!supabaseUrl || !supabaseKey) {
            this.logger.error('Missing Supabase credentials in environment variables');
            return;
        }

        try {
            this.supabase = createClient(supabaseUrl, supabaseKey, {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            });
            this.logger.log('Supabase client initialized');
        } catch (error) {
            this.logger.error(`Failed to initialize Supabase client: ${error.message}`, error.stack);
        }
    }

    async onModuleInit() {
        // Check if Supabase is enabled in config
        const enableRealtime = this.configService.get('ENABLE_SUPABASE_REALTIME');
        this.realtimeEnabled = enableRealtime === 'true';

        // Initialize MongoDB change streams
        this.initChangeStreams();

        // Log status
        if (this.realtimeEnabled) {
            this.logger.log('Supabase Realtime is ENABLED');

            // Test the Realtime connection
            await this.testRealtimeConnection();
        } else {
            this.logger.warn('Supabase Realtime is DISABLED - using Socket.io and push notifications');
        }
    }

    /**
     * Test the Realtime connection by sending a test message
     */
    private async testRealtimeConnection() {
        try {
            // Create a test channel
            const testChannel = this.supabase.channel('test');

            // Subscribe to the test channel
            testChannel.subscribe((status) => {
                this.logger.log(`Test channel status: ${status}`);

                if (status === 'SUBSCRIBED') {
                    this.logger.log('Successfully connected to Supabase Realtime!');

                    // Send a test message
                    setTimeout(async () => {
                        try {
                            const result = await testChannel.send({
                                type: 'broadcast',
                                event: 'test',
                                payload: {message: 'Test message'}
                            });

                            this.logger.log(`Test broadcast result: ${result}`);
                        } catch (error) {
                            this.logger.error(`Error sending test message: ${error.message}`);
                        }
                    }, 1000);
                }
            });
        } catch (error) {
            this.logger.error(`Error testing Realtime connection: ${error.message}`);
        }
    }

    /**
     * Broadcast a message to a chat channel
     */
    private async broadcastToChannel(chatId: string, event: string, payload: any): Promise<boolean> {
        // Always broadcast via Socket.io
        try {
            const simplifiedPayload = this.simplifyPayload(payload);
            this.chatGateway.broadcastToChat(chatId, event, simplifiedPayload);
        } catch (error) {
            this.logger.error(`❌ Error broadcasting to Socket.io: ${error.message}`);
        }

        // Additionally broadcast via Supabase if enabled
        if (!this.realtimeEnabled || !this.supabase) {
            return true; // Return true since Socket.io broadcast was attempted
        }

        try {
            // Get or create a channel for this chat
            const channelName = `chat-${chatId}`;

            if (!this.channelStore[channelName]) {
                this.channelStore[channelName] = this.supabase.channel(channelName);

                // Subscribe to the channel
                this.channelStore[channelName].subscribe((status) => {
                    this.logger.debug(`Channel ${channelName} status: ${status}`);
                });
            }

            // Prepare the simplified payload
            const simplifiedPayload = this.simplifyPayload(payload);

            // Send the broadcast message
            const result = await this.channelStore[channelName].send({
                type: 'broadcast',
                event: event,
                payload: simplifiedPayload
            });

            if (result === 'ok') {
                this.logger.debug(`✅ Successfully broadcast ${event} to ${channelName}`);
                return true;
            } else {
                this.logger.warn(`❌ Failed to broadcast to ${channelName}: ${result}`);
                return false;
            }
        } catch (error) {
            this.logger.error(`❌ Error broadcasting to channel: ${error.message}`);
            return false;
        }
    }

    /**
     * Simplify payload to avoid circular references and excessive size
     */
    private simplifyPayload(payload: any): any {
        if (!payload) return payload;

        // For messages, extract only essential fields
        if (payload._id && payload.chatId && payload.senderId) {
            return {
                id: payload._id.toString(),
                chatId: typeof payload.chatId === 'object' ? payload.chatId.toString() : payload.chatId,
                senderId: typeof payload.senderId === 'object' ?
                    (payload.senderId._id ? payload.senderId._id.toString() : payload.senderId.toString())
                    : payload.senderId,
                content: payload.content,
                type: payload.type,
                createdAt: payload.createdAt,
                // Include minimal sender info if available
                sender: payload.senderId && typeof payload.senderId === 'object' ? {
                    id: payload.senderId._id ? payload.senderId._id.toString() : null,
                    name: payload.senderId.name,
                    surname: payload.senderId.surname
                } : null
            };
        }

        // For other types, just convert any MongoDB IDs to strings
        return this.convertIdsToStrings(payload);
    }

    /**
     * Convert MongoDB ObjectIds to strings to avoid serialization issues
     */
    private convertIdsToStrings(obj: any): any {
        if (!obj || typeof obj !== 'object') return obj;

        if (Array.isArray(obj)) {
            return obj.map(item => this.convertIdsToStrings(item));
        }

        const result = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];

                // Check for MongoDB ObjectId
                if (value && value._bsontype === 'ObjectID') {
                    result[key] = value.toString();
                } else if (value && typeof value === 'object') {
                    result[key] = this.convertIdsToStrings(value);
                } else {
                    result[key] = value;
                }
            }
        }

        return result;
    }

    private initChangeStreams() {
        this.logger.log('Initializing MongoDB change streams');

        // Watch for new messages
        this.messageModel.watch().on('change', async (change) => {
            try {
                if (change.operationType === 'insert') {
                    const rawMessage = await this.messageModel.findById(change.documentKey._id).lean();

                    if (!rawMessage) {
                        this.logger.warn(`Message not found for change stream: ${change.documentKey._id}`);
                        return;
                    }

                    // Get senderId as a string before populating
                    const senderId = rawMessage.senderId.toString();
                    const chatId = rawMessage.chatId.toString();
                    const messageId = rawMessage._id.toString();

                    // Now get the populated message for broadcasting
                    const populatedMessage = await this.messageModel.findById(change.documentKey._id)
                        .populate('senderId', 'name surname notifications')
                        .lean();

                    // Broadcast to clients
                    await this.broadcastToChannel(
                        chatId,
                        'new_message',
                        populatedMessage
                    );

                    // Send push notification
                    await this.coreNotificationService.sendChatMessageNotification({
                        chatId: chatId,
                        messageId: messageId,
                        senderId: senderId
                    }).catch(err => {
                        this.logger.error(`Error sending notification for message: ${err.message}`);
                    });
                }
            } catch (error) {
                this.logger.error(`Error in change stream handler: ${error.message}`, error.stack);
            }
        });

        this.logger.log('MongoDB change streams initialized');
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

            return {success: true, data: chat};
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
            const messages = await this.messageModel.find({chatId})
                .sort({createdAt: -1})
                .skip(skip)
                .limit(limit)
                .populate('senderId', 'name surname')
                .populate('replyToId')
                .lean();

            const total = await this.messageModel.countDocuments({chatId});

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

            return {success: true, data: message};
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

            return {success: true, data: forwardedMessage};
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

            return {success: true, data: reply};
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
            const message = await this.messageModel.findById(messageId);
            if (!message) {
                throw new Error('Message not found');
            }

            const chatId = message.chatId.toString();

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
                {new: true}
            );

            // Broadcast read receipt
            await this.broadcastToChannel(
                chatId,
                'message_read',
                {messageId, userId, timestamp: new Date()}
            );

            return {success: true, data: result};
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

            // Broadcast deletion
            await this.broadcastToChannel(
                message.chatId.toString(),
                'message_deleted',
                {messageId: message._id.toString()}
            );

            return {success: true};
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

            return {success: true, data: chat};
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
                participants: {$in: [userId]},
                clientId: clientId,
                isActive: true
            })
                .populate('participants', 'name surname')
                .populate('lastMessageId')
                .sort({updatedAt: -1})
                .lean();

            return {success: true, data: chats};
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
                {new: true}
            )
                .populate('participants', 'name surname')
                .lean();

            if (!updatedChat) {
                throw new Error('Chat not found');
            }

            // Broadcast chat update
            await this.broadcastToChannel(
                chatId,
                'chat_updated',
                {
                    id: updatedChat._id.toString(),
                    name: updatedChat.name,
                    updated: new Date()
                }
            );

            return {success: true, data: updatedChat};
        } catch (error) {
            this.logger.error(`Error updating chat: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Get Realtime status
     */
    getRealtimeStatus() {
        return {
            supabase: {
                enabled: this.realtimeEnabled,
                activeChannels: Object.keys(this.channelStore).length
            },
            socketio: {
                enabled: true,
                connections: this.chatGateway.getConnectionsCount()
            }
        };
    }
}