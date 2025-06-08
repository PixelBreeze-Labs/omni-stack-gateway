// src/controllers/business-client-feedback.controller.ts
import { 
    Controller, 
    Get, 
    Put,
    Body, 
    Query,
    Param,
    UseGuards,
    Request,
    Logger,
    BadRequestException,
    InternalServerErrorException
  } from '@nestjs/common';
  import { 
    ApiTags, 
    ApiOperation, 
    ApiHeader,
    ApiQuery, 
    ApiBody, 
    ApiResponse,
    ApiParam
  } from '@nestjs/swagger';
  import { BusinessAuthGuard } from '../guards/business-auth.guard';
  import { 
    ClientFeedbackService,
    BusinessResponseDto 
  } from '../services/client-feedback.service';
  import { FeedbackType, FeedbackPriority, FeedbackStatus } from '../schemas/client-feedback.schema';
  
  // DTOs for Swagger documentation
  class BusinessResponseApiDto {
    responseText: string;
    respondedBy: string;
    isPublic?: boolean;
    attachments?: string[];
    metadata?: any;
  }
  
  class MarkResolvedApiDto {
    notes?: string;
  }
  
  @ApiTags('Client Feedback - Business Admin')
  @Controller('business/client-feedback')
  @UseGuards(BusinessAuthGuard)
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class BusinessClientFeedbackController {
    private readonly logger = new Logger(BusinessClientFeedbackController.name);
  
    constructor(
      private readonly clientFeedbackService: ClientFeedbackService
    ) {}
  
    @Get()
    @ApiOperation({ summary: 'Get all approved feedback for the business' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'status', required: false, description: 'Filter by status (approved, responded, resolved)' })
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
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getBusinessFeedbacks(
      @Query('businessId') businessId: string,
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
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Getting feedback list for business: ${businessId}`);
  
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
  
        const result = await this.clientFeedbackService.getBusinessFeedbacks(businessId, query);
  
        return {
          status: 'success',
          message: 'Business feedback list retrieved successfully',
          data: {
            feedbacks: result.feedbacks,
            pagination: {
              total: result.total,
              page: result.page,
              totalPages: result.totalPages,
              limit: result.limit
            },
            stats: result.stats
          }
        };
      } catch (error) {
        this.logger.error(`Error getting business feedbacks: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get business feedback list');
      }
    }
  
    @Get('stats')
    @ApiOperation({ summary: 'Get business feedback statistics and analytics' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getBusinessFeedbackStats(
      @Query('businessId') businessId: string,
      @Request() req: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Getting feedback statistics for business: ${businessId}`);
  
        const stats = await this.clientFeedbackService.getBusinessFeedbackStats(businessId);
  
        return {
          status: 'success',
          message: 'Business feedback statistics retrieved successfully',
          data: stats
        };
      } catch (error) {
        this.logger.error(`Error getting business feedback stats: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get business feedback statistics');
      }
    }
  
    @Get(':feedbackId')
    @ApiOperation({ summary: 'Get specific feedback details for business' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiParam({ name: 'feedbackId', description: 'Feedback ID' })
    @ApiResponse({ status: 200, description: 'Feedback retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Feedback not found or not accessible' })
    async getFeedbackById(
      @Query('businessId') businessId: string,
      @Param('feedbackId') feedbackId: string,
      @Request() req: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!feedbackId) {
          throw new BadRequestException('Feedback ID is required');
        }
  
        this.logger.log(`Getting feedback details: ${feedbackId} for business: ${businessId}`);
  
        // Using the business feedbacks method with specific ID filter
        const result = await this.clientFeedbackService.getBusinessFeedbacks(businessId, {
          page: 1,
          limit: 1
        });
  
        const feedback = result.feedbacks.find(f => f._id.toString() === feedbackId);
  
        if (!feedback) {
          throw new BadRequestException('Feedback not found or not accessible');
        }
  
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
  
    @Put(':feedbackId/respond')
    @ApiOperation({ summary: 'Add business response to client feedback' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiParam({ name: 'feedbackId', description: 'Feedback ID to respond to' })
    @ApiBody({ type: BusinessResponseApiDto })
    @ApiResponse({ status: 200, description: 'Response added successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid response data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Feedback not found or not accessible' })
    async addBusinessResponse(
      @Query('businessId') businessId: string,
      @Param('feedbackId') feedbackId: string,
      @Body() responseDto: BusinessResponseApiDto,
      @Request() req: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!feedbackId) {
          throw new BadRequestException('Feedback ID is required');
        }
  
        if (!responseDto.responseText || !responseDto.respondedBy) {
          throw new BadRequestException('Response text and respondedBy are required');
        }
  
        this.logger.log(`Adding business response to feedback: ${feedbackId} for business: ${businessId}`);
  
        const feedback = await this.clientFeedbackService.addBusinessResponse(
          feedbackId,
          businessId,
          responseDto as BusinessResponseDto
        );
  
        return {
          status: 'success',
          message: 'Business response added successfully',
          data: {
            feedback
          }
        };
      } catch (error) {
        this.logger.error(`Error adding business response: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to add business response');
      }
    }
  
    @Put(':feedbackId/resolve')
    @ApiOperation({ summary: 'Mark feedback as resolved' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiParam({ name: 'feedbackId', description: 'Feedback ID to mark as resolved' })
    @ApiBody({ type: MarkResolvedApiDto })
    @ApiResponse({ status: 200, description: 'Feedback marked as resolved successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Feedback not found or not accessible' })
    async markAsResolved(
      @Query('businessId') businessId: string,
      @Param('feedbackId') feedbackId: string,
      @Body() resolveDto: MarkResolvedApiDto,
      @Request() req: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!feedbackId) {
          throw new BadRequestException('Feedback ID is required');
        }
  
        this.logger.log(`Marking feedback as resolved: ${feedbackId} for business: ${businessId}`);
  
        const feedback = await this.clientFeedbackService.markAsResolved(
          feedbackId,
          businessId,
          resolveDto.notes
        );
  
        return {
          status: 'success',
          message: 'Feedback marked as resolved successfully',
          data: {
            feedback
          }
        };
      } catch (error) {
        this.logger.error(`Error marking feedback as resolved: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to mark feedback as resolved');
      }
    }
  
    @Get('dashboard/summary')
    @ApiOperation({ summary: 'Get business feedback dashboard summary' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'period', required: false, description: 'Time period for summary (7d, 30d, 90d, 1y)' })
    @ApiResponse({ status: 200, description: 'Dashboard summary retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getDashboardSummary(
      @Query('businessId') businessId: string,
      @Query('period') period?: string,
      @Request() req?: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Getting dashboard summary for business: ${businessId}`);
  
        // Calculate date range based on period
        let startDate: Date | undefined;
        const endDate = new Date();
  
        switch (period) {
          case '7d':
            startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30d':
            startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            break;
          case '90d':
            startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            break;
          case '1y':
            startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
            break;
          default:
            // Last 30 days by default
            startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        }
  
        const query = {
          startDate,
          endDate,
          page: 1,
          limit: 5 // Just get recent ones for dashboard
        };
  
        const [feedbackData, stats] = await Promise.all([
          this.clientFeedbackService.getBusinessFeedbacks(businessId, query),
          this.clientFeedbackService.getBusinessFeedbackStats(businessId)
        ]);
  
        const summary = {
          period: period || '30d',
          recentFeedbacks: feedbackData.feedbacks,
          statistics: stats,
          totalInPeriod: feedbackData.total,
          needsResponse: feedbackData.feedbacks.filter(f => 
            f.status === FeedbackStatus.APPROVED && !f.businessResponse
          ).length,
          highPriority: feedbackData.feedbacks.filter(f => 
            f.priority === FeedbackPriority.HIGH || f.priority === FeedbackPriority.URGENT
          ).length
        };
  
        return {
          status: 'success',
          message: 'Dashboard summary retrieved successfully',
          data: summary
        };
      } catch (error) {
        this.logger.error(`Error getting dashboard summary: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get dashboard summary');
      }
    }
  }