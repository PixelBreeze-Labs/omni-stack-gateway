// src/controllers/knowledge-base.controller.ts
import { Controller, Get, Post, Body, Param, Query, Delete, Put, Headers, UseGuards, UnauthorizedException, Logger, InternalServerErrorException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiParam, ApiBody, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { KnowledgeBaseService } from '../services/knowledge-base.service';
import { BusinessService } from '../services/business.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';

@ApiTags('Knowledge Base')
@ApiBearerAuth()
@Controller('knowledge-base')
@UseGuards(ClientAuthGuard)
@ApiHeader({ name: 'Authorization', required: true, description: 'JWT Token for authentication' })
export class KnowledgeBaseController {
  private readonly logger = new Logger(KnowledgeBaseController.name);

  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly businessService: BusinessService
  ) {}

  @Post('documents')
  @ApiOperation({ summary: 'Create a new knowledge document' })
  @ApiBody({ 
    description: 'Knowledge document data',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        keywords: { type: 'array', items: { type: 'string' } },
        type: { type: 'string', enum: ['article', 'faq', 'guide', 'announcement'] },
        categories: { type: 'array', items: { type: 'string' } },
        applicableBusinessTypes: { type: 'array', items: { type: 'string' } },
        applicableFeatures: { type: 'array', items: { type: 'string' } }
      },
      required: ['title', 'content']
    }
  })
  @ApiResponse({ status: 201, description: 'Document created successfully' })
  async createDocument(
    @Body() documentData: any,
  ) {
    try {
      return this.knowledgeBaseService.createDocument({
        ...documentData,
        createdBy: 'Staffluent Superadmin'
      });
    } catch (error) {
      this.logger.error(`Error creating knowledge document: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to create knowledge document');
    }
  }

  @Put('documents/:id')
  @ApiOperation({ summary: 'Update a knowledge document' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'Document updated successfully' })
  async updateDocument(
    @Param('id') id: string,
    @Body() updates: any
  ) {
    try {
      return this.knowledgeBaseService.updateDocument(id, updates);
    } catch (error) {
      this.logger.error(`Error updating knowledge document: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to update knowledge document');
    }
  }

  @Delete('documents/:id')
  @ApiOperation({ summary: 'Delete a knowledge document' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'Document deleted successfully' })
  async deleteDocument(
    @Param('id') id: string
  ) {
    try {
      const success = await this.knowledgeBaseService.deleteDocument(id);
      return { success };
    } catch (error) {
      this.logger.error(`Error deleting knowledge document: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to delete knowledge document');
    }
  }

  @Get('documents')
  @ApiOperation({ summary: 'Search knowledge documents' })
  @ApiQuery({ name: 'query', required: false, description: 'Search query' })
  @ApiQuery({ name: 'businessType', required: false, description: 'Business type filter' })
  @ApiQuery({ name: 'features', required: false, description: 'Features filter (comma-separated)' })
  @ApiQuery({ name: 'categories', required: false, description: 'Categories filter (comma-separated)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit results' })
  @ApiResponse({ status: 200, description: 'Returns matching documents' })
  async searchDocuments(
    @Query('query') query: string = '',
    @Query('businessType') businessType: string = 'default',
    @Query('features') featuresStr: string = '',
    @Query('categories') categoriesStr: string = '',
    @Query('limit') limit: number = 10
  ) {
    try {
      const features = featuresStr ? featuresStr.split(',') : [];
      const categories = categoriesStr ? categoriesStr.split(',') : [];
      
      const documents = await this.knowledgeBaseService.searchDocuments(
        query,
        {
          businessType,
          features,
          categories,
          limit
        }
      );
      
      return { documents, success: true };
    } catch (error) {
      this.logger.error(`Error searching knowledge documents: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to search knowledge documents');
    }
  }

  @Get('unrecognized-queries')
  @ApiOperation({ summary: 'Get unrecognized queries' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit results' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'businessType', required: false, description: 'Business type filter' })
  @ApiResponse({ status: 200, description: 'Returns unrecognized queries' })
  async getUnrecognizedQueries(
    @Query('limit') limit: number = 20,
    @Query('page') page: number = 1,
    @Query('businessType') businessType: string
  ) {
    try {
      return this.knowledgeBaseService.getPendingQueries({
        limit,
        page,
        businessType
      });
    } catch (error) {
      this.logger.error(`Error getting unrecognized queries: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to get unrecognized queries');
    }
  }

  @Post('unrecognized-queries/:id/respond')
  @ApiOperation({ summary: 'Respond to an unrecognized query' })
  @ApiParam({ name: 'id', description: 'Query ID' })
  @ApiBody({ 
    description: 'Response data',
    schema: {
      type: 'object',
      properties: {
        response: { type: 'string' },
        createKnowledgeDoc: { type: 'boolean' },
        knowledgeDocData: { 
          type: 'object',
          properties: {
            title: { type: 'string' },
            type: { type: 'string' },
            categories: { type: 'array', items: { type: 'string' } },
            applicableBusinessTypes: { type: 'array', items: { type: 'string' } },
            applicableFeatures: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      required: ['response']
    }
  })
  @ApiResponse({ status: 200, description: 'Query responded successfully' })
  async respondToQuery(
    @Param('id') id: string,
    @Body() data: {
      response: string;
      createKnowledgeDoc?: boolean;
      knowledgeDocData?: any;
    },
  ) {
    try {
      return this.knowledgeBaseService.respondToUnrecognizedQuery(
        id,
        data.response,
        'Staffluent Superadmin',
        data.createKnowledgeDoc || false,
        data.knowledgeDocData
      );
    } catch (error) {
      this.logger.error(`Error responding to query: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to respond to query');
    }
  }

  @Post('query-responses')
  @ApiOperation({ summary: 'Create a query-response pair' })
  @ApiBody({ 
    description: 'Query-response pair data',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        response: { type: 'string' },
        category: { type: 'string' },
        keywords: { type: 'array', items: { type: 'string' } }
      },
      required: ['query', 'response']
    }
  })
  @ApiResponse({ status: 201, description: 'Query-response pair created successfully' })
  async createQueryResponsePair(
    @Body() pairData: {
      query: string;
      response: string;
      category?: string;
      keywords?: string[];
    }
  ) {
    try {
      return this.knowledgeBaseService.createQueryResponsePair(pairData);
    } catch (error) {
      this.logger.error(`Error creating query-response pair: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to create query-response pair');
    }
  }
}