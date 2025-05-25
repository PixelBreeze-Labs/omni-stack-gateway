// src/services/business-messaging.service.ts
import { Injectable, Logger, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BusinessClientMessage, MessageSender, MessageType, MessageStatus } from '../schemas/business-client-message.schema';
import { Business } from '../schemas/business.schema';
import { AppClient } from '../schemas/app-client.schema';
import { User } from '../schemas/user.schema';
import { v4 as uuidv4 } from 'uuid';
import { BusinessService } from './business.service';

// Export interfaces for TypeScript
export interface SendMessageResponse {
  messageId: string;
  conversationId: string;
  success: boolean;
  timestamp: Date;
}

export interface ConversationResponse {
  messages: BusinessClientMessage[];
  total: number;
  page: number;
  limit: number;
  success: boolean;
  conversationId: string;
  clientInfo: {
    id: string;
    name: string;
    email?: string;
    type: string;
  };
}

export interface ConversationsListResponse {
  conversations: Array<{
    conversationId: string;
    appClientId: string;
    clientInfo: {
      id: string;
      name: string;
      email?: string;
      type: string;
    };
    lastMessage: {
      content: string;
      sender: MessageSender;
      timestamp: Date;
      messageType: MessageType;
    };
    unreadCount: number;
    totalMessages: number;
  }>;
  total: number;
  page: number;
  limit: number;
  success: boolean;
}

export interface MessageStatusResponse {
  success: boolean;
  messageId: string;
  status: MessageStatus;
}

@Injectable()
export class BusinessMessagingService {
  private readonly logger = new Logger(BusinessMessagingService.name);

  constructor(
    @InjectModel(BusinessClientMessage.name) private messageModel: Model<BusinessClientMessage>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(AppClient.name) private appClientModel: Model<AppClient>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly businessService: BusinessService
  ) {}

  /**
   * Send a message from business to client
   */
  async sendMessageToClient(
    businessId: string,
    appClientId: string,
    content: string,
    messageType: MessageType = MessageType.TEXT,
    senderUserId?: string,
    fileData?: {
      fileName: string;
      fileUrl: string;
      fileSize: number;
      mimeType: string;
    }
  ): Promise<SendMessageResponse> {
    try {
      // Verify the app client belongs to this business
      const appClient = await this.appClientModel.findOne({
        _id: appClientId,
        businessId: businessId,
        is_active: true
      }).lean();

      if (!appClient) {
        throw new NotFoundException('Client not found or does not belong to this business');
      }

      // Get or create conversation ID
      const conversationId = await this.getOrCreateConversationId(businessId, appClientId);

      // Create the message
      const message = new this.messageModel({
        businessId,
        appClientId,
        clientId: appClient.clientId,
        sender: MessageSender.BUSINESS,
        content,
        messageType,
        conversationId,
        senderUserId,
        status: MessageStatus.SENT,
        deliveredAt: new Date(),
        ...fileData
      });

      await message.save();

      this.logger.log(`Message sent from business ${businessId} to client ${appClientId}`);

      return {
        messageId: message._id.toString(),
        conversationId,
        success: true,
        timestamp: message.createdAt
      };
    } catch (error) {
      this.logger.error(`Error sending message: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get conversation history between business and client
   */
  async getConversation(
    businessId: string,
    appClientId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<ConversationResponse> {
    try {
      // Verify the app client belongs to this business
      const appClient = await this.appClientModel.findOne({
        _id: appClientId,
        businessId: businessId,
        is_active: true
      }).lean();

      if (!appClient) {
        throw new NotFoundException('Client not found or does not belong to this business');
      }

      const conversationId = await this.getOrCreateConversationId(businessId, appClientId);
      
      const query = {
        businessId,
        appClientId,
        conversationId,
        isDeleted: false
      };

      const total = await this.messageModel.countDocuments(query);
      const skip = (page - 1) * limit;

      const messages = await this.messageModel
        .find(query)
        .sort({ createdAt: 1 }) // Chronological order
        .skip(skip)
        .limit(limit)
        .populate('senderUserId', 'name email')
        .exec();

      return {
        messages,
        total,
        page,
        limit,
        success: true,
        conversationId,
        clientInfo: {
          id: appClient._id.toString(),
          name: appClient.name,
          email: appClient.email,
          type: appClient.type
        }
      };
    } catch (error) {
      this.logger.error(`Error getting conversation: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get list of all conversations for a business
   */
  async getConversationsList(
    businessId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<ConversationsListResponse> {
    try {
      const skip = (page - 1) * limit;

      // Get all app clients for this business that have messages
      const conversationsAgg = await this.messageModel.aggregate([
        {
          $match: {
            businessId: businessId,
            isDeleted: false
          }
        },
        {
          $sort: { createdAt: -1 }
        },
        {
          $group: {
            _id: {
              conversationId: "$conversationId",
              appClientId: "$appClientId"
            },
            lastMessage: { $first: "$$ROOT" },
            totalMessages: { $sum: 1 },
            unreadCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$sender", MessageSender.CLIENT] },
                      { $eq: ["$status", MessageStatus.DELIVERED] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $sort: { "lastMessage.createdAt": -1 }
        },
        {
          $skip: skip
        },
        {
          $limit: limit
        }
      ]);

      // Get client info for each conversation
      const conversations = await Promise.all(
        conversationsAgg.map(async (conv) => {
          const appClient = await this.appClientModel.findById(conv._id.appClientId).lean();
          
          return {
            conversationId: conv._id.conversationId,
            appClientId: conv._id.appClientId,
            clientInfo: {
              id: appClient._id.toString(),
              name: appClient.name,
              email: appClient.email,
              type: appClient.type
            },
            lastMessage: {
              content: conv.lastMessage.content,
              sender: conv.lastMessage.sender,
              timestamp: conv.lastMessage.createdAt,
              messageType: conv.lastMessage.messageType
            },
            unreadCount: conv.unreadCount,
            totalMessages: conv.totalMessages
          };
        })
      );

      // Get total count of conversations
      const totalAgg = await this.messageModel.aggregate([
        {
          $match: {
            businessId: businessId,
            isDeleted: false
          }
        },
        {
          $group: {
            _id: {
              conversationId: "$conversationId",
              appClientId: "$appClientId"
            }
          }
        },
        {
          $count: "total"
        }
      ]);

      const total = totalAgg.length > 0 ? totalAgg[0].total : 0;

      return {
        conversations,
        total,
        page,
        limit,
        success: true
      };
    } catch (error) {
      this.logger.error(`Error getting conversations list: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(
    businessId: string,
    appClientId: string,
    messageIds?: string[]
  ): Promise<{ success: boolean; markedCount: number }> {
    try {
      const query: any = {
        businessId,
        appClientId,
        sender: MessageSender.CLIENT, // Only mark client messages as read
        status: { $ne: MessageStatus.READ }
      };

      if (messageIds && messageIds.length > 0) {
        query._id = { $in: messageIds };
      }

      const result = await this.messageModel.updateMany(
        query,
        {
          $set: {
            status: MessageStatus.READ,
            readAt: new Date()
          }
        }
      );

      return {
        success: true,
        markedCount: result.modifiedCount
      };
    } catch (error) {
      this.logger.error(`Error marking messages as read: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get unread message count for business
   */
  async getUnreadMessageCount(businessId: string, appClientId?: string): Promise<number> {
    try {
      const query: any = {
        businessId,
        sender: MessageSender.CLIENT,
        status: { $ne: MessageStatus.READ },
        isDeleted: false
      };

      if (appClientId) {
        query.appClientId = appClientId;
      }

      return await this.messageModel.countDocuments(query);
    } catch (error) {
      this.logger.error(`Error getting unread count: ${error.message}`, error.stack);
      return 0;
    }
  }

  /**
   * Delete a message (soft delete)
   */
  async deleteMessage(
    businessId: string,
    messageId: string
  ): Promise<{ success: boolean }> {
    try {
      const result = await this.messageModel.updateOne(
        {
          _id: messageId,
          businessId,
          sender: MessageSender.BUSINESS // Only allow business to delete their own messages
        },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date()
          }
        }
      );

      return { success: result.modifiedCount > 0 };
    } catch (error) {
      this.logger.error(`Error deleting message: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Validate business API key
   */
  async validateBusinessApiKey(businessId: string, apiKey: string): Promise<Business> {
    if (!apiKey) {
      throw new UnauthorizedException('Business API key missing');
    }
    
    const business = await this.businessService.findByIdAndApiKey(businessId, apiKey);
    if (!business) {
      throw new UnauthorizedException('Invalid API key for this business');
    }
    
    return business;
  }

  /**
   * Get or create conversation ID for business-client pair
   */
  private async getOrCreateConversationId(businessId: string, appClientId: string): Promise<string> {
    // Check if conversation already exists
    const existingMessage = await this.messageModel
      .findOne({
        businessId,
        appClientId
      })
      .sort({ createdAt: 1 })
      .lean();

    if (existingMessage) {
      return existingMessage.conversationId;
    }

    // Create new conversation ID
    return uuidv4();
  }

  /**
   * Get conversation stats
   */
  async getConversationStats(businessId: string): Promise<{
    totalConversations: number;
    totalUnreadMessages: number;
    activeConversationsToday: number;
    averageResponseTime?: number;
  }> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Total conversations
      const totalConversationsAgg = await this.messageModel.aggregate([
        { $match: { businessId: businessId, isDeleted: false } },
        { $group: { _id: "$conversationId" } },
        { $count: "total" }
      ]);
      const totalConversations = totalConversationsAgg.length > 0 ? totalConversationsAgg[0].total : 0;

      // Total unread messages
      const totalUnreadMessages = await this.getUnreadMessageCount(businessId);

      // Active conversations today
      const activeConversationsTodayAgg = await this.messageModel.aggregate([
        { 
          $match: { 
            businessId: businessId, 
            isDeleted: false,
            createdAt: { $gte: today }
          } 
        },
        { $group: { _id: "$conversationId" } },
        { $count: "total" }
      ]);
      const activeConversationsToday = activeConversationsTodayAgg.length > 0 ? activeConversationsTodayAgg[0].total : 0;

      return {
        totalConversations,
        totalUnreadMessages,
        activeConversationsToday
      };
    } catch (error) {
      this.logger.error(`Error getting conversation stats: ${error.message}`, error.stack);
      throw error;
    }
  }
}