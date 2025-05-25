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


}