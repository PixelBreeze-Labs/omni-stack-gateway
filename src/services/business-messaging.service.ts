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
import { AuditLogService } from './audit-log.service';
import { AuditAction, AuditSeverity, ResourceType } from 'src/schemas/audit-log.schema';
import { StaffluentOneSignalService } from './staffluent-onesignal.service';

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
    private readonly businessService: BusinessService,
    private readonly auditLogService: AuditLogService,
    private readonly oneSignalService: StaffluentOneSignalService

  ) {}

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
    },
    req?: any
): Promise<SendMessageResponse & { notificationResult?: any }> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');

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

        // Get business info for notification
        const business = await this.businessModel.findById(businessId).lean();
        if (!business) {
            throw new NotFoundException('Business not found');
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

        // 🚀 NEW: Send OneSignal notification to app client
        let notificationResult;
        try {
            notificationResult = await this.sendMessageNotificationToClient(
                message, 
                appClient, 
                business
            );
        } catch (notificationError) {
            // Don't fail the message sending if notification fails
            this.logger.error(`Notification failed but message sent: ${notificationError.message}`);
            notificationResult = { 
                success: false, 
                error: notificationError.message 
            };
        }

        // Log message sent (existing audit log)
        await this.auditLogService.createAuditLog({
            businessId,
            userId: senderUserId,
            action: AuditAction.MESSAGE_SENT,
            resourceType: ResourceType.MESSAGE,
            resourceId: message._id.toString(),
            resourceName: `Message to ${appClient.name}`,
            success: true,
            severity: AuditSeverity.LOW,
            ipAddress,
            userAgent,
            metadata: {
                conversationId,
                messageType,
                recipientClientId: appClientId,
                recipientClientName: appClient.name,
                recipientEmail: appClient.email,
                contentLength: content.length,
                hasAttachment: !!fileData,
                fileData: fileData ? {
                    fileName: fileData.fileName,
                    fileSize: fileData.fileSize,
                    mimeType: fileData.mimeType
                } : undefined,
                // ✅ ADD NOTIFICATION RESULT TO AUDIT
                notificationSent: notificationResult?.success || false,
                notificationError: notificationResult?.oneSignalError
            }
        });

        this.logger.log(`Message sent from business ${businessId} to client ${appClientId}`);

        return {
            messageId: message._id.toString(),
            conversationId,
            success: true,
            timestamp: message.createdAt,
            notificationResult // ✅ RETURN NOTIFICATION RESULT
        };
    } catch (error) {
        // Existing error handling...
        await this.auditLogService.createAuditLog({
            businessId,
            userId: senderUserId,
            action: AuditAction.MESSAGE_SENT,
            resourceType: ResourceType.MESSAGE,
            resourceName: `Failed message to client ${appClientId}`,
            success: false,
            errorMessage: error.message,
            severity: AuditSeverity.MEDIUM,
            ipAddress,
            userAgent,
            metadata: {
                recipientClientId: appClientId,
                messageType,
                contentLength: content.length,
                errorReason: error.name
            }
        });

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
    limit: number = 50,
    userId?: string,
    req?: any
): Promise<ConversationResponse> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');

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

        // Log conversation access
        await this.auditLogService.createAuditLog({
            businessId,
            userId,
            action: AuditAction.CONVERSATION_ACCESSED,
            resourceType: ResourceType.CONVERSATION,
            resourceId: conversationId,
            resourceName: `Conversation with ${appClient.name}`,
            success: true,
            severity: AuditSeverity.LOW,
            ipAddress,
            userAgent,
            metadata: {
                conversationId,
                clientId: appClientId,
                clientName: appClient.name,
                clientEmail: appClient.email,
                messagesRetrieved: messages.length,
                totalMessages: total,
                page,
                limit
            }
        });

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
  messageIds?: string[],
  userId?: string,
  req?: any
): Promise<{ success: boolean; markedCount: number }> {
  const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
  const userAgent = req?.get('User-Agent');

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

      // Get client info for audit
      const appClient = await this.appClientModel.findOne({
          _id: appClientId,
          businessId: businessId
      }).lean();

      // Log messages marked as read
      await this.auditLogService.createAuditLog({
          businessId,
          userId,
          action: AuditAction.MESSAGE_READ,
          resourceType: ResourceType.MESSAGE,
          resourceName: `Messages from ${appClient?.name || 'Unknown Client'}`,
          success: true,
          severity: AuditSeverity.LOW,
          ipAddress,
          userAgent,
          metadata: {
              clientId: appClientId,
              clientName: appClient?.name,
              messagesMarkedAsRead: result.modifiedCount,
              specificMessageIds: messageIds,
              markAllUnread: !messageIds || messageIds.length === 0
          }
      });

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
 * Send OneSignal notification to app client when business sends message
 */
private async sendMessageNotificationToClient(
    message: BusinessClientMessage,
    appClient: any,
    business: any
  ): Promise<{
    success: boolean;
    debugInfo?: any;
    oneSignalError?: string;
    oneSignalDetails?: any;
  }> {
    const debugInfo: any = {
      timestamp: new Date().toISOString(),
      messageId: message._id.toString(),
      businessId: message.businessId,
      appClientId: message.appClientId,
      steps: []
    };
  
    try {
      // Step 1: Configuration check
      const configCheck = {
        oneSignalConfigured: this.oneSignalService.isConfigured(),
        oneSignalStatus: this.oneSignalService.getStatus(),
      };
      debugInfo.steps.push({ step: 'config_check', result: configCheck });
  
      if (!this.oneSignalService.isConfigured()) {
        const error = 'OneSignal not configured - missing APP_ID or API_KEY';
        debugInfo.steps.push({ step: 'onesignal_skipped', result: { reason: error } });
        this.logger.warn('OneSignal not configured - skipping push notification');
        return { success: false, debugInfo, oneSignalError: error };
      }
  
      // Step 2: Get app client user info
      if (!appClient.user_id) {
        const error = 'App client has no userId for OneSignal targeting';
        debugInfo.steps.push({ step: 'user_id_missing', result: { reason: error } });
        return { success: false, debugInfo, oneSignalError: error };
      }
  
      const clientUserInfo = {
        userId: appClient.user_id,
        businessId: message.businessId,
        clientName: appClient.name,
        clientEmail: appClient.email
      };
      debugInfo.steps.push({ step: 'client_user_lookup', result: 'SUCCESS', clientInfo: clientUserInfo });
  
      // Step 3: Prepare notification content
      const title = `New Message from ${business.name}`;
      const body = message.content.length > 100 
        ? `${message.content.substring(0, 97)}...` 
        : message.content;
  
      const actionData = {
        type: 'business_message',
        entityId: message._id.toString(),
        entityType: 'message',
        conversationId: message.conversationId,
        businessId: message.businessId,
        url: `https://app.staffluent.co/client-portal/dashboard`
      };
  
      const notificationContent = { title, body, actionData };
      debugInfo.steps.push({ step: 'notification_content_prepared', result: notificationContent });
  
      // Step 4: Send OneSignal notification to app client
let oneSignalError: string | undefined;
let oneSignalDetails: any;

try {
  // 🔧 CORRECT: Structure options to match sendToSpecificUser expectations
  const notificationOptions = {
    data: {
      type: 'business_message',
      messageId: message._id.toString(),
      conversationId: message.conversationId,
      businessId: message.businessId,
      businessName: business.name,
      entityId: message._id.toString(),
      entityType: 'message'
    },
    url: actionData.url,
    priority: 7,
    buttons: [
      { id: 'view_message', text: 'View Message' },
      { id: 'reply', text: 'Reply' }
    ]
  };

  debugInfo.steps.push({ 
    step: 'onesignal_payload_prepared', 
    result: { 
      businessId: message.businessId,
      targetUserId: appClient.user_id,
      title, 
      body, 
      options: notificationOptions 
    } 
  });

  // 🔧 CORRECT: Pass title, body, and options separately
  const oneSignalResult = await this.oneSignalService.sendToSpecificUser(
    message.businessId,
    appClient.user_id,
    title,                    // ✅ Goes to headings.en
    body,                     // ✅ Goes to contents.en (your description)
    notificationOptions       // ✅ Correctly structured options
  );

  oneSignalDetails = oneSignalResult;
  debugInfo.steps.push({ 
    step: 'onesignal_notification_sent', 
    result: { success: true, oneSignalResult } 
  });
  
  this.logger.log(`OneSignal message notification sent to client ${appClient.user_id}: ${oneSignalResult?.id}`);

} catch (oneSignalErr: any) {
  oneSignalError = oneSignalErr.message;
  oneSignalDetails = {
    error: oneSignalErr.message,
    response: oneSignalErr.response?.data,
    status: oneSignalErr.response?.status,
    statusText: oneSignalErr.response?.statusText
  };

  debugInfo.steps.push({ 
    step: 'onesignal_notification_failed', 
    result: oneSignalDetails 
  });

  this.logger.error(`OneSignal message notification failed for client ${appClient.user_id}: ${oneSignalErr.message}`);
}
  
      // Final summary
      debugInfo.summary = {
        oneSignalNotification: oneSignalError ? 'FAILED' : 'SUCCESS',
        overallSuccess: !oneSignalError
      };
  
      this.logger.log(`Sent message notification to app client ${appClient.user_id} for message ${message._id}`);
  
      return { 
        success: !oneSignalError, 
        debugInfo,
        oneSignalError, 
        oneSignalDetails
      };
  
    } catch (error: any) {
      debugInfo.steps.push({ 
        step: 'major_error', 
        result: { 
          error: error.message, 
          stack: error.stack?.split('\n').slice(0, 5).join('\n') 
        } 
      });
  
      this.logger.error(`Error sending message notification: ${error.message}`, error.stack);
      return { 
        success: false, 
        debugInfo,
        oneSignalError: `Major error: ${error.message}` 
      };
    }
  }

  private extractIpAddress(req: any): string {
    return (
        req?.headers?.['x-forwarded-for'] ||
        req?.headers?.['x-real-ip'] ||
        req?.connection?.remoteAddress ||
        req?.socket?.remoteAddress ||
        'unknown'
    ).split(',')[0].trim();
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