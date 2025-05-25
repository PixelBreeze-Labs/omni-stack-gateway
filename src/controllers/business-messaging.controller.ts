// src/controllers/business-messaging.controller.ts
import { 
    Controller, 
    Get, 
    Post, 
    Put, 
    Body, 
    Param, 
    Query, 
    Headers, 
    UnauthorizedException, 
    Logger, 
    InternalServerErrorException, 
    BadRequestException,
    UploadedFile,
    UseInterceptors
  } from '@nestjs/common';
  import { FileInterceptor } from '@nestjs/platform-express';
  import { ApiTags, ApiOperation, ApiHeader, ApiParam, ApiBody, ApiResponse, ApiQuery, ApiConsumes } from '@nestjs/swagger';
  import { 
    BusinessMessagingService, 
    SendMessageResponse, 
    ConversationResponse,
  } from '../services/business-messaging.service';
  import { SupabaseService } from '../services/supabase.service';
  import { MessageType } from '../schemas/business-client-message.schema';
  
  @ApiTags('Business Messaging')
  @Controller('business-messaging')
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class BusinessMessagingController {
    private readonly logger = new Logger(BusinessMessagingController.name);
  
    constructor(
      private readonly messagingService: BusinessMessagingService,
      private readonly supabaseService: SupabaseService
    ) {}
  
    @Post(':businessId/send/:appClientId')
    @ApiOperation({ summary: 'Send a message to a client' })
    @ApiParam({ name: 'businessId', description: 'Business ID' })
    @ApiParam({ name: 'appClientId', description: 'App Client ID' })
    @ApiBody({ 
      description: 'Message data',
      schema: {
        properties: {
          content: { type: 'string', description: 'Message content' },
          messageType: { 
            type: 'string', 
            enum: ['text', 'file', 'image', 'system'],
            description: 'Type of message',
            default: 'text'
          },
          senderUserId: { type: 'string', description: 'Optional sender user ID from business' }
        },
        required: ['content']
      }
    })
    @ApiResponse({ status: 200, description: 'Message sent successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Client not found' })
    async sendMessage(
      @Param('businessId') businessId: string,
      @Param('appClientId') appClientId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Body() body: {
        content: string;
        messageType?: MessageType;
        senderUserId?: string;
      }
    ): Promise<SendMessageResponse> {
      try {
        // Validate API key
        await this.messagingService.validateBusinessApiKey(businessId, apiKey);
  
        if (!body.content || body.content.trim().length === 0) {
          throw new BadRequestException('Message content cannot be empty');
        }
  
        return await this.messagingService.sendMessageToClient(
          businessId,
          appClientId,
          body.content.trim(),
          body.messageType || MessageType.TEXT,
          body.senderUserId
        );
      } catch (error) {
        this.logger.error(`Error sending message: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
          throw error;
        } else {
          throw new InternalServerErrorException('Failed to send message');
        }
      }
    }
  
    @Post(':businessId/send/:appClientId/file')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Send a file message to a client' })
    @ApiParam({ name: 'businessId', description: 'Business ID' })
    @ApiParam({ name: 'appClientId', description: 'App Client ID' })
    @ApiBody({
      description: 'File upload with optional message',
      schema: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: 'File to upload'
          },
          content: {
            type: 'string',
            description: 'Optional message content to accompany the file'
          },
          senderUserId: {
            type: 'string',
            description: 'Optional sender user ID from business'
          }
        },
        required: ['file']
      }
    })
    @ApiResponse({ status: 200, description: 'File message sent successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async sendFileMessage(
      @Param('businessId') businessId: string,
      @Param('appClientId') appClientId: string,
      @Headers('business-x-api-key') apiKey: string,
      @UploadedFile() file: Express.Multer.File,
      @Body() body: {
        content?: string;
        senderUserId?: string;
      }
    ): Promise<SendMessageResponse> {
      try {
        // Validate API key
        await this.messagingService.validateBusinessApiKey(businessId, apiKey);
  
        if (!file) {
          throw new BadRequestException('File is required');
        }

        this.logger.log(`Attempting to upload file: ${file.originalname}, size: ${file.size}, mimetype: ${file.mimetype}`);

        let fileInfo;
        try {
          // Try primary chat upload method
          fileInfo = await this.supabaseService.uploadChatFile(
            businessId,
            appClientId,
            file.buffer,
            file.originalname
          );
          this.logger.log(`Chat file uploaded successfully using primary method`);
        } catch (primaryError) {
          this.logger.warn(`Primary chat upload failed: ${primaryError.message}`);
          
          try {
            // Fallback to alternative method (using business_storage path)
            fileInfo = await this.supabaseService.uploadChatFileAlternative(
              businessId,
              appClientId,
              file.buffer,
              file.originalname
            );
            this.logger.log(`Chat file uploaded successfully using alternative method`);
          } catch (fallbackError) {
            this.logger.error(`Both chat upload methods failed. Primary: ${primaryError.message}, Fallback: ${fallbackError.message}`);
            throw new InternalServerErrorException(`Failed to upload file: ${fallbackError.message}`);
          }
        }
        
        const messageType = file.mimetype.startsWith('image/') ? MessageType.IMAGE : MessageType.FILE;
        const content = body.content || '';
  
        return await this.messagingService.sendMessageToClient(
          businessId,
          appClientId,
          content,
          messageType,
          body.senderUserId,
          {
            fileName: file.originalname,
            fileUrl: fileInfo.url,
            fileSize: file.size,
            mimeType: file.mimetype
          }
        );
      } catch (error) {
        this.logger.error(`Error sending file message: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
          throw error;
        } else {
          throw new InternalServerErrorException(`Failed to send file message: ${error.message}`);
        }
      }
    }
  
    @Get(':businessId/conversation/:appClientId')
    @ApiOperation({ summary: 'Get conversation history with a client' })
    @ApiParam({ name: 'businessId', description: 'Business ID' })
    @ApiParam({ name: 'appClientId', description: 'App Client ID' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number for pagination', type: 'number' })
    @ApiQuery({ name: 'limit', required: false, description: 'Number of messages per page', type: 'number' })
    @ApiResponse({ status: 200, description: 'Returns conversation history' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Client not found' })
    async getConversation(
      @Param('businessId') businessId: string,
      @Param('appClientId') appClientId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Query('page') page?: number,
      @Query('limit') limit?: number
    ): Promise<ConversationResponse> {
      try {
        // Validate API key
        await this.messagingService.validateBusinessApiKey(businessId, apiKey);
  
        return await this.messagingService.getConversation(
          businessId,
          appClientId,
          page ? parseInt(page.toString()) : 1,
          limit ? parseInt(limit.toString()) : 50
        );
      } catch (error) {
        this.logger.error(`Error getting conversation: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException) {
          throw error;
        } else {
          throw new InternalServerErrorException('Failed to get conversation');
        }
      }
    }
  
    @Put(':businessId/conversation/:appClientId/mark-read')
    @ApiOperation({ summary: 'Mark messages as read' })
    @ApiParam({ name: 'businessId', description: 'Business ID' })
    @ApiParam({ name: 'appClientId', description: 'App Client ID' })
    @ApiBody({
      description: 'Optional specific message IDs to mark as read',
      schema: {
        properties: {
          messageIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific message IDs to mark as read. If empty, marks all unread messages as read'
          }
        }
      },
      required: false
    })
    @ApiResponse({ status: 200, description: 'Messages marked as read' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async markMessagesAsRead(
      @Param('businessId') businessId: string,
      @Param('appClientId') appClientId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Body() body?: { messageIds?: string[] }
    ): Promise<{ success: boolean; markedCount: number }> {
      try {
        // Validate API key
        await this.messagingService.validateBusinessApiKey(businessId, apiKey);
  
        return await this.messagingService.markMessagesAsRead(
          businessId,
          appClientId,
          body?.messageIds
        );
      } catch (error) {
        this.logger.error(`Error marking messages as read: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException) {
          throw error;
        } else {
          throw new InternalServerErrorException('Failed to mark messages as read');
        }
      }
    }

    // ========== DEBUGGING ENDPOINT (Remove in production) ==========
    
    @Post(':businessId/debug/init-chat-storage/:appClientId')
    @ApiOperation({ summary: 'Initialize chat storage for debugging' })
    async initChatStorage(
      @Param('businessId') businessId: string,
      @Param('appClientId') appClientId: string,
      @Headers('business-x-api-key') apiKey: string,
    ): Promise<{ success: boolean; message: string }> {
      try {
        await this.messagingService.validateBusinessApiKey(businessId, apiKey);
        
        await this.supabaseService.initializeChatStorage(businessId, appClientId);
        
        return {
          success: true,
          message: `Chat storage initialized for business ${businessId} and client ${appClientId}`
        };
      } catch (error) {
        this.logger.error(`Error initializing chat storage: ${error.message}`, error.stack);
        throw new InternalServerErrorException(`Failed to initialize chat storage: ${error.message}`);
      }
    }
  }