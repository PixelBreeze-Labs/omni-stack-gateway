// src/controllers/client-feedback.controller.ts
import { 
    Controller, 
    Get, 
    Post,
    Put,
    Delete,
    Body, 
    Query,
    Param,
    UseGuards,
    Request,
    Logger,
    BadRequestException,
    InternalServerErrorException,
    HttpCode,
    HttpStatus
  } from '@nestjs/common';
  import { 
    ApiTags, 
    ApiOperation, 
    ApiQuery, 
    ApiBody, 
    ApiResponse,
    ApiParam,
    ApiBearerAuth
  } from '@nestjs/swagger';
  import { AppClientAuthGuard } from '../guards/app-client-auth.guard';
  import { 
    ClientFeedbackService,
    CreateClientFeedbackDto,
    UpdateClientFeedbackDto 
  } from '../services/client-feedback.service';
  import { FeedbackType, FeedbackPriority, FeedbackStatus } from '../schemas/client-feedback.schema';
  
  // DTOs for Swagger documentation
  class CreateFeedbackApiDto {
    appProjectId: string;
    subject: string;
    comment: string;
    type: FeedbackType;
    priority?: FeedbackPriority;
    rating?: number; // 1-5
    serviceCategory?: string;
    attachments?: string[];
    clientName: string;
    clientEmail?: string;
    clientPhone?: string;
    allowBusinessContact?: boolean;
    isAnonymous?: boolean;
    metadata?: any;
  }
  
  class UpdateFeedbackApiDto {
    subject?: string;
    comment?: string;
    type?: FeedbackType;
    priority?: FeedbackPriority;
    rating?: number;
    attachments?: string[];
    allowBusinessContact?: boolean;
    metadata?: any;
  }
  
  @ApiTags('Client Feedback - Client Side')
  @Controller('client/feedback')
  @UseGuards(AppClientAuthGuard)
  @ApiBearerAuth()
  export class ClientFeedbackController {
    private readonly logger = new Logger(ClientFeedbackController.name);
  
    constructor(
      private readonly clientFeedbackService: ClientFeedbackService
    ) {}
  
    @Post()
    @ApiOperation({ summary: 'Submit feedback for a completed project' })
    @ApiBody({ type: CreateFeedbackApiDto })
    @ApiResponse({ status: 201, description: 'Feedback submitted successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid feedback data or project not completed' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 404, description: 'Project not found' })
    async createFeedback(
      @Body() createFeedbackDto: CreateFeedbackApiDto,
      @Request() req: any
    ) {
      try {
        const { user } = req;
        const appClientId = user.appClientId;
  
        if (!createFeedbackDto.appProjectId) {
          throw new BadRequestException('Project ID is required');
        }
  
        if (!createFeedbackDto.subject || !createFeedbackDto.comment) {
          throw new BadRequestException('Subject and comment are required');
        }
  
        if (!createFeedbackDto.type) {
          throw new BadRequestException('Feedback type is required');
        }
  
        if (createFeedbackDto.rating && (createFeedbackDto.rating < 1 || createFeedbackDto.rating > 5)) {
          throw new BadRequestException('Rating must be between 1 and 5');
        }
  
        this.logger.log(`Client submitting feedback for project: ${createFeedbackDto.appProjectId} by client: ${appClientId}`);
  
        const feedback = await this.clientFeedbackService.createFeedback(
          appClientId,
          createFeedbackDto as CreateClientFeedbackDto
        );
  
        return {
          status: 'success',
          message: 'Feedback submitted successfully. It will be reviewed before being shared with the business.',
          data: {
            feedback
          }
        };
      } catch (error) {
        this.logger.error(`Error creating feedback: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to submit feedback');
      }
    }
  
    @Get()
    @ApiOperation({ summary: 'Get all feedback submitted by the client' })
    @ApiQuery({ name: 'status', required: false, description: 'Filter by status (pending, approved, responded, etc.)' })
    @ApiQuery({ name: 'type', required: false, description: 'Filter by type (complaint, suggestion, compliment, etc.)' })
    @ApiQuery({ name: 'priority', required: false, description: 'Filter by priority (low, medium, high, urgent)' })
    @ApiQuery({ name: 'rating', required: false, description: 'Filter by rating (1-5)' })
    @ApiQuery({ name: 'serviceCategory', required: false, description: 'Filter by service category' })
    @ApiQuery({ name: 'startDate', required: false, description: 'Start date for date range filter' })
    @ApiQuery({ name: 'endDate', required: false, description: 'End date for date range filter' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
    @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10)' })
    @ApiQuery({ name: 'sortBy', required: false, description: 'Sort by field (default: submittedAt)' })
    @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order (asc/desc, default: desc)' })
    @ApiResponse({ status: 200, description: 'Feedback list retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    async getMyFeedbacks(
      @Query('status') status?: FeedbackStatus,
      @Query('type') type?: FeedbackType,
      @Query('priority') priority?: FeedbackPriority,
      @Query('rating') rating?: string,
      @Query('serviceCategory') serviceCategory?: string,
      @Query('startDate') startDate?: string,
      @Query('endDate') endDate?: string,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
      @Query('sortBy') sortBy?: string,
      @Query('sortOrder') sortOrder?: 'asc' | 'desc',
      @Request() req?: any
    ) {
      try {
        const { user } = req;
        const appClientId = user.appClientId;
  
        this.logger.log(`Getting feedback list for client: ${appClientId}`);
  
        // Parse date range if provided
        let parsedStartDate: Date | undefined;
        let parsedEndDate: Date | undefined;
  
        if (startDate) {
          parsedStartDate = new Date(startDate);
          if (isNaN(parsedStartDate.getTime())) {
            throw new BadRequestException('Invalid start date format. Use ISO date strings.');
          }
        }
  
        if (endDate) {
          parsedEndDate = new Date(endDate);
          if (isNaN(parsedEndDate.getTime())) {
            throw new BadRequestException('Invalid end date format. Use ISO date strings.');
          }
        }
  
        const query = {
          status,
          type,
          priority,
          rating: rating ? parseInt(rating) : undefined,
          serviceCategory,
          startDate: parsedStartDate,
          endDate: parsedEndDate,
          page: page ? parseInt(page) : 1,
          limit: limit ? parseInt(limit) : 10,
          sortBy: sortBy || 'submittedAt',
          sortOrder: sortOrder || 'desc'
        };
  
        const result = await this.clientFeedbackService.getClientFeedbacks(appClientId, query);
  
        return {
          status: 'success',
          message: 'Feedback list retrieved successfully',
          data: {
            feedbacks: result.feedbacks,
            pagination: {
              total: result.total,
              page: result.page,
              totalPages: result.totalPages,
              limit: result.limit
            }
          }
        };
      } catch (error) {
        this.logger.error(`Error getting client feedbacks: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get feedback list');
      }
    }
  
    @Get('stats')
    @ApiOperation({ summary: 'Get client feedback statistics' })
    @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    async getMyFeedbackStats(@Request() req: any) {
      try {
        const { user } = req;
        const appClientId = user.appClientId;
  
        this.logger.log(`Getting feedback statistics for client: ${appClientId}`);
  
        const stats = await this.clientFeedbackService.getClientFeedbackStats(appClientId);
  
        return {
          status: 'success',
          message: 'Feedback statistics retrieved successfully',
          data: stats
        };
      } catch (error) {
        this.logger.error(`Error getting feedback stats: ${error.message}`, error.stack);
        throw new InternalServerErrorException('Failed to get feedback statistics');
      }
    }
  
    @Get(':feedbackId')
    @ApiOperation({ summary: 'Get specific feedback details' })
    @ApiParam({ name: 'feedbackId', description: 'Feedback ID' })
    @ApiResponse({ status: 200, description: 'Feedback retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 404, description: 'Feedback not found' })
    async getFeedbackById(
      @Param('feedbackId') feedbackId: string,
      @Request() req: any
    ) {
      try {
        const { user } = req;
        const appClientId = user.appClientId;
  
        if (!feedbackId) {
          throw new BadRequestException('Feedback ID is required');
        }
  
        this.logger.log(`Getting feedback details: ${feedbackId} for client: ${appClientId}`);
  
        const feedback = await this.clientFeedbackService.getFeedbackById(feedbackId, appClientId);
  
        return {
          status: 'success',
          message: 'Feedback retrieved successfully',
          data: {
            feedback
          }
        };
      } catch (error) {
        this.logger.error(`Error getting feedback details: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get feedback details');
      }
    }
  
    @Put(':feedbackId')
    @ApiOperation({ summary: 'Update pending feedback' })
    @ApiParam({ name: 'feedbackId', description: 'Feedback ID to update' })
    @ApiBody({ type: UpdateFeedbackApiDto })
    @ApiResponse({ status: 200, description: 'Feedback updated successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Cannot update non-pending feedback or invalid data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 404, description: 'Feedback not found' })
    async updateFeedback(
      @Param('feedbackId') feedbackId: string,
      @Body() updateDto: UpdateFeedbackApiDto,
      @Request() req: any
    ) {
      try {
        const { user } = req;
        const appClientId = user.appClientId;
  
        if (!feedbackId) {
          throw new BadRequestException('Feedback ID is required');
        }
  
        if (updateDto.rating && (updateDto.rating < 1 || updateDto.rating > 5)) {
          throw new BadRequestException('Rating must be between 1 and 5');
        }
  
        this.logger.log(`Updating feedback: ${feedbackId} for client: ${appClientId}`);
  
        const feedback = await this.clientFeedbackService.updateFeedback(
          feedbackId,
          appClientId,
          updateDto as UpdateClientFeedbackDto
        );
  
        return {
          status: 'success',
          message: 'Feedback updated successfully',
          data: {
            feedback
          }
        };
      } catch (error) {
        this.logger.error(`Error updating feedback: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to update feedback');
      }
    }
  
    @Delete(':feedbackId')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete pending feedback' })
    @ApiParam({ name: 'feedbackId', description: 'Feedback ID to delete' })
    @ApiResponse({ status: 204, description: 'Feedback deleted successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Cannot delete non-pending feedback' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 404, description: 'Feedback not found' })
    async deleteFeedback(
      @Param('feedbackId') feedbackId: string,
      @Request() req: any
    ) {
      try {
        const { user } = req;
        const appClientId = user.appClientId;
  
        if (!feedbackId) {
          throw new BadRequestException('Feedback ID is required');
        }
  
        this.logger.log(`Deleting feedback: ${feedbackId} for client: ${appClientId}`);
  
        await this.clientFeedbackService.deleteFeedback(feedbackId, appClientId);
  
        // No return for 204 No Content
      } catch (error) {
        this.logger.error(`Error deleting feedback: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to delete feedback');
      }
    }
  }