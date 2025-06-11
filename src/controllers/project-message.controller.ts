// src/controllers/project-message.controller.ts
import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    Headers,
    UnauthorizedException,
    NotFoundException,
    Logger,
    InternalServerErrorException,
    Req,
    UploadedFile,
    UseInterceptors,
    BadRequestException
  } from '@nestjs/common';
  import { FileInterceptor } from '@nestjs/platform-express';
  import {
    ApiTags,
    ApiOperation,
    ApiHeader,
    ApiParam,
    ApiBody,
    ApiResponse,
    ApiQuery,
    ApiConsumes
  } from '@nestjs/swagger';
  import { ProjectMessageService } from '../services/project-message.service';
  import { BusinessService } from '../services/business.service';
  import { AppProject } from '../schemas/app-project.schema';
  import {
    CreateProjectMessageDto,
    UpdateProjectMessageDto,
    UploadProjectMessageFileDto,
    MarkMessageReadDto,
    AddMessageReactionDto,
    ProjectMessageResponseDto,
    ProjectMessagesListResponseDto,
    MessageActionResponseDto,
    ProjectChatStatsResponseDto
  } from '../dtos/project-message.dto';
  
  @ApiTags('Project Chat')
  @Controller('projects/:projectId/chat')
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class ProjectMessageController {
    private readonly logger = new Logger(ProjectMessageController.name);
  
    constructor(
      private readonly projectMessageService: ProjectMessageService,
      private readonly businessService: BusinessService
    ) {}
  
    @Get('messages')
    @ApiOperation({ summary: 'Get all messages for project chat' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiQuery({ name: 'page', description: 'Page number', required: false, example: 1 })
    @ApiQuery({ name: 'limit', description: 'Messages per page', required: false, example: 50 })
    @ApiQuery({ name: 'parentOnly', description: 'Get only top-level messages (no replies)', required: false, example: false })
    @ApiQuery({ name: 'unreadOnly', description: 'Get only unread messages', required: false, example: false })
    @ApiResponse({
      status: 200,
      description: 'Returns project messages with pagination',
      type: ProjectMessagesListResponseDto
    })
    async getProjectMessages(
      @Param('projectId') projectId: string,
      @Query('page') page?: number,
      @Query('limit') limit?: number,
      @Query('parentOnly') parentOnly?: boolean,
      @Query('unreadOnly') unreadOnly?: boolean,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ProjectMessagesListResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID for audit logging
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        return this.projectMessageService.getProjectMessages(
          projectId,
          {
            page: page ? parseInt(page.toString()) : 1,
            limit: limit ? parseInt(limit.toString()) : 50,
            // @ts-ignore
            parentOnly: parentOnly === true || parentOnly === 'true',
            // @ts-ignore
            unreadOnly: unreadOnly === true || unreadOnly === 'true',
            userId: adminUserId // For unread filtering
          },
          adminUserId,
          req
        );
      } catch (error) {
        this.logger.error(`Error getting project messages: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Post('messages')
    @ApiOperation({ summary: 'Send a text message to project chat' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiBody({ type: CreateProjectMessageDto, description: 'Message details' })
    @ApiResponse({
      status: 201,
      description: 'Message sent successfully',
      type: MessageActionResponseDto
    })
    async sendMessage(
      @Param('projectId') projectId: string,
      @Body() createMessageDto: CreateProjectMessageDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<MessageActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const message = await this.projectMessageService.sendMessage(
          projectId,
          createMessageDto,
          adminUserId, // For now, admin is the sender
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Message sent successfully',
          messageData: message
        };
      } catch (error) {
        this.logger.error(`Error sending message: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to send message');
      }
    }
  
    @Post('messages/upload')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Send a message with file attachment' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiBody({
      description: 'Message with file',
      schema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'Message text content',
            example: 'Here is the document we discussed'
          },
          replyToMessageId: {
            type: 'string',
            description: 'Parent message ID for replies',
            example: '507f1f77bcf86cd799439011'
          },
          file: {
            type: 'string',
            format: 'binary',
            description: 'File to attach'
          }
        }
      }
    })
    @ApiResponse({
      status: 201,
      description: 'Message with file sent successfully',
      type: MessageActionResponseDto
    })
    async sendMessageWithFile(
      @Param('projectId') projectId: string,
      @Body() body: { content: string; replyToMessageId?: string; metadata?: Record<string, any> },
      @UploadedFile() file: Express.Multer.File,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<MessageActionResponseDto> {
      try {
        if (!file) {
          throw new BadRequestException('File is required');
        }
  
        if (!body.content) {
          throw new BadRequestException('Message content is required');
        }
  
        // Validate file size (max 50MB)
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (file.size > maxSize) {
          throw new BadRequestException('File size cannot exceed 50MB');
        }
  
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const message = await this.projectMessageService.sendMessageWithFile(
          projectId,
          body.content,
          file.buffer,
          file.originalname,
          adminUserId, // For now, admin is the sender
          body.replyToMessageId,
          body.metadata,
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Message with file sent successfully',
          messageData: message
        };
      } catch (error) {
        this.logger.error(`Error sending message with file: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || 
            error instanceof NotFoundException || 
            error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to send message with file');
      }
    }
  
    @Get('messages/:messageId/replies')
    @ApiOperation({ summary: 'Get replies for a specific message' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'messageId', description: 'Message ID to get replies for' })
    @ApiQuery({ name: 'page', description: 'Page number', required: false, example: 1 })
    @ApiQuery({ name: 'limit', description: 'Replies per page', required: false, example: 20 })
    @ApiResponse({
      status: 200,
      description: 'Returns message replies',
      type: [ProjectMessageResponseDto]
    })
    async getMessageReplies(
      @Param('projectId') projectId: string,
      @Param('messageId') messageId: string,
      @Query('page') page?: number,
      @Query('limit') limit?: number,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ProjectMessageResponseDto[]> {
      try {
        await this.validateProjectAccess(projectId, apiKey);
  
        return this.projectMessageService.getMessageReplies(
          projectId,
          messageId,
          page ? parseInt(page.toString()) : 1,
          limit ? parseInt(limit.toString()) : 20
        );
      } catch (error) {
        this.logger.error(`Error getting message replies: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Put('messages/:messageId')
    @ApiOperation({ summary: 'Update a message' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'messageId', description: 'Message ID to update' })
    @ApiBody({ type: UpdateProjectMessageDto, description: 'Updated message details' })
    @ApiResponse({
      status: 200,
      description: 'Message updated successfully',
      type: MessageActionResponseDto
    })
    async updateMessage(
      @Param('projectId') projectId: string,
      @Param('messageId') messageId: string,
      @Body() updateMessageDto: UpdateProjectMessageDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<MessageActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const message = await this.projectMessageService.updateMessage(
          projectId,
          messageId,
          updateMessageDto,
          adminUserId, // For now, admin is the editor
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Message updated successfully',
          messageData: message
        };
      } catch (error) {
        this.logger.error(`Error updating message: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Delete('messages/:messageId')
    @ApiOperation({ summary: 'Delete a message' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'messageId', description: 'Message ID to delete' })
    @ApiResponse({
      status: 200,
      description: 'Message deleted successfully',
      type: MessageActionResponseDto
    })
    async deleteMessage(
      @Param('projectId') projectId: string,
      @Param('messageId') messageId: string,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<MessageActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const result = await this.projectMessageService.deleteMessage(
          projectId,
          messageId,
          adminUserId, // For now, admin is the deleter
          adminUserId,
          req
        );
  
        return {
          success: result.success,
          message: result.message
        };
      } catch (error) {
        this.logger.error(`Error deleting message: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Put('messages/mark-read')
    @ApiOperation({ summary: 'Mark messages as read' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiBody({ type: MarkMessageReadDto, description: 'Message IDs to mark as read' })
    @ApiResponse({
      status: 200,
      description: 'Messages marked as read successfully',
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '5 messages marked as read' },
          markedCount: { type: 'number', example: 5 }
        }
      }
    })
    async markMessagesAsRead(
      @Param('projectId') projectId: string,
      @Body() markReadDto: MarkMessageReadDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<{ success: boolean; message: string; markedCount: number }> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        // If no specific message IDs provided, mark all unread messages as read
        let messageIds = markReadDto.messageIds;
        if (!messageIds || messageIds.length === 0) {
          // Get all unread message IDs for this user
          const unreadMessages = await this.projectMessageService.getProjectMessages(
            projectId,
            {
              unreadOnly: true,
              userId: adminUserId,
              limit: 1000 // Get up to 1000 unread messages
            },
            adminUserId,
            req
          );
          messageIds = unreadMessages.messages.map(m => m.id);
        }
  
        return this.projectMessageService.markMessagesAsRead(
          projectId,
          messageIds,
          adminUserId,
          adminUserId,
          req
        );
      } catch (error) {
        this.logger.error(`Error marking messages as read: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Post('messages/:messageId/reactions')
    @ApiOperation({ summary: 'Add reaction to a message' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'messageId', description: 'Message ID to react to' })
    @ApiBody({ type: AddMessageReactionDto, description: 'Reaction details' })
    @ApiResponse({
      status: 200,
      description: 'Reaction added successfully',
      type: MessageActionResponseDto
    })
    async addMessageReaction(
      @Param('projectId') projectId: string,
      @Param('messageId') messageId: string,
      @Body() reactionDto: AddMessageReactionDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<MessageActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const message = await this.projectMessageService.addMessageReaction(
          projectId,
          messageId,
          reactionDto,
          adminUserId,
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Reaction added successfully',
          messageData: message
        };
      } catch (error) {
        this.logger.error(`Error adding message reaction: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Delete('messages/:messageId/reactions')
    @ApiOperation({ summary: 'Remove reaction from a message' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'messageId', description: 'Message ID to remove reaction from' })
    @ApiResponse({
      status: 200,
      description: 'Reaction removed successfully',
      type: MessageActionResponseDto
    })
    async removeMessageReaction(
      @Param('projectId') projectId: string,
      @Param('messageId') messageId: string,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<MessageActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const message = await this.projectMessageService.removeMessageReaction(
          projectId,
          messageId,
          adminUserId,
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Reaction removed successfully',
          messageData: message
        };
      } catch (error) {
        this.logger.error(`Error removing message reaction: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Get('stats')
    @ApiOperation({ summary: 'Get chat statistics for the project' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiResponse({
      status: 200,
      description: 'Returns chat statistics',
      type: ProjectChatStatsResponseDto
    })
    async getChatStats(
      @Param('projectId') projectId: string,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ProjectChatStatsResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID for audit logging
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        return this.projectMessageService.getProjectChatStats(
          projectId,
          adminUserId,
          req
        );
      } catch (error) {
        this.logger.error(`Error getting chat stats: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    // HELPER METHODS
    private async validateProjectAccess(projectId: string, apiKey: string): Promise<AppProject> {
      if (!apiKey) {
        throw new UnauthorizedException('Business API key missing');
      }
  
      const project = await this.projectMessageService.getProjectById(projectId);
      if (!project) {
        throw new NotFoundException('Project not found');
      }
  
      const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
      if (!business) {
        throw new UnauthorizedException('Invalid API key for this business');
      }
  
      return project;
    }
  }