// src/controllers/ticket.controller.ts (Updated with Admin User ID for business endpoints)
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
  Logger, 
  InternalServerErrorException,
  Req,
  UseGuards
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiParam, ApiBody, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { 
  TicketService, 
  CreateTicketDto, 
  AddMessageDto, 
  UpdateTicketDto, 
  TicketListResponse,
  TicketFilters
} from '../services/ticket.service';
import { BusinessChatbotService } from '../services/business-chatbot.service';
import { Ticket, TicketStatus, TicketPriority, TicketCategory } from '../schemas/ticket.schema';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';

@ApiTags('Support Tickets')
@Controller('tickets')
export class TicketController {
  private readonly logger = new Logger(TicketController.name);

  constructor(
    private readonly ticketService: TicketService,
    private readonly businessChatbotService: BusinessChatbotService
  ) {}

  // ========== BUSINESS ENDPOINTS WITH ADMIN USER ID ==========

  @Post('business/:businessId')
  @ApiOperation({ summary: 'Create a new support ticket' })
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiBody({ 
    description: 'Ticket data',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Ticket title' },
        description: { type: 'string', description: 'Ticket description' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Ticket priority' },
        category: { type: 'string', enum: ['technical', 'billing', 'feature_request', 'bug', 'account', 'training', 'other'], description: 'Ticket category' },
        createdByName: { type: 'string', description: 'Name of person creating ticket' },
        createdByEmail: { type: 'string', description: 'Email of person creating ticket' },
        createdByUserId: { type: 'string', description: 'Optional user ID' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags' },
        metadata: { type: 'object', description: 'Optional metadata' }
      },
      required: ['title', 'description', 'createdByName', 'createdByEmail']
    }
  })
  @ApiResponse({ status: 201, description: 'Ticket created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async createTicket(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Body() createTicketDto: CreateTicketDto,
    @Req() req: any
  ): Promise<Ticket> {
    try {
      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.businessChatbotService.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID
      
      // 🎯 PASS ADMIN USER ID TO SERVICE
      return await this.ticketService.createTicket(
        businessId,
        business.clientId,
        createTicketDto,
        adminUserId, // Pass admin user ID for activity tracking
        req // Pass request for IP/UserAgent
      );
    } catch (error) {
      this.logger.error(`Error creating ticket: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to create ticket');
      }
    }
  }

  @Get('business/:businessId')
  @ApiOperation({ summary: 'Get tickets for a business' })
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'status', required: false, enum: TicketStatus, description: 'Filter by status' })
  @ApiQuery({ name: 'priority', required: false, enum: TicketPriority, description: 'Filter by priority' })
  @ApiQuery({ name: 'category', required: false, enum: TicketCategory, description: 'Filter by category' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Returns business tickets' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async getBusinessTickets(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Query('status') status?: TicketStatus,
    @Query('priority') priority?: TicketPriority,
    @Query('category') category?: TicketCategory,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Req() req?: any
  ): Promise<TicketListResponse> {
    try {
      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.businessChatbotService.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID
      
      const filters: TicketFilters = {};
      if (status) filters.status = status;
      if (priority) filters.priority = priority;
      if (category) filters.category = category;

      // 🎯 PASS ADMIN USER ID TO SERVICE
      return await this.ticketService.getBusinessTickets(
        businessId,
        business.clientId,
        filters,
        page || 1,
        limit || 20,
        adminUserId, // Pass admin user ID for activity tracking
        req // Pass request for IP/UserAgent
      );
    } catch (error) {
      this.logger.error(`Error getting business tickets: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to get tickets');
      }
    }
  }

  @Get('business/:businessId/stats')
  @ApiOperation({ summary: 'Get ticket statistics for a business' })
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiResponse({ status: 200, description: 'Returns ticket statistics' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async getBusinessTicketStats(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Req() req?: any
  ): Promise<any> {
    try {
      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.businessChatbotService.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID
      
      // 🎯 PASS ADMIN USER ID TO SERVICE
      return await this.ticketService.getTicketStats(
        businessId,
        undefined, // no clientId for business access
        adminUserId, // Pass admin user ID for activity tracking
        req // Pass request for IP/UserAgent
      );
    } catch (error) {
      this.logger.error(`Error getting ticket stats: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to get ticket stats');
      }
    }
  }

  @Get('business/:businessId/:ticketId')
  @ApiOperation({ summary: 'Get a specific ticket' })
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiParam({ name: 'ticketId', description: 'Ticket ID' })
  @ApiResponse({ status: 200, description: 'Returns the ticket' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async getBusinessTicket(
    @Param('businessId') businessId: string,
    @Param('ticketId') ticketId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Req() req?: any
  ): Promise<Ticket> {
    try {
      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.businessChatbotService.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID
      
      // 🎯 PASS ADMIN USER ID TO SERVICE
      return await this.ticketService.getTicket(
        ticketId, 
        businessId,
        undefined, // no clientId for business access
        adminUserId, // Pass admin user ID for activity tracking
        req // Pass request for IP/UserAgent
      );
    } catch (error) {
      this.logger.error(`Error getting ticket: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to get ticket');
      }
    }
  }

  @Post('business/:businessId/:ticketId/messages')
  @ApiOperation({ summary: 'Add a message to a ticket' })
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiParam({ name: 'ticketId', description: 'Ticket ID' })
  @ApiBody({ 
    description: 'Message data',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message content' },
        senderName: { type: 'string', description: 'Name of sender' },
        senderEmail: { type: 'string', description: 'Email of sender' },
        attachments: { type: 'array', items: { type: 'string' }, description: 'Optional attachments' },
        metadata: { type: 'object', description: 'Optional metadata' }
      },
      required: ['message', 'senderName', 'senderEmail']
    }
  })
  @ApiResponse({ status: 200, description: 'Message added successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async addBusinessMessage(
    @Param('businessId') businessId: string,
    @Param('ticketId') ticketId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Body() addMessageDto: AddMessageDto,
    @Req() req: any
  ): Promise<Ticket> {
    try {
      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.businessChatbotService.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID
      
      // 🎯 PASS ADMIN USER ID TO SERVICE
      return await this.ticketService.addMessage(
        ticketId,
        addMessageDto,
        'business',
        businessId,
        undefined, // no clientId for business messages
        adminUserId, // Pass admin user ID for activity tracking
        req // Pass request for IP/UserAgent
      );
    } catch (error) {
      this.logger.error(`Error adding message to ticket: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to add message');
      }
    }
  }

  // ========== SUPPORT TEAM ENDPOINTS (NO USER ID NEEDED - NO AUDIT LOGGING) ==========

  @Get('support/all')
  @UseGuards(ClientAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all tickets (Support team only)' })
  @ApiQuery({ name: 'status', required: false, enum: TicketStatus, description: 'Filter by status' })
  @ApiQuery({ name: 'priority', required: false, enum: TicketPriority, description: 'Filter by priority' })
  @ApiQuery({ name: 'category', required: false, enum: TicketCategory, description: 'Filter by category' })
  @ApiQuery({ name: 'assignedTo', required: false, description: 'Filter by assigned support agent' })
  @ApiQuery({ name: 'search', required: false, description: 'Search in ticket title or description' })
  @ApiQuery({ name: 'businessId', required: false, description: 'Filter by business' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Returns all tickets' })
  async getAllTickets(
    @Req() req: Request & { client: Client },
    @Query('status') status?: TicketStatus,
    @Query('priority') priority?: TicketPriority,
    @Query('category') category?: TicketCategory,
    @Query('assignedTo') assignedTo?: string,
    @Query('search') search?: string,
    @Query('businessId') businessId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ): Promise<TicketListResponse> {
    try {
      const clientId = req.client.id;
      const filters: TicketFilters = { clientId };
      
      if (status) filters.status = status;
      if (priority) filters.priority = priority;
      if (category) filters.category = category;
      if (assignedTo) filters.assignedTo = assignedTo;
      if (search) filters.search = search;
      if (businessId) filters.businessId = businessId;

      // ✅ NO USER ID - Support team actions don't get audit logged
      return await this.ticketService.getAllTickets(
        filters,
        page || 1,
        limit || 20
      );
    } catch (error) {
      this.logger.error(`Error getting all tickets: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to get tickets');
    }
  }

  @Get('support/stats')
  @UseGuards(ClientAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get overall ticket statistics (Support team)' })
  @ApiResponse({ status: 200, description: 'Returns ticket statistics' })
  async getAllTicketStats(
    @Req() req: Request & { client: Client }
  ): Promise<any> {
    try {
      const clientId = req.client.id;
      // ✅ NO USER ID - Support team actions don't get audit logged
      return await this.ticketService.getTicketStats(undefined, clientId);
    } catch (error) {
      this.logger.error(`Error getting ticket stats: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to get ticket stats');
    }
  }

  @Get('support/:ticketId')
  @UseGuards(ClientAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a specific ticket (Support team)' })
  @ApiParam({ name: 'ticketId', description: 'Ticket ID' })
  @ApiResponse({ status: 200, description: 'Returns the ticket' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async getSupportTicket(
    @Req() req: Request & { client: Client },
    @Param('ticketId') ticketId: string
  ): Promise<Ticket> {
    try {
      const clientId = req.client.id;
      // ✅ NO USER ID - Support team actions don't get audit logged
      return await this.ticketService.getTicket(ticketId, undefined, clientId);
    } catch (error) {
      this.logger.error(`Error getting ticket: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to get ticket');
    }
  }

  @Put('support/:ticketId')
  @UseGuards(ClientAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update ticket (Support team only)' })
  @ApiParam({ name: 'ticketId', description: 'Ticket ID' })
  @ApiBody({ 
    description: 'Update data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed', 'duplicate'] },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        category: { type: 'string', enum: ['technical', 'billing', 'feature_request', 'bug', 'account', 'training', 'other'] },
        assignedTo: { type: 'string', description: 'Assigned support agent name' },
        assignedToEmail: { type: 'string', description: 'Assigned support agent email' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
        duplicateOf: { type: 'string', description: 'ID of original ticket if this is a duplicate' },
        resolutionNotes: { type: 'string', description: 'Resolution notes' }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Ticket updated successfully' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async updateTicket(
    @Req() req: Request & { client: Client },
    @Param('ticketId') ticketId: string,
    @Body() updateTicketDto: UpdateTicketDto
  ): Promise<Ticket> {
    try {
      const clientId = req.client.id;
      // ✅ NO USER ID - Support team actions don't get audit logged
      return await this.ticketService.updateTicket(ticketId, updateTicketDto, clientId);
    } catch (error) {
      this.logger.error(`Error updating ticket: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to update ticket');
    }
  }

  @Post('support/:ticketId/messages')
  @UseGuards(ClientAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add support message to ticket' })
  @ApiParam({ name: 'ticketId', description: 'Ticket ID' })
  @ApiBody({ 
    description: 'Message data',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message content' },
        senderName: { type: 'string', description: 'Support agent name' },
        senderEmail: { type: 'string', description: 'Support agent email' },
        attachments: { type: 'array', items: { type: 'string' }, description: 'Optional attachments' },
        metadata: { type: 'object', description: 'Optional metadata' }
      },
      required: ['message', 'senderName', 'senderEmail']
    }
  })
  @ApiResponse({ status: 200, description: 'Message added successfully' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async addSupportMessage(
    @Req() req: Request & { client: Client },
    @Param('ticketId') ticketId: string,
    @Body() addMessageDto: AddMessageDto
  ): Promise<Ticket> {
    try {
      const clientId = req.client.id;
      // ✅ NO USER ID - Support team actions don't get audit logged
      const result = await this.ticketService.addMessage(
        ticketId,
        addMessageDto,
        'support',
        undefined,
        clientId
      );
      
      // Return both ticket and notification debugging info
      return {
        // @ts-ignore
        ticket: result.ticket,
        notificationDebug: result.notificationResult // This will show OneSignal debug info
      };
    } catch (error) {
      this.logger.error(`Error adding support message: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to add message');
    }
  }

  @Delete('support/:ticketId')
  @UseGuards(ClientAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete/archive ticket (Support team only)' })
  @ApiParam({ name: 'ticketId', description: 'Ticket ID' })
  @ApiResponse({ status: 200, description: 'Ticket deleted successfully' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async deleteTicket(
    @Req() req: Request & { client: Client },
    @Param('ticketId') ticketId: string
  ): Promise<{ success: boolean }> {
    try {
      const clientId = req.client.id;
      // ✅ NO USER ID - Support team actions don't get audit logged
      return await this.ticketService.deleteTicket(ticketId, clientId);
    } catch (error) {
      this.logger.error(`Error deleting ticket: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to delete ticket');
    }
  }
}