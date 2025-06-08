// src/controllers/client-quality-inspection.controller.ts
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
    ApiQuery, 
    ApiBody, 
    ApiResponse,
    ApiParam,
    ApiBearerAuth
  } from '@nestjs/swagger';
  import { AppClientAuthGuard } from '../guards/app-client-auth.guard';
  import { QualityInspectionService } from '../services/quality-inspection.service';
  import { 
    ClientReviewDto, 
    ClientApprovalDto, 
    ClientRejectionDto 
  } from '../services/quality-inspection.service';
  
  // DTOs for Swagger documentation
  class ClientReviewApiDto {
    feedback: string;
    rating?: number; // 1-5 client satisfaction rating
    concerns?: string[];
    requestedChanges?: string[];
  }
  
  class ClientApprovalApiDto {
    approved: boolean;
    clientSignature?: string;
    notes?: string;
    satisfactionRating?: number; // 1-5
  }
  
  class ClientRejectionApiDto {
    reason: string;
    requestedChanges: string[];
    priority?: 'low' | 'medium' | 'high';
    scheduledRevisitDate?: Date;
  }
  
  @ApiTags('Client Quality Inspection')
  @Controller('client/quality-inspections')
  @UseGuards(AppClientAuthGuard)
  @ApiBearerAuth()
  export class ClientQualityInspectionController {
    private readonly logger = new Logger(ClientQualityInspectionController.name);
  
    constructor(
      private readonly qualityInspectionService: QualityInspectionService
    ) {}
  
    @Get()
    @ApiOperation({ summary: 'Get inspections for client' })
    @ApiQuery({ name: 'projectId', required: false, description: 'Filter by project ID' })
    @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
    @ApiQuery({ name: 'type', required: false, description: 'Filter by type (detailed/simple)' })
    @ApiQuery({ name: 'startDate', required: false, description: 'Start date for date range filter' })
    @ApiQuery({ name: 'endDate', required: false, description: 'End date for date range filter' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number' })
    @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
    @ApiResponse({ status: 200, description: 'Client inspections retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    async getClientInspections(
      @Query('projectId') projectId?: string,
      @Query('status') status?: string,
      @Query('type') type?: string,
      @Query('startDate') startDate?: string,
      @Query('endDate') endDate?: string,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
      @Request() req?: any
    ) {
      try {
        const { user } = req;
        const clientId = user.appClientId;
  
        this.logger.log(`Getting inspections for client: ${clientId}`);
  
        // Parse date range if provided
        let dateRange: { startDate: Date; endDate: Date } | undefined;
        if (startDate && endDate) {
          dateRange = {
            startDate: new Date(startDate),
            endDate: new Date(endDate)
          };
  
          if (isNaN(dateRange.startDate.getTime()) || isNaN(dateRange.endDate.getTime())) {
            throw new BadRequestException('Invalid date format. Use ISO date strings.');
          }
        }
  
        const filters = {
          status,
          type,
          dateRange,
          page: page ? parseInt(page) : 1,
          limit: limit ? parseInt(limit) : 10
        };
  
        const result = await this.qualityInspectionService.getClientInspections(
          clientId,
          projectId,
          filters
        );
  
        return {
          status: 'success',
          message: 'Client inspections retrieved successfully',
          data: {
            inspections: result.inspections,
            pagination: {
              total: result.total,
              page: result.page,
              totalPages: result.totalPages,
              limit: filters.limit
            }
          }
        };
      } catch (error) {
        this.logger.error(`Error getting client inspections: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get client inspections');
      }
    }
  
    @Get(':inspectionId')
    @ApiOperation({ summary: 'Get detailed inspection information for client' })
    @ApiParam({ name: 'inspectionId', description: 'Inspection ID' })
    @ApiResponse({ status: 200, description: 'Inspection details retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 404, description: 'Inspection not found or access denied' })
    async getInspectionDetails(
      @Param('inspectionId') inspectionId: string,
      @Request() req: any
    ) {
      try {
        const { user } = req;
        const clientId = user.appClientId;
  
        if (!inspectionId) {
          throw new BadRequestException('Inspection ID is required');
        }
  
        this.logger.log(`Getting inspection details for client: ${clientId}, inspection: ${inspectionId}`);
  
        const inspection = await this.qualityInspectionService.getInspectionDetailsForClient(
          inspectionId,
          clientId
        );
  
        return {
          status: 'success',
          message: 'Inspection details retrieved successfully',
          data: {
            inspection
          }
        };
      } catch (error) {
        this.logger.error(`Error getting inspection details: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get inspection details');
      }
    }
  
    @Put(':inspectionId/review')
    @ApiOperation({ summary: 'Submit client review for inspection' })
    @ApiParam({ name: 'inspectionId', description: 'Inspection ID to review' })
    @ApiBody({ type: ClientReviewApiDto })
    @ApiResponse({ status: 200, description: 'Client review submitted successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid review data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 404, description: 'Inspection not found or access denied' })
    async reviewInspection(
      @Param('inspectionId') inspectionId: string,
      @Body() reviewData: ClientReviewApiDto,
      @Request() req: any
    ) {
      try {
        const { user } = req;
        const clientId = user.appClientId;
  
        if (!inspectionId) {
          throw new BadRequestException('Inspection ID is required');
        }
  
        if (!reviewData.feedback) {
          throw new BadRequestException('Feedback is required for client review');
        }
  
        if (reviewData.rating && (reviewData.rating < 1 || reviewData.rating > 5)) {
          throw new BadRequestException('Rating must be between 1 and 5');
        }
  
        this.logger.log(`Client reviewing inspection: ${inspectionId} by client: ${clientId}`);
  
        const result = await this.qualityInspectionService.reviewInspectionByClient(
          inspectionId,
          clientId,
          reviewData as ClientReviewDto
        );
  
        return {
          status: 'success',
          message: result.message,
          data: {
            inspection: result.inspection
          }
        };
      } catch (error) {
        this.logger.error(`Error submitting client review: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to submit client review');
      }
    }
  
    @Put(':inspectionId/approve')
    @ApiOperation({ summary: 'Approve or update approval status for inspection' })
    @ApiParam({ name: 'inspectionId', description: 'Inspection ID to approve' })
    @ApiBody({ type: ClientApprovalApiDto })
    @ApiResponse({ status: 200, description: 'Client approval recorded successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid approval data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 404, description: 'Inspection not found or access denied' })
    async approveInspection(
      @Param('inspectionId') inspectionId: string,
      @Body() approvalData: ClientApprovalApiDto,
      @Request() req: any
    ) {
      try {
        const { user } = req;
        const clientId = user.appClientId;
  
        if (!inspectionId) {
          throw new BadRequestException('Inspection ID is required');
        }
  
        if (typeof approvalData.approved !== 'boolean') {
          throw new BadRequestException('Approved status must be specified as true or false');
        }
  
        if (approvalData.satisfactionRating && (approvalData.satisfactionRating < 1 || approvalData.satisfactionRating > 5)) {
          throw new BadRequestException('Satisfaction rating must be between 1 and 5');
        }
  
        this.logger.log(`Client ${approvalData.approved ? 'approving' : 'updating'} inspection: ${inspectionId}`);
  
        const result = await this.qualityInspectionService.approveInspectionByClient(
          inspectionId,
          clientId,
          approvalData as ClientApprovalDto
        );
  
        return {
          status: 'success',
          message: result.message,
          data: {
            inspection: result.inspection
          }
        };
      } catch (error) {
        this.logger.error(`Error recording client approval: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to record client approval');
      }
    }
  
    @Put(':inspectionId/reject')
    @ApiOperation({ summary: 'Reject inspection and request changes' })
    @ApiParam({ name: 'inspectionId', description: 'Inspection ID to reject' })
    @ApiBody({ type: ClientRejectionApiDto })
    @ApiResponse({ status: 200, description: 'Client rejection recorded successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid rejection data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 404, description: 'Inspection not found or access denied' })
    async rejectInspection(
      @Param('inspectionId') inspectionId: string,
      @Body() rejectionData: ClientRejectionApiDto,
      @Request() req: any
    ) {
      try {
        const { user } = req;
        const clientId = user.appClientId;
  
        if (!inspectionId) {
          throw new BadRequestException('Inspection ID is required');
        }
  
        if (!rejectionData.reason || !rejectionData.requestedChanges?.length) {
          throw new BadRequestException('Reason and requested changes are required for rejection');
        }
  
        this.logger.log(`Client rejecting inspection: ${inspectionId} by client: ${clientId}`);
  
        const result = await this.qualityInspectionService.rejectInspectionByClient(
          inspectionId,
          clientId,
          rejectionData as ClientRejectionDto
        );
  
        return {
          status: 'success',
          message: result.message,
          data: {
            inspection: result.inspection
          }
        };
      } catch (error) {
        this.logger.error(`Error recording client rejection: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to record client rejection');
      }
    }
  
    @Get('summary/stats')
    @ApiOperation({ summary: 'Get client inspection summary and statistics' })
    @ApiQuery({ name: 'projectId', required: false, description: 'Filter by specific project' })
    @ApiResponse({ status: 200, description: 'Client inspection summary retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    async getClientInspectionSummary(
      @Query('projectId') projectId?: string,
      @Request() req?: any
    ) {
      try {
        const { user } = req;
        const clientId = user.appClientId;
  
        this.logger.log(`Getting inspection summary for client: ${clientId}`);
  
        const summary = await this.qualityInspectionService.getClientInspectionSummary(
          clientId,
          projectId
        );
  
        return {
          status: 'success',
          message: 'Client inspection summary retrieved successfully',
          data: summary
        };
      } catch (error) {
        this.logger.error(`Error getting client inspection summary: ${error.message}`, error.stack);
        throw new InternalServerErrorException('Failed to get client inspection summary');
      }
    }
  }