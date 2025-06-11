// src/services/project-message.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProjectMessage, MessageType, MessageStatus } from '../schemas/project-message.schema';
import { AppProject } from '../schemas/app-project.schema';
import { Business } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import { AuditLogService } from './audit-log.service';
import { AppActivityService } from './app-activity.service';
import { BusinessStorageService } from './business-storage.service';
import { AuditAction, AuditSeverity, ResourceType } from '../schemas/audit-log.schema';
import { ActivityType } from '../schemas/app-activity.schema';
import {
  CreateProjectMessageDto,
  UpdateProjectMessageDto,
  UploadProjectMessageFileDto,
  MarkMessageReadDto,
  AddMessageReactionDto,
  ProjectMessageResponseDto,
  ProjectMessagesListResponseDto,
  ProjectChatStatsResponseDto
} from '../dtos/project-message.dto';

interface MessagePaginationOptions {
  page?: number;
  limit?: number;
  includeReplies?: boolean;
  parentOnly?: boolean;
  unreadOnly?: boolean;
  userId?: string; // For filtering unread messages for specific user
}

@Injectable()
export class ProjectMessageService {
  private readonly logger = new Logger(ProjectMessageService.name);

  constructor(
    @InjectModel(ProjectMessage.name) private projectMessageModel: Model<ProjectMessage>,
    @InjectModel(AppProject.name) private appProjectModel: Model<AppProject>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly auditLogService: AuditLogService,
    private readonly appActivityService: AppActivityService,
    private readonly businessStorageService: BusinessStorageService
  ) {}

  /**
   * Send a text message
   */
  async sendMessage(
    projectId: string,
    createMessageDto: CreateProjectMessageDto,
    senderId: string,
    adminUserId?: string,
    req?: any
  ): Promise<ProjectMessageResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Validate project and get business context
      const { project, business, sender } = await this.validateMessageAccess(projectId, senderId);

      // If reply, validate parent message exists
      let parentMessage = null;
      if (createMessageDto.replyToMessageId) {
        parentMessage = await this.projectMessageModel.findOne({
          _id: createMessageDto.replyToMessageId,
          appProjectId: projectId,
          isDeleted: false
        });

        if (!parentMessage) {
          throw new BadRequestException('Parent message not found or does not belong to this project');
        }
      }

      // Create message
      const message = new this.projectMessageModel({
        businessId: project.businessId,
        appProjectId: projectId,
        senderUserId: senderId,
        content: createMessageDto.content,
        messageType: MessageType.TEXT,
        replyToMessageId: createMessageDto.replyToMessageId,
        metadata: {
          ...createMessageDto.metadata,
          senderName: `${sender.name} ${sender.surname || ''}`.trim(),
          senderEmail: sender.email,
          projectName: project.name,
          isSystemMessage: false
        }
      });

      await message.save();

      // Update parent message reply count
      if (parentMessage) {
        await this.projectMessageModel.findByIdAndUpdate(
          parentMessage._id,
          { $inc: { replyCount: 1 } }
        );
      }

      // 🎯 AUDIT LOG - Business action (security/compliance)
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_MESSAGE_SENT,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.LOW,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            projectName: project.name,
            messageId: message._id.toString(),
            messageContent: createMessageDto.content.substring(0, 100) + (createMessageDto.content.length > 100 ? '...' : ''),
            senderId,
            senderName: `${sender.name} ${sender.surname || ''}`.trim(),
            isReply: !!createMessageDto.replyToMessageId,
            parentMessageId: createMessageDto.replyToMessageId,
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity (activity feed)
      const actionText = createMessageDto.replyToMessageId ? 'replied in project chat' : 'sent a message in project chat';
      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId: senderId,
        userName: `${sender.name} ${sender.surname || ''}`.trim(),
        userEmail: sender.email,
        type: ActivityType.PROJECT_MESSAGE_SENT,
        action: actionText,
        description: `${createMessageDto.content.substring(0, 100)}${createMessageDto.content.length > 100 ? '...' : ''}`,
        projectId,
        projectName: project.name,
        resourceType: 'project_message',
        resourceId: message._id.toString(),
        resourceName: 'Project chat message',
        data: {
          messageId: message._id.toString(),
          messageContent: createMessageDto.content,
          isReply: !!createMessageDto.replyToMessageId,
          parentMessageId: createMessageDto.replyToMessageId,
          projectName: project.name
        }
      });

      this.logger.log(`Message sent in project ${projectId} by user ${senderId}`);
      return this.transformMessageToResponse(message, sender);

    } catch (error) {
      // 🎯 AUDIT LOG - Error for business actions only
      if (adminUserId && this.shouldLogError(error)) {
        await this.auditLogService.createAuditLog({
          businessId: projectId, // fallback businessId
          userId: adminUserId,
          action: AuditAction.PROJECT_MESSAGE_SENT,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project message sending`,
          success: false,
          errorMessage: 'Error sending project message',
          severity: AuditSeverity.HIGH,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            senderId,
            messageContent: createMessageDto.content?.substring(0, 100),
            errorReason: this.categorizeError(error),
            errorName: error.name,
            errorMessage: error.message,
            operationDuration: Date.now() - startTime
          }
        });
      }

      this.logger.error(`Error sending message in project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Send message with file attachment
   */
  async sendMessageWithFile(
    projectId: string,
    content: string,
    fileBuffer: Buffer,
    fileName: string,
    senderId: string,
    replyToMessageId?: string,
    metadata?: Record<string, any>,
    adminUserId?: string,
    req?: any
  ): Promise<ProjectMessageResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Validate project and get business context
      const { project, business, sender } = await this.validateMessageAccess(projectId, senderId);

      // Determine file MIME type from filename
      const mimeType = this.getMimeType(fileName);
      
      // Upload file to business storage (using uploadImage which handles all file types)
      const uploadResult = await this.businessStorageService.uploadImage(
        business._id.toString(),
        fileBuffer,
        fileName,
        'project-messages',
        adminUserId,
        req
      );

      if (!uploadResult.success) {
        throw new BadRequestException('Failed to upload message file');
      }

      // Validate parent message if specified
      if (replyToMessageId) {
        const parentMessage = await this.projectMessageModel.findOne({
          _id: replyToMessageId,
          appProjectId: projectId,
          isDeleted: false
        });

        if (!parentMessage) {
          throw new BadRequestException('Parent message not found or does not belong to this project');
        }
      }

      // Determine message type based on file
      const messageType = this.isImageFile(mimeType) ? MessageType.IMAGE : MessageType.FILE;

      // Create message with file
      const message = new this.projectMessageModel({
        businessId: project.businessId,
        appProjectId: projectId,
        senderUserId: senderId,
        content,
        messageType,
        replyToMessageId,
        fileUrl: uploadResult.file.url,
        fileName: uploadResult.file.name,
        fileSize: uploadResult.file.size,
        mimeType: mimeType,
        metadata: {
          ...metadata,
          senderName: `${sender.name} ${sender.surname || ''}`.trim(),
          senderEmail: sender.email,
          projectName: project.name,
          isSystemMessage: false
        }
      });

      await message.save();

      // Update parent message reply count if it's a reply
      if (replyToMessageId) {
        await this.projectMessageModel.findByIdAndUpdate(
          replyToMessageId,
          { $inc: { replyCount: 1 } }
        );
      }

      // 🎯 AUDIT LOG - Business action
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_MESSAGE_WITH_FILE_SENT,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.LOW,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            projectName: project.name,
            messageId: message._id.toString(),
            messageContent: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
            senderId,
            senderName: `${sender.name} ${sender.surname || ''}`.trim(),
            fileUrl: uploadResult.file.url,
            fileName: uploadResult.file.name,
            fileSize: uploadResult.file.size,
            mimeType: mimeType,
            isReply: !!replyToMessageId,
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity
      const actionText = replyToMessageId ? 'replied with a file in project chat' : 'shared a file in project chat';
      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId: senderId,
        userName: `${sender.name} ${sender.surname || ''}`.trim(),
        userEmail: sender.email,
        type: ActivityType.PROJECT_MESSAGE_WITH_FILE_SENT,
        action: actionText,
        description: `${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
        projectId,
        projectName: project.name,
        resourceType: 'project_message',
        resourceId: message._id.toString(),
        resourceName: 'Project chat file message',
        data: {
          messageId: message._id.toString(),
          messageContent: content,
          hasFile: true,
          fileName: uploadResult.file.name,
          fileSize: uploadResult.file.size,
          isReply: !!replyToMessageId,
          projectName: project.name
        }
      });

      this.logger.log(`Message with file sent in project ${projectId} by user ${senderId}`);
      return this.transformMessageToResponse(message, sender);

    } catch (error) {
      this.logger.error(`Error sending message with file in project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Get all messages for a project with pagination
   */
  async getProjectMessages(
    projectId: string,
    options: MessagePaginationOptions = {},
    adminUserId?: string,
    req?: any
  ): Promise<ProjectMessagesListResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');

    try {
      // Validate project exists and get business context
      const project = await this.appProjectModel.findById(projectId);
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const page = options.page || 1;
      const limit = Math.min(options.limit || 50, 100); // Max 100 messages per page
      const skip = (page - 1) * limit;

      // Build query - exclude deleted messages
      const query: any = {
        appProjectId: projectId,
        isDeleted: false
      };

      // If parentOnly is true, only get top-level messages (no replies)
      if (options.parentOnly) {
        query.replyToMessageId = { $exists: false };
      }

      // If unreadOnly is true and userId provided, get only unread messages for that user
      if (options.unreadOnly && options.userId) {
        query.readBy = { $ne: options.userId };
      }

      // Get messages with sender information
      const messages = await this.projectMessageModel
        .find(query)
        .sort({ createdAt: -1 }) // Newest first
        .skip(skip)
        .limit(limit)
        .populate('senderUserId', 'name surname email')
        .exec();

      // Get total count for pagination
      const total = await this.projectMessageModel.countDocuments(query);

      // Get summary statistics
      const [summary] = await this.projectMessageModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false
          }
        },
        {
          $group: {
            _id: null,
            totalMessages: { $sum: 1 },
            totalReplies: {
              $sum: {
                $cond: [{ $ifNull: ['$replyToMessageId', false] }, 1, 0]
              }
            },
            messagesWithFiles: {
              $sum: {
                $cond: [{ $in: ['$messageType', [MessageType.FILE, MessageType.IMAGE]] }, 1, 0]
              }
            },
            lastMessageAt: { $max: '$createdAt' }
          }
        }
      ]);

      // Get unread count for current user if specified
      let unreadCount = 0;
      if (options.userId) {
        unreadCount = await this.projectMessageModel.countDocuments({
          appProjectId: projectId,
          isDeleted: false,
          readBy: { $ne: options.userId }
        });
      }

      // Get active participants (users who sent messages)
      const activeParticipants = await this.projectMessageModel.distinct('senderUserId', {
        appProjectId: projectId,
        isDeleted: false
      });

      // Transform messages to response format
      const transformedMessages = messages.map(message => 
        this.transformMessageToResponse(message, message.senderUserId)
      );

      // 🎯 AUDIT LOG - Business viewing messages (security/compliance)
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_MESSAGES_VIEWED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.LOW,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            projectName: project.name,
            page,
            limit,
            totalMessages: total,
            includeReplies: !options.parentOnly,
            messagesReturned: messages.length
          }
        });
      }

      const totalPages = Math.ceil(total / limit);
      
      return {
        messages: transformedMessages,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        },
        summary: {
          totalMessages: summary?.totalMessages || 0,
          totalReplies: summary?.totalReplies || 0,
          messagesWithFiles: summary?.messagesWithFiles || 0,
          unreadMessages: unreadCount,
          lastMessageAt: summary?.lastMessageAt || null,
          activeParticipants: activeParticipants.length
        }
      };

    } catch (error) {
      this.logger.error(`Error getting messages for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Get replies for a specific message
   */
  async getMessageReplies(
    projectId: string,
    parentMessageId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<ProjectMessageResponseDto[]> {
    try {
      // Validate parent message exists and belongs to project
      const parentMessage = await this.projectMessageModel.findOne({
        _id: parentMessageId,
        appProjectId: projectId,
        isDeleted: false
      });

      if (!parentMessage) {
        throw new NotFoundException('Parent message not found');
      }

      const skip = (page - 1) * Math.min(limit, 50); // Max 50 replies per page

      const replies = await this.projectMessageModel
        .find({
          replyToMessageId: parentMessageId,
          isDeleted: false
        })
        .sort({ createdAt: 1 }) // Oldest first for replies
        .skip(skip)
        .limit(Math.min(limit, 50))
        .populate('senderUserId', 'name surname email')
        .exec();

      return replies.map(reply => 
        this.transformMessageToResponse(reply, reply.senderUserId)
      );

    } catch (error) {
      this.logger.error(`Error getting replies for message ${parentMessageId}:`, error);
      throw error;
    }
  }

  /**
   * Update a message
   */
  async updateMessage(
    projectId: string,
    messageId: string,
    updateMessageDto: UpdateProjectMessageDto,
    userId: string,
    adminUserId?: string,
    req?: any
  ): Promise<ProjectMessageResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Find message and validate ownership
      const message = await this.projectMessageModel.findOne({
        _id: messageId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('senderUserId', 'name surname email');

      if (!message) {
        throw new NotFoundException('Message not found');
      }

      // Validate user can edit (sender or business admin)
      const project = await this.appProjectModel.findById(projectId);
      const business = await this.businessModel.findById(project.businessId);
      
      const canEdit = message.senderUserId.toString() === userId ||
      adminUserId === business.adminUserId;

      if (!canEdit) {
        throw new ForbiddenException('You can only edit your own messages');
      }

      // Can't edit system messages
      if (message.messageType === MessageType.SYSTEM) {
        throw new BadRequestException('Cannot edit system messages');
      }

      // Update message
      const oldContent = message.content;
      message.content = updateMessageDto.content;
      message.lastEditedAt = new Date();
      message.editReason = updateMessageDto.editReason;
      message.isEdited = true;

      await message.save();

      // 🎯 AUDIT LOG - Business action
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_MESSAGE_UPDATED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.MEDIUM,
          ipAddress,
          userAgent,
          oldValues: { content: oldContent },
          newValues: { content: updateMessageDto.content },
          changedFields: ['content'],
          metadata: {
            projectId,
            projectName: project.name,
            messageId,
            // @ts-ignore
            senderId: message.senderUserId._id.toString(),
            // @ts-ignore
            senderName: `${message.senderUserId.name} ${message.senderUserId.surname || ''}`.trim(),
            editReason: updateMessageDto.editReason,
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity
      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId,
        // @ts-ignore
        userName: `${message.senderUserId.name} ${message.senderUserId.surname || ''}`.trim(),
        // @ts-ignore
        userEmail: message.senderUserId.email,
        type: ActivityType.PROJECT_MESSAGE_UPDATED,
        action: 'edited a message in project chat',
        description: `Updated message: ${updateMessageDto.content.substring(0, 100)}${updateMessageDto.content.length > 100 ? '...' : ''}`,
        projectId,
        projectName: project.name,
        resourceType: 'project_message',
        resourceId: messageId,
        resourceName: 'Project chat message edit',
        data: {
          messageId,
          oldContent: oldContent.substring(0, 100),
          newContent: updateMessageDto.content.substring(0, 100),
          editReason: updateMessageDto.editReason,
          projectName: project.name
        }
      });

      this.logger.log(`Message ${messageId} updated in project ${projectId} by user ${userId}`);
      return this.transformMessageToResponse(message, message.senderUserId);

    } catch (error) {
      this.logger.error(`Error updating message ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a message (soft delete)
   */
  async deleteMessage(
    projectId: string,
    messageId: string,
    userId: string,
    adminUserId?: string,
    req?: any
  ): Promise<{ success: boolean; message: string }> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Find message and validate ownership
      const message = await this.projectMessageModel.findOne({
        _id: messageId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('senderUserId', 'name surname email');

      if (!message) {
        throw new NotFoundException('Message not found');
      }

      // Validate user can delete (sender or business admin)
      const project = await this.appProjectModel.findById(projectId);
      const business = await this.businessModel.findById(project.businessId);
      
      const canDelete = message.senderUserId.toString() === userId ||
      adminUserId === business.adminUserId;

      if (!canDelete) {
        throw new ForbiddenException('You can only delete your own messages');
      }

      // Soft delete message
      message.isDeleted = true;
      message.deletedAt = new Date();
      message.deletedBy = userId;
      message.status = MessageStatus.DELETED;

      await message.save();

      // 🎯 AUDIT LOG - Business action
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_MESSAGE_DELETED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.MEDIUM,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            projectName: project.name,
            messageId,
            deletedContent: message.content.substring(0, 100),
            // @ts-ignore
            senderId: message.senderUserId._id.toString(),
            // @ts-ignore
            senderName: `${message.senderUserId.name} ${message.senderUserId.surname || ''}`.trim(),
            deletedBy: userId,
            hadFile: [MessageType.FILE, MessageType.IMAGE].includes(message.messageType),
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity
      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId,
        // @ts-ignore
        userName: `${message.senderUserId.name} ${message.senderUserId.surname || ''}`.trim(),
        // @ts-ignore
        userEmail: message.senderUserId.email,
        type: ActivityType.PROJECT_MESSAGE_DELETED,
        action: 'deleted a message from project chat',
        description: `Removed message from ${project.name}`,
        projectId,
        projectName: project.name,
        resourceType: 'project_message',
        resourceId: messageId,
        resourceName: 'Project chat message deletion',
        data: {
          messageId,
          deletedContent: message.content.substring(0, 100),
          projectName: project.name,
          hadFile: [MessageType.FILE, MessageType.IMAGE].includes(message.messageType)
        }
      });

      this.logger.log(`Message ${messageId} deleted in project ${projectId} by user ${userId}`);
      
      return {
        success: true,
        message: 'Message deleted successfully'
      };

    } catch (error) {
      this.logger.error(`Error deleting message ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(
    projectId: string,
    messageIds: string[],
    userId: string,
    adminUserId?: string,
    req?: any
  ): Promise<{ success: boolean; message: string; markedCount: number }> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');

    try {
      // Validate project access
      const project = await this.appProjectModel.findById(projectId);
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      // Update messages to add user to readBy array
      const result = await this.projectMessageModel.updateMany(
        {
          _id: { $in: messageIds },
          appProjectId: projectId,
          isDeleted: false,
          readBy: { $ne: userId } // Only update if user hasn't already read
        },
        {
          $addToSet: { readBy: userId },
          $set: { readAt: new Date() }
        }
      );

      // 🎯 AUDIT LOG - Business action (only if significant number of messages)
      if (adminUserId && result.modifiedCount > 10) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_MESSAGES_READ,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.LOW,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            projectName: project.name,
            messagesMarkedRead: result.modifiedCount,
            userId
          }
        });
      }

      this.logger.log(`${result.modifiedCount} messages marked as read in project ${projectId} by user ${userId}`);
      
      return {
        success: true,
        message: `${result.modifiedCount} messages marked as read`,
        markedCount: result.modifiedCount
      };

    } catch (error) {
      this.logger.error(`Error marking messages as read in project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Add reaction to message
   */
  async addMessageReaction(
    projectId: string,
    messageId: string,
    reactionDto: AddMessageReactionDto,
    userId: string,
    adminUserId?: string,
    req?: any
  ): Promise<ProjectMessageResponseDto> {
    try {
      // Find message
      const message = await this.projectMessageModel.findOne({
        _id: messageId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('senderUserId', 'name surname email');

      if (!message) {
        throw new NotFoundException('Message not found');
      }

      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Check if user already reacted to this message
      const existingReaction = message.reactions.find(r => r.userId.toString() === userId);
      
      if (existingReaction) {
        // Update existing reaction
        existingReaction.reaction = reactionDto.reaction;
        existingReaction.reactedAt = new Date();
      } else {
        // Add new reaction
        message.reactions.push({
          userId,
          reaction: reactionDto.reaction,
          reactedAt: new Date()
        });
      }

      message.markModified('reactions');
      await message.save();

      this.logger.log(`Reaction ${reactionDto.reaction} added to message ${messageId} by user ${userId}`);
      return this.transformMessageToResponse(message, message.senderUserId);

    } catch (error) {
      this.logger.error(`Error adding reaction to message ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Remove reaction from message
   */
  async removeMessageReaction(
    projectId: string,
    messageId: string,
    userId: string,
    adminUserId?: string,
    req?: any
  ): Promise<ProjectMessageResponseDto> {
    try {
      // Find message
      const message = await this.projectMessageModel.findOne({
        _id: messageId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('senderUserId', 'name surname email');

      if (!message) {
        throw new NotFoundException('Message not found');
      }

      // Remove user's reaction
      message.reactions = message.reactions.filter(r => r.userId.toString() !== userId);

      message.markModified('reactions');
      await message.save();

      this.logger.log(`Reaction removed from message ${messageId} by user ${userId}`);
      return this.transformMessageToResponse(message, message.senderUserId);

    } catch (error) {
      this.logger.error(`Error removing reaction from message ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Get chat statistics for a project
   */
  async getProjectChatStats(
    projectId: string,
    adminUserId?: string,
    req?: any
  ): Promise<ProjectChatStatsResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');

    try {
      // Validate project
      const project = await this.appProjectModel.findById(projectId);
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);

      // Get basic statistics
      const [basicStats] = await this.projectMessageModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false
          }
        },
        {
          $group: {
            _id: null,
            totalMessages: { $sum: 1 },
            messagesToday: {
              $sum: { $cond: [{ $gte: ['$createdAt', today] }, 1, 0] }
            },
            messagesThisWeek: {
              $sum: { $cond: [{ $gte: ['$createdAt', weekAgo] }, 1, 0] }
            },
            messagesWithFiles: {
              $sum: { $cond: [{ $in: ['$messageType', [MessageType.FILE, MessageType.IMAGE]] }, 1, 0] }
            },
            totalFileSize: { $sum: '$fileSize' },
            lastMessageAt: { $max: '$createdAt' }
          }
        }
      ]);

      // Get participant statistics
      const participantStats = await this.projectMessageModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false
          }
        },
        {
          $group: {
            _id: '$senderUserId',
            messageCount: { $sum: 1 },
            lastMessageAt: { $max: '$createdAt' }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $unwind: '$user'
        },
        {
          $project: {
            userId: '$_id',
            userName: {
              $concat: ['$user.name', ' ', { $ifNull: ['$user.surname', ''] }]
            },
            messageCount: 1,
            lastMessageAt: 1,
            isActiveThisWeek: { $gte: ['$lastMessageAt', weekAgo] }
          }
        },
        {
          $sort: { messageCount: -1 }
        }
      ]);

      // Calculate active participants
      const activeParticipants = participantStats.filter(p => p.isActiveThisWeek).length;

      // Get daily activity for last 30 days
      const dailyActivity = await this.projectMessageModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false,
            createdAt: { $gte: monthAgo }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            messageCount: { $sum: 1 }
          }
        },
        {
          $sort: { '_id': 1 }
        },
        {
          $project: {
            date: '$_id',
            messageCount: 1,
            _id: 0
          }
        }
      ]);

      // Calculate average messages per day
      const daysWithMessages = dailyActivity.length;
      const totalMessagesInPeriod = dailyActivity.reduce((sum, day) => sum + day.messageCount, 0);
      const averageMessagesPerDay = daysWithMessages > 0 ? totalMessagesInPeriod / 30 : 0;

      // 🎯 AUDIT LOG - Business viewing stats
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_CHAT_STATS_VIEWED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.LOW,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            projectName: project.name,
            totalMessages: basicStats?.totalMessages || 0,
            totalParticipants: participantStats.length,
            activeParticipants
          }
        });
      }

      return {
        totalMessages: basicStats?.totalMessages || 0,
        messagesToday: basicStats?.messagesToday || 0,
        messagesThisWeek: basicStats?.messagesThisWeek || 0,
        totalParticipants: participantStats.length,
        activeParticipants,
        messagesWithFiles: basicStats?.messagesWithFiles || 0,
        totalFileSizeMB: Math.round(((basicStats?.totalFileSize || 0) / 1024 / 1024) * 100) / 100,
        topParticipants: participantStats.slice(0, 10).map(p => ({
          userId: p.userId.toString(),
          userName: p.userName.trim(),
          messageCount: p.messageCount,
          lastMessageAt: p.lastMessageAt
        })),
        dailyActivity,
        lastMessageAt: basicStats?.lastMessageAt || null,
        averageMessagesPerDay: Math.round(averageMessagesPerDay * 10) / 10
      };

    } catch (error) {
      this.logger.error(`Error getting chat stats for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Get project by ID (helper method for validation)
   */
  async getProjectById(projectId: string): Promise<any> {
    try {
      return await this.appProjectModel.findById(projectId).exec();
    } catch (error) {
      this.logger.error(`Error finding project ${projectId}: ${error.message}`);
      return null;
    }
  }

  // HELPER METHODS

  /**
   * Validate project access and get context
   */
  private async validateMessageAccess(projectId: string, userId: string) {
    const project = await this.appProjectModel.findById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const business = await this.businessModel.findById(project.businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const sender = await this.userModel.findById(userId);
    if (!sender) {
      throw new NotFoundException('User not found');
    }

    // Check if user is assigned to project or is business admin
    const isAssigned = project.assignedUsers.includes(userId);
    const isBusinessAdmin = business.adminUserId === userId;

    if (!isAssigned && !isBusinessAdmin) {
      throw new ForbiddenException('You are not assigned to this project');
    }

    return { project, business, sender };
  }

  /**
   * Transform message document to response DTO
   */
  private transformMessageToResponse(message: any, sender: any): ProjectMessageResponseDto {
    return {
      id: message._id.toString(),
      appProjectId: message.appProjectId,
      sender: {
        id: sender._id?.toString() || sender.toString(),
        name: sender.name ? `${sender.name} ${sender.surname || ''}`.trim() : 'Unknown User',
        email: sender.email || ''
      },
      content: message.content,
      messageType: message.messageType,
      status: message.status,
      replyToMessageId: message.replyToMessageId,
      replyCount: message.replyCount || 0,
      file: message.fileUrl ? {
        url: message.fileUrl,
        name: message.fileName,
        size: message.fileSize,
        mimeType: message.mimeType
      } : undefined,
      readBy: message.readBy || [],
      readAt: message.readAt,
      reactions: message.reactions ? message.reactions.map(r => ({
        userId: r.userId.toString(),
        userName: 'User', // Could be populated if needed
        reaction: r.reaction,
        reactedAt: r.reactedAt
      })) : [],
      editInfo: message.isEdited ? {
        lastEditedAt: message.lastEditedAt,
        editReason: message.editReason,
        isEdited: message.isEdited
      } : undefined,
      systemMessageData: message.systemMessageData,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      isReply: !!message.replyToMessageId,
      hasFile: [MessageType.FILE, MessageType.IMAGE].includes(message.messageType) && !!message.fileUrl,
      isSystemGenerated: message.messageType === MessageType.SYSTEM,
      metadata: message.metadata
    };
  }

  /**
   * Check if file is an image
   */
  private isImageFile(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  /**
   * Get MIME type from filename extension
   */
  private getMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    // Common image types
    const imageTypes: { [key: string]: string } = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml'
    };

    // Common file types
    const fileTypes: { [key: string]: string } = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'txt': 'text/plain',
      'csv': 'text/csv',
      'json': 'application/json',
      'xml': 'application/xml',
      'zip': 'application/zip',
      'rar': 'application/x-rar-compressed',
      'mp4': 'video/mp4',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav'
    };

    // Try image types first
    if (ext && imageTypes[ext]) {
      return imageTypes[ext];
    }

    // Then try other file types
    if (ext && fileTypes[ext]) {
      return fileTypes[ext];
    }

    // Default to octet-stream for unknown types
    return 'application/octet-stream';
  }

  /**
   * Extract IP address from request
   */
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
   * Determine if error should be audit logged
   */
  private shouldLogError(error: any): boolean {
    const validationErrors = ['BadRequestException', 'ValidationError', 'NotFoundException', 'ForbiddenException'];
    return !validationErrors.includes(error.name);
  }

  /**
   * Categorize error for audit logging
   */
  private categorizeError(error: any): string {
    if (error.name === 'NotFoundException') return 'resource_not_found';
    if (error.name === 'BadRequestException') return 'validation_error';
    if (error.name === 'ForbiddenException') return 'access_denied';
    if (error.name === 'UnauthorizedException') return 'authentication_failed';
    return 'unexpected_error';
  }
}