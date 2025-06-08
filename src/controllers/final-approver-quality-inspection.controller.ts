// src/controllers/final-approver-quality-inspection.controller.ts
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
    FinalApprovalDto, 
    OverrideDecisionDto 
  } from '../services/quality-inspection.service';
  
  // DTOs for Swagger documentation
  class FinalApprovalApiDto {
    notes?: string;
    clientNotificationRequired?: boolean;
    scheduledCompletionDate?: Date;
  }
  
  class OverrideDecisionApiDto {
    decision: 'approve' | 'reject';
    reason: string;
    justification: string;
    overridePreviousReview?: boolean;
  }
  
  @ApiTags('Staff Quality Inspection - Final Approver')
  @Controller('staff/quality-inspections/final-approval')
  @UseGuards(BusinessStaffAuthGuard)
  @ApiBearerAuth()
  export class FinalApproverQualityInspectionController {
    private readonly logger = new Logger(FinalApproverQualityInspectionController.name);
  
    constructor(
      private readonly qualityInspectionService: QualityInspectionService
    ) {}
  
    @Get('pending')
    @ApiOperation({ summary: 'Get inspections requiring final approval' })
    @ApiQuery({ name: 'type', required: false, description: 'Filter by type (detailed/simple)' })
    @ApiQuery({ name: 'priority', required: false, description: 'Filter by priority (low/medium/high)' })
    @ApiQuery({ name: 'hasCriticalIssues', required: false, description: 'Filter by critical issues (true/false)' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number' })
    @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
    @ApiResponse({ status: 200, description: 'Inspections for final approval retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 403, description: 'Forbidden - No permission for final approval' })
    async getInspectionsForFinalApproval(
      @Query('type') type?: string,
      @Query('priority') priority?: string,
      @Query('hasCriticalIssues') hasCriticalIssues?: string,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
      @Request() req?: any
    ) {
      try {
        const { businessId, user } = req;
        const approverId = user.userId;
  
        this.logger.log(`Getting inspections for final approval by: ${approverId}`);
  
        const filters = {
          type,
          priority,
          hasCriticalIssues: hasCriticalIssues ? hasCriticalIssues === 'true' : undefined,
          page: page ? parseInt(page) : 1,
          limit: limit ? parseInt(limit) : 10
        };
  
        const result = await this.qualityInspectionService.getInspectionsForFinalApproval(
          approverId,
          businessId,
          filters
        );
  
        return {
          status: 'success',
          message: 'Inspections for final approval retrieved successfully',
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
        this.logger.error(`Error getting inspections for final approval: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get inspections for final approval');
      }
    }
  
    @Put(':inspectionId/approve')
    @ApiOperation({ summary: 'Give final approval to inspection' })
    @ApiParam({ name: 'inspectionId', description: 'Inspection ID to give final approval' })
    @ApiBody({ type: FinalApprovalApiDto })
    @ApiResponse({ status: 200, description: 'Final approval given successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Cannot give final approval' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 403, description: 'Forbidden - No permission for final approval' })
    @ApiResponse({ status: 404, description: 'Inspection not found' })
    async giveInspectionFinalApproval(
      @Param('inspectionId') inspectionId: string,
      @Body() approvalData: FinalApprovalApiDto,
      @Request() req: any
    ) {
      try {
        const { user } = req;
        const approverId = user.userId;
  
        if (!inspectionId) {
          throw new BadRequestException('Inspection ID is required');
        }
  
        this.logger.log(`Giving final approval to inspection: ${inspectionId} by approver: ${approverId}`);
  
        const result = await this.qualityInspectionService.giveInspectionFinalApproval(
          inspectionId,
          approverId,
          approvalData as FinalApprovalDto
        );
  
        return {
          status: 'success',
          message: result.message,
          data: {
            inspection: result.inspection
          }
        };
      } catch (error) {
        this.logger.error(`Error giving final approval: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to give final approval');
      }
    }
  
    @Put(':inspectionId/override')
    @ApiOperation({ summary: 'Override previous review decision' })
    @ApiParam({ name: 'inspectionId', description: 'Inspection ID to override decision' })
    @ApiBody({ type: OverrideDecisionApiDto })
    @ApiResponse({ status: 200, description: 'Inspection decision overridden successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Cannot override decision or missing required fields' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 403, description: 'Forbidden - No permission to override decisions' })
    @ApiResponse({ status: 404, description: 'Inspection not found' })
    async overrideInspectionDecision(
      @Param('inspectionId') inspectionId: string,
      @Body() overrideData: OverrideDecisionApiDto,
      @Request() req: any
    ) {
      try {
        const { user } = req;
        const approverId = user.userId;
  
        if (!inspectionId) {
          throw new BadRequestException('Inspection ID is required');
        }
  
        // Validate required fields
        if (!overrideData.decision || !overrideData.reason || !overrideData.justification) {
          throw new BadRequestException('Decision, reason, and justification are required for override');
        }
  
        if (!['approve', 'reject'].includes(overrideData.decision)) {
          throw new BadRequestException('Decision must be either "approve" or "reject"');
        }
  
        this.logger.log(`Overriding inspection decision: ${inspectionId} to ${overrideData.decision} by approver: ${approverId}`);
  
        const result = await this.qualityInspectionService.overrideInspectionDecision(
          inspectionId,
          approverId,
          overrideData as OverrideDecisionDto
        );
  
        return {
          status: 'success',
          message: result.message,
          data: {
            inspection: result.inspection
          }
        };
      } catch (error) {
        this.logger.error(`Error overriding inspection decision: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to override inspection decision');
      }
    }
  
    @Get('analytics')
    @ApiOperation({ summary: 'Get approval analytics and performance metrics' })
    @ApiQuery({ name: 'startDate', required: false, description: 'Start date for analytics (ISO string)' })
    @ApiQuery({ name: 'endDate', required: false, description: 'End date for analytics (ISO string)' })
    @ApiResponse({ status: 200, description: 'Approval analytics retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 403, description: 'Forbidden - No permission for final approval' })
    async getApprovalAnalytics(
      @Query('startDate') startDate?: string,
      @Query('endDate') endDate?: string,
      @Request() req?: any
    ) {
      try {
        const { businessId, user } = req;
        const approverId = user.userId;
  
        this.logger.log(`Getting approval analytics for business: ${businessId} by approver: ${approverId}`);
  
        // Parse date range if provided
        let dateRange: { startDate: Date; endDate: Date } | undefined;
        if (startDate && endDate) {
          dateRange = {
            startDate: new Date(startDate),
            endDate: new Date(endDate)
          };
  
          // Validate dates
          if (isNaN(dateRange.startDate.getTime()) || isNaN(dateRange.endDate.getTime())) {
            throw new BadRequestException('Invalid date format. Use ISO date strings.');
          }
  
          if (dateRange.startDate > dateRange.endDate) {
            throw new BadRequestException('Start date cannot be after end date');
          }
        }
  
        const analytics = await this.qualityInspectionService.getApprovalAnalytics(
          businessId,
          approverId,
          dateRange
        );
  
        return {
          status: 'success',
          message: 'Approval analytics retrieved successfully',
          data: analytics
        };
      } catch (error) {
        this.logger.error(`Error getting approval analytics: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get approval analytics');
      }
    }
  
    @Get('queue-summary')
    @ApiOperation({ summary: 'Get summary of approval queue' })
    @ApiResponse({ status: 200, description: 'Approval queue summary retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 403, description: 'Forbidden - No permission for final approval' })
    async getApprovalQueueSummary(
      @Request() req: any
    ) {
      try {
        const { businessId, user } = req;
        const approverId = user.userId;
  
        this.logger.log(`Getting approval queue summary for business: ${businessId}`);
  
        // Get counts for different categories
        const result = await this.qualityInspectionService.getInspectionsForFinalApproval(
          approverId,
          businessId,
          { limit: 0 } // Just get the count
        );
  
        // Get additional quick stats
        const [criticalCount, detailedCount, simpleCount] = await Promise.all([
          this.qualityInspectionService.getInspectionsForFinalApproval(
            approverId,
            businessId,
            { hasCriticalIssues: true, limit: 0 }
          ),
          this.qualityInspectionService.getInspectionsForFinalApproval(
            approverId,
            businessId,
            { type: 'detailed', limit: 0 }
          ),
          this.qualityInspectionService.getInspectionsForFinalApproval(
            approverId,
            businessId,
            { type: 'simple', limit: 0 }
          )
        ]);
  
        return {
          status: 'success',
          message: 'Approval queue summary retrieved successfully',
          data: {
            totalPendingApproval: result.total,
            criticalIssues: criticalCount.total,
            detailedInspections: detailedCount.total,
            simpleInspections: simpleCount.total,
            lastUpdated: new Date().toISOString()
          }
        };
      } catch (error) {
        this.logger.error(`Error getting approval queue summary: ${error.message}`, error.stack);
        throw new InternalServerErrorException('Failed to get approval queue summary');
      }
    }
  }