// src/services/chat.service.ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Chat, ChatStatus, ChatType } from '../schemas/chat.schema';
import { Client } from '../schemas/client.schema';
import { VenueBoostService } from './venueboost.service';

interface FindAllOptions {
    page: number;
    limit: number;
    search?: string;
    status?: ChatStatus;
    type?: ChatType;
}

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);

    constructor(
        @InjectModel(Chat.name) private chatModel: Model<Chat>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        private readonly venueBoostService: VenueBoostService
    ) {}

    /**
     * Find all chats with filtering and pagination
     */
    async findAll(clientId: string, options: FindAllOptions) {
        try {
            const { page, limit, search, status, type } = options;
            const skip = (page - 1) * limit;

            // Build the filter
            const filter: any = { clientId };

            // Add status filter if provided
            if (status) {
                filter.status = status;
            }

            // Add type filter if provided
            if (type) {
                filter.type = type;
            }

            // Add search filter if provided
            if (search) {
                filter.$or = [
                    { endUserName: { $regex: search, $options: 'i' } },
                    { endUserEmail: { $regex: search, $options: 'i' } },
                    { 'lastMessage.content': { $regex: search, $options: 'i' } }
                ];
            }

            // Execute the query with pagination
            const [chats, total] = await Promise.all([
                this.chatModel
                    .find(filter)
                    .sort({ 'lastMessage.createdAt': -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                this.chatModel.countDocuments(filter)
            ]);

            // Calculate pagination metadata
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPrevPage = page > 1;

            return {
                data: chats,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                    hasNextPage,
                    hasPrevPage
                }
            };
        } catch (error) {
            this.logger.error(`Error finding chats: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Find a chat by ID
     */
    async findById(clientId: string, id: string) {
        const chat = await this.chatModel.findOne({
            _id: id,
            clientId
        }).lean();

        if (!chat) {
            throw new NotFoundException('Chat not found');
        }

        return { data: chat };
    }

    /**
     * Sync chats from VenueBoost for a client
     */
    async syncChatsFromVenueBoost(clientId: string): Promise<{
        success: boolean;
        message: string;
        created: number;
        updated: number;
        unchanged: number;
        errors: number;
        errorDetails?: Array<{chatId: string, error: string}>;
    }> {
        try {
            // Get the client
            const client = await this.clientModel.findById(clientId);
            if (!client) {
                throw new NotFoundException('Client not found');
            }

            // Get chats from VenueBoost
            const response = await this.venueBoostService.listChats(clientId);
            const chats = response.data || [];

            // Tracking stats
            let created = 0, updated = 0, unchanged = 0, errors = 0;
            const errorDetails = [];

            // Process each chat
            for (const vbChat of chats) {
                try {
                    // Check if the chat already exists in our system
                    const existingChat = await this.chatModel.findOne({
                        'externalIds.venueboostId': vbChat.id.toString()
                    });

                    // Map status from VenueBoost to our enum
                    const chatStatus = this.mapVenueBoostStatusToChatStatus(vbChat.status);

                    // Map type from VenueBoost to our enum
                    const chatType = this.mapVenueBoostTypeToChatType(vbChat.type);

                    if (existingChat) {
                        // Chat exists - check if it needs to be updated
                        let needsUpdate = false;

                        if (existingChat.status !== chatStatus) {
                            existingChat.status = chatStatus;
                            needsUpdate = true;
                        }

                        if (existingChat.endUserName !== vbChat.end_user_name) {
                            existingChat.endUserName = vbChat.end_user_name;
                            needsUpdate = true;
                        }

                        if (existingChat.endUserEmail !== vbChat.end_user_email) {
                            existingChat.endUserEmail = vbChat.end_user_email;
                            needsUpdate = true;
                        }

                        if (existingChat.messageCount !== vbChat.message_count) {
                            existingChat.messageCount = vbChat.message_count;
                            needsUpdate = true;
                        }

                        if (existingChat.unreadCount !== vbChat.unread_count) {
                            existingChat.unreadCount = vbChat.unread_count;
                            needsUpdate = true;
                        }

                        // Update metadata fields
                        if (!existingChat.metadata) {
                            existingChat.metadata = new Map<string, any>();
                        }

                        // Update endUserId in metadata
                        if (existingChat.metadata.get('endUserId') !== vbChat.end_user_id) {
                            existingChat.metadata.set('endUserId', vbChat.end_user_id);
                            needsUpdate = true;
                        }

                        // Update venueUserId in metadata
                        if (existingChat.metadata.get('venueUserId') !== vbChat.venue_user_id) {
                            existingChat.metadata.set('venueUserId', vbChat.venue_user_id);
                            needsUpdate = true;
                        }

                        // Update venueId in metadata
                        if (existingChat.metadata.get('venueId') !== vbChat.venue_id) {
                            existingChat.metadata.set('venueId', vbChat.venue_id);
                            needsUpdate = true;
                        }

                        // Update vbBookingId in metadata
                        if (existingChat.metadata.get('vbBookingId') !== vbChat.booking_id) {
                            existingChat.metadata.set('vbBookingId', vbChat.booking_id);
                            needsUpdate = true;
                        }

                        // Update last message if it exists
                        if (vbChat.last_message) {
                            if (!existingChat.lastMessage ||
                                existingChat.lastMessage.createdAt.toString() !== new Date(vbChat.last_message.created_at).toString()) {
                                existingChat.lastMessage = {
                                    content: vbChat.last_message.content,
                                    type: vbChat.last_message.type,
                                    senderId: vbChat.last_message.sender_id,
                                    createdAt: new Date(vbChat.last_message.created_at)
                                };
                                needsUpdate = true;
                            }
                        }

                        if (needsUpdate) {
                            await existingChat.save();
                            updated++;
                        } else {
                            unchanged++;
                        }

                        // Check if we need to update the external ID in VenueBoost
                        const vbExternalIds = vbChat.external_ids || {};
                        if (!vbExternalIds.omniStackId || vbExternalIds.omniStackId !== existingChat._id.toString()) {
                            // Send our ID to VenueBoost
                            await this.venueBoostService.updateChatExternalId(
                                clientId,
                                vbChat.id.toString(),
                                existingChat._id.toString()
                            );
                        }
                    } else {
                        // Chat doesn't exist - create it
                        const newChat = await this.chatModel.create({
                            clientId,
                            endUserName: vbChat.end_user_name,
                            endUserEmail: vbChat.end_user_email,
                            bookingId: null, // We'll need to look up the corresponding booking in OmniStack if needed
                            status: chatStatus,
                            type: chatType,
                            messageCount: vbChat.message_count || 0,
                            unreadCount: vbChat.unread_count || 0,
                            externalIds: {
                                venueboostId: vbChat.id.toString()
                            },
                            // Store the fields as metadata instead of direct fields
                            metadata: new Map([
                                ['endUserId', vbChat.end_user_id],
                                ['venueUserId', vbChat.venue_user_id],
                                ['venueId', vbChat.venue_id],
                                ['vbBookingId', vbChat.booking_id]
                            ])
                        });

                        // If there's a last message, add it
                        if (vbChat.last_message) {
                            newChat.lastMessage = {
                                content: vbChat.last_message.content,
                                type: vbChat.last_message.type,
                                senderId: vbChat.last_message.sender_id,
                                createdAt: new Date(vbChat.last_message.created_at)
                            };
                            await newChat.save();
                        }

                        // Send our ID to VenueBoost
                        await this.venueBoostService.updateChatExternalId(
                            clientId,
                            vbChat.id.toString(),
                            newChat._id.toString()
                        );

                        created++;
                    }
                } catch (error) {
                    const errorMsg = `Error processing chat: ${error.message}`;
                    this.logger.error(`Error processing chat ${vbChat.id}: ${error.message}`);
                    errorDetails.push({ chatId: vbChat.id.toString(), error: errorMsg });
                    errors++;
                }
            }

            return {
                success: true,
                message: `Sync completed: ${created} created, ${updated} updated, ${unchanged} unchanged, ${errors} errors`,
                created,
                updated,
                unchanged,
                errors,
                errorDetails
            };
        } catch (error) {
            this.logger.error(`Error syncing chats from VenueBoost: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Delete a chat
     */
    async deleteChat(clientId: string, chatId: string): Promise<{ success: boolean; message: string }> {
        try {
            // Find the chat to get VenueBoost ID
            const chat = await this.chatModel.findOne({
                _id: chatId,
                clientId
            });

            if (!chat) {
                return {
                    success: false,
                    message: 'Chat not found or does not belong to this client'
                };
            }

            // Check if this chat has VenueBoost integration
            if (chat.externalIds?.venueboostId) {
                // Delete in VenueBoost first
                const vbResult = await this.venueBoostService.deleteChat(
                    clientId,
                    chat.externalIds.venueboostId
                );

                // If VenueBoost deletion fails with something other than "not found", stop the process
                if (!vbResult.success && vbResult.statusCode !== 404) {
                    return {
                        success: false,
                        message: `Failed to delete chat in VenueBoost: ${vbResult.message}`
                    };
                }
            }

            // Don't actually delete the chat from our database, just mark it as deleted
            chat.status = ChatStatus.DELETED;
            await chat.save();

            return {
                success: true,
                message: 'Chat marked as deleted successfully'
            };
        } catch (error) {
            this.logger.error(`Error deleting chat: ${error.message}`, error.stack);
            return {
                success: false,
                message: `Error deleting chat: ${error.message}`
            };
        }
    }

    /**
     * Map VenueBoost status to ChatStatus enum
     */
    private mapVenueBoostStatusToChatStatus(vbStatus: string): ChatStatus {
        switch (vbStatus?.toLowerCase()) {
            case 'active':
                return ChatStatus.ACTIVE;
            case 'archived':
                return ChatStatus.ARCHIVED;
            case 'deleted':
                return ChatStatus.DELETED;
            default:
                return ChatStatus.ACTIVE;
        }
    }

    /**
     * Map VenueBoost type to ChatType enum
     */
    private mapVenueBoostTypeToChatType(vbType: string): ChatType {
        switch (vbType?.toLowerCase()) {
            case 'order':
                return ChatType.ORDER;
            case 'booking':
                return ChatType.BOOKING;
            case 'staff':
                return ChatType.STAFF;
            case 'client':
                return ChatType.CLIENT;
            default:
                return ChatType.CLIENT;
        }
    }
}