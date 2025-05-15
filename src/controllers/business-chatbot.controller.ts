// src/controllers/business-chatbot.controller.ts
import { Controller, Get, Post, Put, Body, Param, Query, Delete, Headers, UnauthorizedException, Logger, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiParam, ApiBody, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { BusinessChatbotService, ChatResponse, HistoryResponse, ClearHistoryResponse, SessionsResponse } from '../services/business-chatbot.service';
import { KnowledgeBaseService } from '../services/knowledge-base.service';  

@ApiTags('Business Chatbot')
@Controller('business-chatbot')
@ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
export class BusinessChatbotController {
  private readonly logger = new Logger(BusinessChatbotController.name);

  constructor(
    private readonly chatbotService: BusinessChatbotService,
    private readonly knowledgeBaseService: KnowledgeBaseService
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

  @Get(':businessId/health')
  @ApiOperation({ summary: 'Check chatbot service health' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiResponse({ status: 200, description: 'Chatbot service is healthy' })
  async checkHealth(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<{ status: string; timestamp: string }> {
    try {
      // Verify API key is valid for this business
      await this.chatbotService.validateBusinessApiKey(businessId, apiKey);
      
      return {
        status: 'ok',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Health check failed');
      }
    }
  }

  @Get(':businessId/knowledge')
  @ApiOperation({ summary: 'Get knowledge base categories' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiResponse({ status: 200, description: 'Returns knowledge base categories' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async getKnowledgeBase(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<{ categories: string[]; success: boolean }> {
    try {
      // Verify API key is valid for this business
      await this.chatbotService.validateBusinessApiKey(businessId, apiKey);
      
      // Return available knowledge categories
      return {
        categories: [
          'projects',
          'tasks',
          'time_tracking',
          'teams',
          'clients',
          'reports',
          'equipment',
          'quality_control',
          'field_service'
        ],
        success: true
      };
    } catch (error) {
      this.logger.error(`Error getting knowledge base: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to get knowledge base');
      }
    }
  }

  @Put('query-responses/:id/feedback')
  @ApiOperation({ summary: 'Update response success rate' })
  @ApiParam({ name: 'id', description: 'Query-response pair ID' })
  @ApiBody({ 
    description: 'Feedback data',
    schema: {
      type: 'object',
      properties: {
        wasSuccessful: { type: 'boolean' }
      },
      required: ['wasSuccessful']
    }
  })
  @ApiResponse({ status: 200, description: 'Feedback recorded successfully' })
  async updateResponseSuccess(
    @Param('id') id: string,
    @Body() data: { wasSuccessful: boolean }
  ) {
    try {
      return this.knowledgeBaseService.updateResponseSuccess(id, data.wasSuccessful);
    } catch (error) {
      this.logger.error(`Error updating response success: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to update response success');
    }
  }

  @Put(':businessId/feedback')
@ApiOperation({ summary: 'Submit feedback for any response' })
@ApiParam({ name: 'businessId', description: 'Business ID' })
@ApiBody({ 
  description: 'Feedback data',
  schema: {
    type: 'object',
    properties: {
      sourceId: { type: 'string', description: 'ID of the source (query-response, knowledge doc, etc.)' },
      sourceType: { type: 'string', description: 'Type of the source (query-response, knowledge-doc, message)' },
      wasHelpful: { type: 'boolean', description: 'Was the response helpful' },
      messageId: { type: 'string', description: 'ID of the message being rated' },
      sessionId: { type: 'string', description: 'ID of the chat session' },
      feedbackText: { type: 'string', description: 'Optional feedback text' }
    },
    required: ['wasHelpful', 'messageId']
  }
})
@ApiResponse({ status: 200, description: 'Feedback recorded successfully' })
@ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
async submitFeedback(
  @Param('businessId') businessId: string,
  @Headers('business-x-api-key') apiKey: string,
  @Body() data: {
    sourceId?: string;
    sourceType?: 'query-response' | 'knowledge-doc' | 'message' | string;
    wasHelpful: boolean;
    messageId: string;
    sessionId?: string;
    feedbackText?: string;
  }
): Promise<{ success: boolean }> {
  try {
    // Verify API key is valid for this business
    const business = await this.chatbotService.validateBusinessApiKey(businessId, apiKey);
    
    // Record the feedback based on source type
    if (data.sourceId && data.sourceType === 'query-response') {
      try {
        // Try to update the query-response pair
        await this.knowledgeBaseService.updateResponseSuccess(
          data.sourceId, 
          data.wasHelpful
        );
      } catch (error) {
        // If not found, log it but don't fail the request
        if (error instanceof NotFoundException) {
          this.logger.warn(`Query-response pair with ID ${data.sourceId} not found. Recording feedback only.`);
        } else {
          throw error;
        }
      }
    }
    
    // Always record the feedback in the message metadata
    if (data.messageId) {
      await this.chatbotService.recordMessageFeedback(
        businessId,
        business.clientId,
        data.messageId,
        data.wasHelpful,
        data.feedbackText || null
      );
    }
    
    return { success: true };
  } catch (error) {
    this.logger.error(`Error recording feedback: ${error.message}`, error.stack);
    if (error instanceof UnauthorizedException) {
      throw error;
    } else {
      throw new InternalServerErrorException('Failed to record feedback');
    }
  }
}
}