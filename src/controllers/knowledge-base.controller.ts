import { Controller, Get, Post, Req, Body, Param, Query, Delete, Put, Headers, UseGuards, UnauthorizedException, Logger, InternalServerErrorException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiParam, ApiBody, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { KnowledgeBaseService } from '../services/knowledge-base.service';
import { BusinessService } from '../services/business.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';

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
    @Req() req: Request & { client: Client }
  ) {
    try {
      // Add clientId from authenticated request
      return this.knowledgeBaseService.createDocument({
        ...documentData,
        createdBy: 'Staffluent Superadmin', // Or get current user
        clientId: req.client.id
      });
    } catch (error) {
      this.logger.error(`Error creating knowledge document: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to create knowledge document');
    }
  }

  @Get('documents/:id')
  @ApiOperation({ summary: 'Get knowledge document by ID' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'Returns document' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async findOne(
    @Param('id') id: string,
    @Req() req: Request & { client: Client }
  ) {
    try {
      // Include clientId check when fetching document
      return this.knowledgeBaseService.findOne(id, req.client.id);
    } catch (error) {
      this.logger.error(`Error finding knowledge document: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to find knowledge document');
    }
  }

  @Get('documents')
  @ApiOperation({ summary: 'Get all knowledge documents' })
  @ApiQuery({ name: 'search', required: false, description: 'Search query' })
  @ApiQuery({ name: 'categories', required: false, description: 'Categories filter (comma-separated)' })
  @ApiQuery({ name: 'type', required: false, description: 'Document type' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit results' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiResponse({ status: 200, description: 'Returns all documents' })
  async findAll(
    @Req() req: Request & { client: Client },
    @Query('search') search?: string,
    @Query('categories') categoriesStr?: string,
    @Query('type') type?: string,
    @Query('limit') limit = 10,
    @Query('page') page = 1
  ) {
    try {
      const categories = categoriesStr ? categoriesStr.split(',') : [];
      
      // Pass clientId from authenticated request
      return this.knowledgeBaseService.findAll({
        clientId: req.client.id,
        search,
        categories,
        type,
        limit,
        page
      });
    } catch (error) {
      this.logger.error(`Error finding knowledge documents: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to find knowledge documents');
    }
  }

  @Put('documents/:id')
  @ApiOperation({ summary: 'Update a knowledge document' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'Document updated successfully' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async updateDocument(
    @Param('id') id: string,
    @Body() updates: any,
    @Req() req: Request & { client: Client }
  ) {
    try {
      // Pass clientId for ownership verification
      return this.knowledgeBaseService.updateDocument(id, req.client.id, updates);
    } catch (error) {
      this.logger.error(`Error updating knowledge document: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to update knowledge document');
    }
  }

  @Delete('documents/:id')
  @ApiOperation({ summary: 'Delete a knowledge document' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'Document deleted successfully' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async deleteDocument(
    @Param('id') id: string,
    @Req() req: Request & { client: Client }
  ) {
    try {
      // Pass clientId for ownership verification
      const success = await this.knowledgeBaseService.deleteDocument(id, req.client.id);
      return { success };
    } catch (error) {
      this.logger.error(`Error deleting knowledge document: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to delete knowledge document');
    }
  }

  @Get('search')
  @ApiOperation({ summary: 'Search knowledge documents' })
  @ApiQuery({ name: 'query', required: false, description: 'Search query' })
  @ApiQuery({ name: 'businessType', required: false, description: 'Business type filter' })
  @ApiQuery({ name: 'features', required: false, description: 'Features filter (comma-separated)' })
  @ApiQuery({ name: 'categories', required: false, description: 'Categories filter (comma-separated)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit results' })
  @ApiResponse({ status: 200, description: 'Returns matching documents' })
  async searchDocuments(
    @Req() req: Request & { client: Client },
    @Query('query') query: string = '',
    @Query('businessType') businessType: string = 'default',
    @Query('features') featuresStr: string = '',
    @Query('categories') categoriesStr: string = '',
    @Query('limit') limit: number = 10
  ) {
    try {
      const features = featuresStr ? featuresStr.split(',') : [];
      const categories = categoriesStr ? categoriesStr.split(',') : [];
      
      // Include clientId in search to restrict results to this client
      const documents = await this.knowledgeBaseService.searchDocuments(
        query,
        {
          clientId: req.client.id, // Add clientId from authenticated request
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
    @Req() req: Request & { client: Client },
    @Query('limit') limit: number = 20,
    @Query('page') page: number = 1,
    @Query('businessType') businessType: string
  ) {
    try {
      // Include clientId to restrict results to this client
      return this.knowledgeBaseService.getPendingQueries({
        clientId: req.client.id, // Add clientId from authenticated request
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
  @ApiResponse({ status: 404, description: 'Query not found' })
  async respondToQuery(
    @Param('id') id: string,
    @Body() data: {
      response: string;
      createKnowledgeDoc?: boolean;
      knowledgeDocData?: any;
    },
    @Req() req: Request & { client: Client }
  ) {
    try {
      // Pass clientId for ownership verification
      return this.knowledgeBaseService.respondToUnrecognizedQuery(
        id,
        data.response,
        'Staffluent Superadmin', // Or current user
        req.client.id, // Add clientId from authenticated request
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
    },
    @Req() req: Request & { client: Client }
  ) {
    try {
      // Add clientId to pair data
      return this.knowledgeBaseService.createQueryResponsePair({
        ...pairData,
        clientId: req.client.id // Add clientId from authenticated request
      });
    } catch (error) {
      this.logger.error(`Error creating query-response pair: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to create query-response pair');
    }
  }

  @Post('feedback/:id')
  @ApiOperation({ summary: 'Provide feedback on a response' })
  @ApiParam({ name: 'id', description: 'Response ID' })
  @ApiBody({
    description: 'Feedback data',
    schema: {
      type: 'object',
      properties: {
        wasHelpful: { type: 'boolean' }
      },
      required: ['wasHelpful']
    }
  })
  @ApiResponse({ status: 200, description: 'Feedback recorded successfully' })
  @ApiResponse({ status: 404, description: 'Response not found' })
  async provideFeedback(
    @Param('id') id: string,
    @Body() data: { wasHelpful: boolean },
    @Req() req: Request & { client: Client }
  ) {
    try {
      // Pass clientId for ownership verification
      return this.knowledgeBaseService.updateResponseSuccess(
        id,
        data.wasHelpful,
        req.client.id // Add clientId from authenticated request
      );
    } catch (error) {
      this.logger.error(`Error recording feedback: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to record feedback');
    }
  }

  // *** ADDED NEW ENDPOINTS BELOW ***

  @Get('query-responses/statistics')
  @ApiOperation({ summary: 'Get feedback statistics for responses' })
  @ApiQuery({ 
    name: 'timeframe', 
    required: false, 
    description: 'Timeframe (day, week, month, year)',
    enum: ['day', 'week', 'month', 'year']
  })
  @ApiResponse({ status: 200, description: 'Returns statistics on response feedback' })
  async getResponseStatistics(
    @Req() req: Request & { client: Client },
    @Query('timeframe') timeframe: 'day' | 'week' | 'month' | 'year' = 'month'
  ) {
    try {
      // Pass clientId to restrict data to this client
      return this.knowledgeBaseService.getResponseStatistics(
        req.client.id,
        timeframe
      );
    } catch (error) {
      this.logger.error(`Error getting response statistics: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to get response statistics');
    }
  }

  @Get('query-responses')
  @ApiOperation({ summary: 'List query-response pairs' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit results' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'search', required: false, description: 'Search in query and response content' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Field to sort by (createdAt, useCount, successRate)' })
  @ApiQuery({ name: 'sortDirection', required: false, description: 'Sort direction (asc, desc)' })
  @ApiResponse({ status: 200, description: 'Returns query-response pairs' })
  async listQueryResponsePairs(
    @Req() req: Request & { client: Client },
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDirection') sortDirection?: 'asc' | 'desc'
  ) {
    try {
      // Pass clientId to restrict results to this client
      return this.knowledgeBaseService.listQueryResponsePairs({
        clientId: req.client.id,
        page,
        limit,
        category,
        search,
        sortBy,
        sortDirection
      });
    } catch (error) {
      this.logger.error(`Error listing query-response pairs: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to list query-response pairs');
    }
  }

  @Get('query-responses/:id')
  @ApiOperation({ summary: 'Get query-response pair by ID' })
  @ApiParam({ name: 'id', description: 'Pair ID' })
  @ApiResponse({ status: 200, description: 'Returns query-response pair' })
  @ApiResponse({ status: 404, description: 'Pair not found' })
  async getQueryResponsePair(
    @Param('id') id: string,
    @Req() req: Request & { client: Client }
  ) {
    try {
      // Include clientId check for security
      return this.knowledgeBaseService.getQueryResponsePair(id, req.client.id);
    } catch (error) {
      this.logger.error(`Error getting query-response pair: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to get query-response pair');
    }
  }

  @Put('query-responses/:id')
  @ApiOperation({ summary: 'Update a query-response pair' })
  @ApiParam({ name: 'id', description: 'Pair ID' })
  @ApiBody({
    description: 'Update data',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        response: { type: 'string' },
        category: { type: 'string' },
        keywords: { type: 'array', items: { type: 'string' } },
        active: { type: 'boolean' }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Pair updated successfully' })
  @ApiResponse({ status: 404, description: 'Pair not found' })
  async updateQueryResponsePair(
    @Param('id') id: string,
    @Body() updates: {
      query?: string;
      response?: string;
      category?: string;
      keywords?: string[];
      active?: boolean;
    },
    @Req() req: Request & { client: Client }
  ) {
    try {
      // Pass clientId for ownership verification
      return this.knowledgeBaseService.updateQueryResponsePair(
        id,
        req.client.id,
        updates
      );
    } catch (error) {
      this.logger.error(`Error updating query-response pair: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to update query-response pair');
    }
  }
}