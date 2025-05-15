// src/controllers/business-chatbot.controller.ts
import { Controller, Get, Post, Body, Param, Query, Delete, Headers, UnauthorizedException, Logger, InternalServerErrorException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiParam, ApiBody, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { BusinessChatbotService, ChatResponse, HistoryResponse, ClearHistoryResponse, SessionsResponse } from '../services/business-chatbot.service';
import { BusinessService } from '../services/business.service';

@ApiTags('Business Chatbot')
@Controller('business-chatbot')
@ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
export class BusinessChatbotController {
  private readonly logger = new Logger(BusinessChatbotController.name);

  constructor(
    private readonly chatbotService: BusinessChatbotService,
    private readonly businessService: BusinessService
  ) {}

  @Post(':businessId/message')
  @ApiOperation({ summary: 'Process a chatbot message for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiBody({ 
    description: 'Message data',
    schema: {
      properties: {
        userId: { type: 'string', description: 'Optional user ID' },
        message: { type: 'string', description: 'Message content' }, 
        sessionId: { type: 'string', description: 'Optional session ID' },
        context: { type: 'object', description: 'Optional context information' }
      },
      required: ['message']
    }
  })
  @ApiResponse({ status: 200, description: 'Message processed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async processMessage(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Body() body: {
      userId?: string;
      message: string;
      sessionId?: string;
      context?: Record<string, any>;
    }
  ): Promise<ChatResponse> {
    try {
      // Verify API key is valid for this business
      const business = await this.chatbotService.validateBusinessApiKey(businessId, apiKey);
      
      // Process the message
      return this.chatbotService.processMessage(
        businessId,
        business.clientId,
        body.userId || null,
        body.message,
        body.sessionId || null,
        body.context || {}
      );
    } catch (error) {
      this.logger.error(`Error processing message: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to process message');
      }
    }
  }

  @Get(':businessId/history')
  @ApiOperation({ summary: 'Get conversation history' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
  @ApiQuery({ name: 'sessionId', required: false, description: 'Filter by session ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of messages to return' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number for pagination' })
  @ApiResponse({ status: 200, description: 'Returns conversation history' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async getHistory(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Query('userId') userId?: string,
    @Query('sessionId') sessionId?: string,
    @Query('limit') limit?: number,
    @Query('page') page?: number
  ): Promise<HistoryResponse> {
    try {
      // Verify API key is valid for this business
      const business = await this.chatbotService.validateBusinessApiKey(businessId, apiKey);
      
      return this.chatbotService.getConversationHistory(
        businessId,
        business.clientId,
        userId || null,
        sessionId || null,
        limit ? parseInt(limit.toString()) : 20,
        page ? parseInt(page.toString()) : 1
      );
    } catch (error) {
      this.logger.error(`Error getting conversation history: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to get conversation history');
      }
    }
  }

  @Delete(':businessId/history')
  @ApiOperation({ summary: 'Clear conversation history' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'sessionId', required: true, description: 'Session ID to clear' })
  @ApiResponse({ status: 200, description: 'Conversation history cleared' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async clearHistory(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Query('sessionId') sessionId: string
  ): Promise<ClearHistoryResponse> {
    try {
      if (!sessionId) {
        return { success: false, deletedCount: 0 };
      }
      
      // Verify API key is valid for this business
      const business = await this.chatbotService.validateBusinessApiKey(businessId, apiKey);
      
      return this.chatbotService.clearChatHistory(
        businessId,
        business.clientId,
        sessionId
      );
    } catch (error) {
      this.logger.error(`Error clearing conversation history: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to clear conversation history');
      }
    }
  }

  @Get(':businessId/sessions')
  @ApiOperation({ summary: 'Get active chat sessions' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of sessions to return' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number for pagination' })
  @ApiResponse({ status: 200, description: 'Returns active sessions' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async getSessions(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Query('limit') limit?: number,
    @Query('page') page?: number
  ): Promise<SessionsResponse> {
    try {
      // Verify API key is valid for this business
      const business = await this.chatbotService.validateBusinessApiKey(businessId, apiKey);
      
      return this.chatbotService.getActiveSessions(
        businessId,
        business.clientId,
        limit ? parseInt(limit.toString()) : 20,
        page ? parseInt(page.toString()) : 1
      );
    } catch (error) {
      this.logger.error(`Error getting active sessions: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to get active sessions');
      }
    }
  }
}