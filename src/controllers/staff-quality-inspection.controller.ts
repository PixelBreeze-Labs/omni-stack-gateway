// src/controllers/staff-quality-inspection.controller.ts
import { 
    Controller, 
    Get, 
    Post, 
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
    ApiParam,
    ApiBearerAuth
  } from '@nestjs/swagger';
  import { BusinessStaffAuthGuard } from '../guards/business-staff-auth.guard';
  import { QualityInspectionService } from '../services/quality-inspection.service';
  import { 
    CreateDetailedInspectionDto, 
    CreateSimpleInspectionDto, 
    UpdateInspectionDto 
  } from '../services/quality-inspection.service';
  
  // DTOs for Swagger documentation
  class CreateDetailedInspectionApiDto {
    appProjectId: string;
    appClientId: string;
    constructionSiteId?: string;
    location: string;
    inspectionCategory?: string;
    checklistItems: any[];
    photos?: string[];
    signature?: string;
    notes?: string;
  }
  
  class CreateSimpleInspectionApiDto {
    appProjectId: string;
    appClientId: string;
    constructionSiteId?: string;
    location: string;
    overallRating: number;
    remarks: string;
    improvementSuggestions?: string;
    notes?: string;
  }
  
  class UpdateInspectionApiDto {
    location?: string;
    inspectionCategory?: string;
    checklistItems?: any[];
    photos?: string[];
    signature?: string;
    notes?: string;
    overallRating?: number;
    remarks?: string;
    improvementSuggestions?: string;
  }
  
  @ApiTags('Staff Quality Inspection - Inspector')
  @Controller('staff/quality-inspections')
  @UseGuards(BusinessStaffAuthGuard)
  @ApiBearerAuth()
  export class StaffQualityInspectionController {
    private readonly logger = new Logger(StaffQualityInspectionController.name);
  
    constructor(
      private readonly qualityInspectionService: QualityInspectionService
    ) {}
  
    @Post('detailed')
    @ApiOperation({ summary: 'Create detailed inspection with photos and signature' })
    @ApiBody({ type: CreateDetailedInspectionApiDto })
    @ApiResponse({ status: 201, description: 'Detailed inspection created successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid inspection data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 403, description: 'Forbidden - No permission to create inspections' })
    async createDetailedInspection(
      @Body() inspectionData: CreateDetailedInspectionApiDto,
      @Request() req: any
    ) {
      try {
        const { businessId, user } = req;
        const inspectorId = user.userId;
  
        this.logger.log(`Creating detailed inspection for business: ${businessId}, inspector: ${inspectorId}`);
  
        // Validate required fields
        if (!inspectionData.appProjectId || !inspectionData.appClientId || !inspectionData.location) {
          throw new BadRequestException('Project ID, Client ID, and location are required');
        }
  
        const result = await this.qualityInspectionService.createDetailedInspection(
          businessId,
          inspectorId,
          inspectionData as CreateDetailedInspectionDto
        );
  
        return {
          status: 'success',
          message: result.message,
          data: {
            inspection: result.inspection
          }
        };
      } catch (error) {
        this.logger.error(`Error creating detailed inspection: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to create detailed inspection');
      }
    }
  
    @Post('simple')
    @ApiOperation({ summary: 'Create simple inspection with rating and remarks' })
    @ApiBody({ type: CreateSimpleInspectionApiDto })
    @ApiResponse({ status: 201, description: 'Simple inspection created successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid inspection data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 403, description: 'Forbidden - No permission to create inspections' })
    async createSimpleInspection(
      @Body() inspectionData: CreateSimpleInspectionApiDto,
      @Request() req: any
    ) {
      try {
        const { businessId, user } = req;
        const inspectorId = user.userId;
  
        this.logger.log(`Creating simple inspection for business: ${businessId}, inspector: ${inspectorId}`);
  
        // Validate required fields
        if (!inspectionData.appProjectId || !inspectionData.appClientId || !inspectionData.location) {
          throw new BadRequestException('Project ID, Client ID, and location are required');
        }
  
        if (!inspectionData.overallRating || inspectionData.overallRating < 1 || inspectionData.overallRating > 5) {
          throw new BadRequestException('Overall rating must be between 1 and 5');
        }
  
        if (!inspectionData.remarks) {
          throw new BadRequestException('Remarks are required for simple inspections');
        }
  
        const result = await this.qualityInspectionService.createSimpleInspection(
          businessId,
          inspectorId,
          inspectionData as CreateSimpleInspectionDto
        );
  
        return {
          status: 'success',
          message: result.message,
          data: {
            inspection: result.inspection
          }
        };
      } catch (error) {
        this.logger.error(`Error creating simple inspection: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to create simple inspection');
      }
    }
  
    @Get('my-inspections')
    @ApiOperation({ summary: 'Get inspections created by the current inspector' })
    @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
    @ApiQuery({ name: 'type', required: false, description: 'Filter by type (detailed/simple)' })
    @ApiQuery({ name: 'constructionSiteId', required: false, description: 'Filter by construction site ID' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number' })
    @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
    @ApiResponse({ status: 200, description: 'Inspections retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    async getMyInspections(
      @Query('status') status?: string,
      @Query('type') type?: string,
      @Query('constructionSiteId') constructionSiteId?: string,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
      @Request() req?: any
    ) {
      try {
        const { businessId, user } = req;
        const inspectorId = user.userId;
  
        this.logger.log(`Getting inspections for inspector: ${inspectorId}`);
  
        const filters = {
          status,
          type,
          constructionSiteId,
          page: page ? parseInt(page) : 1,
          limit: limit ? parseInt(limit) : 10
        };
  
        const result = await this.qualityInspectionService.getMyInspections(
          inspectorId,
          businessId,
          filters
        );
  
        return {
          status: 'success',
          message: 'Inspections retrieved successfully',
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
        this.logger.error(`Error getting inspector inspections: ${error.message}`, error.stack);
        throw new InternalServerErrorException('Failed to get inspections');
      }
    }
  
    @Put(':inspectionId')
    @ApiOperation({ summary: 'Update inspection (only own inspections in draft/rejected status)' })
    @ApiParam({ name: 'inspectionId', description: 'Inspection ID to update' })
    @ApiBody({ type: UpdateInspectionApiDto })
    @ApiResponse({ status: 200, description: 'Inspection updated successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid data or cannot update' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 404, description: 'Inspection not found' })
    async updateInspection(
      @Param('inspectionId') inspectionId: string,
      @Body() updates: UpdateInspectionApiDto,
      @Request() req: any
    ) {
      try {
        const { user } = req;
        const inspectorId = user.userId;
  
        if (!inspectionId) {
          throw new BadRequestException('Inspection ID is required');
        }
  
        this.logger.log(`Updating inspection: ${inspectionId} by inspector: ${inspectorId}`);
  
        const result = await this.qualityInspectionService.updateInspection(
          inspectionId,
          inspectorId,
          updates as UpdateInspectionDto
        );
  
        return {
          status: 'success',
          message: result.message,
          data: {
            inspection: result.inspection
          }
        };
      } catch (error) {
        this.logger.error(`Error updating inspection: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to update inspection');
      }
    }
  
    @Put(':inspectionId/submit')
    @ApiOperation({ summary: 'Submit inspection for review' })
    @ApiParam({ name: 'inspectionId', description: 'Inspection ID to submit' })
    @ApiResponse({ status: 200, description: 'Inspection submitted for review successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Cannot submit inspection' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
    @ApiResponse({ status: 404, description: 'Inspection not found' })
    async submitInspectionForReview(
      @Param('inspectionId') inspectionId: string,
      @Request() req: any
    ) {
      try {
        const { user } = req;
        const inspectorId = user.userId;
  
        if (!inspectionId) {
          throw new BadRequestException('Inspection ID is required');
        }
  
        this.logger.log(`Submitting inspection for review: ${inspectionId} by inspector: ${inspectorId}`);
  
        const result = await this.qualityInspectionService.submitInspectionForReview(
          inspectionId,
          inspectorId
        );
  
        return {
          status: 'success',
          message: result.message,
          data: {
            inspection: result.inspection
          }
        };
      } catch (error) {
        this.logger.error(`Error submitting inspection for review: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to submit inspection for review');
      }
    }
  }