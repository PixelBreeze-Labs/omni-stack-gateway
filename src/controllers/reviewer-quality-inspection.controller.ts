// src/controllers/reviewer-quality-inspection.controller.ts
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
  import { BusinessStaffAuthGuard } from '../guards/business-staff-auth.guard';
  import { QualityInspectionService } from '../services/quality-inspection.service';
  import { 
    ApproveInspectionDto, 
    RejectInspectionDto, 
    RequestRevisionDto 
  } from '../services/quality-inspection.service';
  
  // DTOs for Swagger documentation
  class ApproveInspectionApiDto {
    notes?: string;
    reviewComments?: string;
  }
  
  class RejectInspectionApiDto {
    reason: string;
    feedback: string;
    requiredChanges?: string[];
  }
  
  class RequestRevisionApiDto {
    feedback: string;
    requiredChanges: string[];
    priority?: 'low' | 'medium' | 'high';
  }
  
  class AssignReviewerApiDto {
    reviewerId: string;
  }
  
  @ApiTags('Staff Quality Inspection - Reviewer')
  @Controller('staff/quality-inspections/review')
  @UseGuards(BusinessStaffAuthGuard)
  @ApiBearerAuth()
  export class ReviewerQualityInspectionController {
    private readonly logger = new Logger(ReviewerQualityInspectionController.name);
  
    constructor(
      private readonly qualityInspectionService: QualityInspectionService
    ) {}
  
    @Get('pending')
    @ApiOperation({ summary: 'Get inspections pending review' })
    @ApiQuery({ name: 'status', required: false, description: 'Filter by status (default: pending)' })
    @ApiQuery({ name: 'type', required: false, description: 'Filter by type (detailed/simple)' })
    @ApiQuery({ name: 'priority', required: false, description: 'Filter by priority (low/medium/high)' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number' })
    @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
    @ApiResponse({ status: 200, description: 'Inspections for review retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 403, description: 'Forbidden - No permission to review inspections' })
    async getInspectionsForReview(
      @Query('status') status?: string,
      @Query('type') type?: string,
      @Query('priority') priority?: string,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
      @Request() req?: any
    ) {
      try {
        const { businessId, user } = req;
        const reviewerId = user.userId;
  
        this.logger.log(`Getting inspections for review by: ${reviewerId}`);
  
        const filters = {
          status,
          type,
          priority,
          page: page ? parseInt(page) : 1,
          limit: limit ? parseInt(limit) : 10
        };
  
        const result = await this.qualityInspectionService.getInspectionsForReview(
          reviewerId,
          businessId,
          filters
        );
  
        return {
          status: 'success',
          message: 'Inspections for review retrieved successfully',
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
        this.logger.error(`Error getting inspections for review: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get inspections for review');
      }
    }
  
    @Put(':inspectionId/approve')
    @ApiOperation({ summary: 'Approve inspection' })
    @ApiParam({ name: 'inspectionId', description: 'Inspection ID to approve' })
    @ApiBody({ type: ApproveInspectionApiDto })
    @ApiResponse({ status: 200, description: 'Inspection approved successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Cannot approve inspection' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 403, description: 'Forbidden - No permission to review inspections' })
    @ApiResponse({ status: 404, description: 'Inspection not found' })
    async approveInspection(
      @Param('inspectionId') inspectionId: string,
      @Body() approvalData: ApproveInspectionApiDto,
      @Request() req: any
    ) {
      try {
        const { user } = req;
        const reviewerId = user.userId;
  
        if (!inspectionId) {
          throw new BadRequestException('Inspection ID is required');
        }
  
        this.logger.log(`Approving inspection: ${inspectionId} by reviewer: ${reviewerId}`);
  
        const result = await this.qualityInspectionService.approveInspection(
          inspectionId,
          reviewerId,
          approvalData as ApproveInspectionDto
        );
  
        return {
          status: 'success',
          message: result.message,
          data: {
            inspection: result.inspection
          }
        };
      } catch (error) {
        this.logger.error(`Error approving inspection: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to approve inspection');
      }
    }
  
    @Put(':inspectionId/reject')
    @ApiOperation({ summary: 'Reject inspection' })
    @ApiParam({ name: 'inspectionId', description: 'Inspection ID to reject' })
    @ApiBody({ type: RejectInspectionApiDto })
    @ApiResponse({ status: 200, description: 'Inspection rejected successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Cannot reject inspection or missing required fields' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 403, description: 'Forbidden - No permission to review inspections' })
    @ApiResponse({ status: 404, description: 'Inspection not found' })
    async rejectInspection(
      @Param('inspectionId') inspectionId: string,
      @Body() rejectionData: RejectInspectionApiDto,
      @Request() req: any
    ) {
      try {
        const { user } = req;
        const reviewerId = user.userId;
  
        if (!inspectionId) {
          throw new BadRequestException('Inspection ID is required');
        }
  
        // Validate required fields
        if (!rejectionData.reason || !rejectionData.feedback) {
          throw new BadRequestException('Reason and feedback are required for rejection');
        }
  
        this.logger.log(`Rejecting inspection: ${inspectionId} by reviewer: ${reviewerId}`);
  
        const result = await this.qualityInspectionService.rejectInspection(
          inspectionId,
          reviewerId,
          rejectionData as RejectInspectionDto
        );
  
        return {
          status: 'success',
          message: result.message,
          data: {
            inspection: result.inspection
          }
        };
      } catch (error) {
        this.logger.error(`Error rejecting inspection: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to reject inspection');
      }
    }
  
    @Put(':inspectionId/request-revision')
    @ApiOperation({ summary: 'Request inspection revision' })
    @ApiParam({ name: 'inspectionId', description: 'Inspection ID to request revision' })
    @ApiBody({ type: RequestRevisionApiDto })
    @ApiResponse({ status: 200, description: 'Inspection revision requested successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Cannot request revision or missing required fields' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 403, description: 'Forbidden - No permission to review inspections' })
    @ApiResponse({ status: 404, description: 'Inspection not found' })
    async requestInspectionRevision(
      @Param('inspectionId') inspectionId: string,
      @Body() revisionData: RequestRevisionApiDto,
      @Request() req: any
    ) {
      try {
        const { user } = req;
        const reviewerId = user.userId;
  
        if (!inspectionId) {
          throw new BadRequestException('Inspection ID is required');
        }
  
        // Validate required fields
        if (!revisionData.feedback || !revisionData.requiredChanges?.length) {
          throw new BadRequestException('Feedback and required changes are required for revision request');
        }
  
        this.logger.log(`Requesting revision for inspection: ${inspectionId} by reviewer: ${reviewerId}`);
  
        const result = await this.qualityInspectionService.requestInspectionRevision(
          inspectionId,
          reviewerId,
          revisionData as RequestRevisionDto
        );
  
        return {
          status: 'success',
          message: result.message,
          data: {
            inspection: result.inspection
          }
        };
      } catch (error) {
        this.logger.error(`Error requesting inspection revision: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to request inspection revision');
      }
    }
  
    @Put(':inspectionId/assign')
    @ApiOperation({ summary: 'Assign inspection to specific reviewer (for managers)' })
    @ApiParam({ name: 'inspectionId', description: 'Inspection ID to assign' })
    @ApiBody({ type: AssignReviewerApiDto })
    @ApiResponse({ status: 200, description: 'Inspection assigned to reviewer successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Cannot assign inspection' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 403, description: 'Forbidden - No permission to assign inspections' })
    @ApiResponse({ status: 404, description: 'Inspection not found' })
    async assignInspectionToReviewer(
      @Param('inspectionId') inspectionId: string,
      @Body() assignData: AssignReviewerApiDto,
      @Request() req: any
    ) {
      try {
        const { user } = req;
        const assignedBy = user.userId;
  
        if (!inspectionId) {
          throw new BadRequestException('Inspection ID is required');
        }
  
        if (!assignData.reviewerId) {
          throw new BadRequestException('Reviewer ID is required');
        }
  
        this.logger.log(`Assigning inspection ${inspectionId} to reviewer: ${assignData.reviewerId} by: ${assignedBy}`);
  
        const result = await this.qualityInspectionService.assignInspectionToReviewer(
          inspectionId,
          assignData.reviewerId,
          assignedBy
        );
  
        return {
          status: 'success',
          message: result.message,
          data: {
            inspection: result.inspection
          }
        };
      } catch (error) {
        this.logger.error(`Error assigning inspection to reviewer: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to assign inspection to reviewer');
      }
    }
  }