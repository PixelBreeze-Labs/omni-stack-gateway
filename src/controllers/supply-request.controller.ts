// src/controllers/supply-request.controller.ts
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
    NotFoundException,
    Logger,
    InternalServerErrorException,
    Req,
    BadRequestException
  } from '@nestjs/common';
  import {
    ApiTags,
    ApiOperation,
    ApiHeader,
    ApiParam,
    ApiBody,
    ApiResponse,
    ApiQuery
  } from '@nestjs/swagger';
  import { SupplyRequestService } from '../services/supply-request.service';
  import { BusinessService } from '../services/business.service';
  import { AppProject } from '../schemas/app-project.schema';
  import { SupplyRequestStatus, SupplyRequestPriority } from '../schemas/supply-request.schema';
  import {
    CreateSupplyRequestDto,
    UpdateSupplyRequestDto,
    ApproveSupplyRequestDto,
    RejectSupplyRequestDto,
    MarkDeliveredDto,
    SupplyRequestResponseDto,
    SupplyRequestsListResponseDto,
    SupplyRequestActionResponseDto
  } from '../dtos/supply-request.dto';
  
  @ApiTags('Supply Requests')
  @Controller('projects/:projectId/supply-requests')
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class SupplyRequestController {
    private readonly logger = new Logger(SupplyRequestController.name);
  
    constructor(
      private readonly supplyRequestService: SupplyRequestService,
      private readonly businessService: BusinessService
    ) {}
  
    @Get()
    @ApiOperation({ summary: 'Get all supply requests for a project' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiQuery({ name: 'page', description: 'Page number', required: false, example: 1 })
    @ApiQuery({ name: 'limit', description: 'Supply requests per page', required: false, example: 20 })
    @ApiQuery({ name: 'status', description: 'Filter by status', required: false, enum: SupplyRequestStatus })
    @ApiQuery({ name: 'priority', description: 'Filter by priority', required: false, enum: SupplyRequestPriority })
    @ApiQuery({ name: 'requestedBy', description: 'Filter by requester user ID', required: false })
    @ApiQuery({ name: 'overdueOnly', description: 'Show only overdue requests', required: false, example: false })
    @ApiResponse({
      status: 200,
      description: 'Returns project supply requests with pagination',
      type: SupplyRequestsListResponseDto
    })
    async getProjectSupplyRequests(
      @Param('projectId') projectId: string,
      @Query('page') page?: number,
      @Query('limit') limit?: number,
      @Query('status') status?: SupplyRequestStatus,
      @Query('priority') priority?: SupplyRequestPriority,
      @Query('requestedBy') requestedBy?: string,
      @Query('overdueOnly') overdueOnly?: boolean,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<SupplyRequestsListResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID for audit logging
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        return this.supplyRequestService.getProjectSupplyRequests(
          projectId,
          {
            page: page ? parseInt(page.toString()) : 1,
            limit: limit ? parseInt(limit.toString()) : 20,
            status,
            priority,
            requestedBy,
            // @ts-ignore
            overdueOnly: overdueOnly === true || overdueOnly === 'true'
          },
          adminUserId,
          req
        );
      } catch (error) {
        this.logger.error(`Error getting project supply requests: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Post()
    @ApiOperation({ summary: 'Create a new supply request' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiBody({ type: CreateSupplyRequestDto, description: 'Supply request details' })
    @ApiResponse({
      status: 201,
      description: 'Supply request created successfully',
      type: SupplyRequestActionResponseDto
    })
    async createSupplyRequest(
      @Param('projectId') projectId: string,
      @Body() createSupplyRequestDto: CreateSupplyRequestDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<SupplyRequestActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const supplyRequest = await this.supplyRequestService.createSupplyRequest(
          projectId,
          createSupplyRequestDto,
          adminUserId, // For now, admin is the requester
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Supply request created successfully',
          request: supplyRequest
        };
      } catch (error) {
        this.logger.error(`Error creating supply request: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || 
            error instanceof NotFoundException || 
            error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to create supply request');
      }
    }
  
    @Get(':requestId')
    @ApiOperation({ summary: 'Get a specific supply request' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'requestId', description: 'Supply request ID' })
    @ApiResponse({
      status: 200,
      description: 'Returns supply request details',
      type: SupplyRequestResponseDto
    })
    async getSupplyRequest(
      @Param('projectId') projectId: string,
      @Param('requestId') requestId: string,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<SupplyRequestResponseDto> {
      try {
        await this.validateProjectAccess(projectId, apiKey);
  
        return this.supplyRequestService.getSupplyRequest(projectId, requestId);
      } catch (error) {
        this.logger.error(`Error getting supply request: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Put(':requestId')
    @ApiOperation({ summary: 'Update a supply request' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'requestId', description: 'Supply request ID to update' })
    @ApiBody({ type: UpdateSupplyRequestDto, description: 'Updated supply request details' })
    @ApiResponse({
      status: 200,
      description: 'Supply request updated successfully',
      type: SupplyRequestActionResponseDto
    })
    async updateSupplyRequest(
      @Param('projectId') projectId: string,
      @Param('requestId') requestId: string,
      @Body() updateSupplyRequestDto: UpdateSupplyRequestDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<SupplyRequestActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const supplyRequest = await this.supplyRequestService.updateSupplyRequest(
          projectId,
          requestId,
          updateSupplyRequestDto,
          adminUserId, // For now, admin is the updater
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Supply request updated successfully',
          request: supplyRequest
        };
      } catch (error) {
        this.logger.error(`Error updating supply request: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Put(':requestId/approve')
    @ApiOperation({ summary: 'Approve a supply request' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'requestId', description: 'Supply request ID to approve' })
    @ApiBody({ type: ApproveSupplyRequestDto, description: 'Approval details' })
    @ApiResponse({
      status: 200,
      description: 'Supply request approved successfully',
      type: SupplyRequestActionResponseDto
    })
    async approveSupplyRequest(
      @Param('projectId') projectId: string,
      @Param('requestId') requestId: string,
      @Body() approveSupplyRequestDto: ApproveSupplyRequestDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<SupplyRequestActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const supplyRequest = await this.supplyRequestService.approveSupplyRequest(
          projectId,
          requestId,
          approveSupplyRequestDto,
          adminUserId, // Admin is the approver
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Supply request approved successfully',
          request: supplyRequest
        };
      } catch (error) {
        this.logger.error(`Error approving supply request: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Put(':requestId/reject')
    @ApiOperation({ summary: 'Reject a supply request' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'requestId', description: 'Supply request ID to reject' })
    @ApiBody({ type: RejectSupplyRequestDto, description: 'Rejection details' })
    @ApiResponse({
      status: 200,
      description: 'Supply request rejected successfully',
      type: SupplyRequestActionResponseDto
    })
    async rejectSupplyRequest(
      @Param('projectId') projectId: string,
      @Param('requestId') requestId: string,
      @Body() rejectSupplyRequestDto: RejectSupplyRequestDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<SupplyRequestActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const supplyRequest = await this.supplyRequestService.rejectSupplyRequest(
          projectId,
          requestId,
          rejectSupplyRequestDto,
          adminUserId, // Admin is the rejecter
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Supply request rejected successfully',
          request: supplyRequest
        };
      } catch (error) {
        this.logger.error(`Error rejecting supply request: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Put(':requestId/delivered')
    @ApiOperation({ summary: 'Mark supply request as delivered' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'requestId', description: 'Supply request ID to mark as delivered' })
    @ApiBody({ type: MarkDeliveredDto, description: 'Delivery details' })
    @ApiResponse({
      status: 200,
      description: 'Supply request marked as delivered successfully',
      type: SupplyRequestActionResponseDto
    })
    async markSupplyRequestDelivered(
      @Param('projectId') projectId: string,
      @Param('requestId') requestId: string,
      @Body() markDeliveredDto: MarkDeliveredDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<SupplyRequestActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const supplyRequest = await this.supplyRequestService.markSupplyRequestDelivered(
          projectId,
          requestId,
          markDeliveredDto,
          adminUserId, // Admin is marking as delivered
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Supply request marked as delivered successfully',
          request: supplyRequest
        };
      } catch (error) {
        this.logger.error(`Error marking supply request as delivered: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Delete(':requestId')
    @ApiOperation({ summary: 'Delete a supply request' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'requestId', description: 'Supply request ID to delete' })
    @ApiResponse({
      status: 200,
      description: 'Supply request deleted successfully',
      type: SupplyRequestActionResponseDto
    })
    async deleteSupplyRequest(
      @Param('projectId') projectId: string,
      @Param('requestId') requestId: string,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<SupplyRequestActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const result = await this.supplyRequestService.deleteSupplyRequest(
          projectId,
          requestId,
          adminUserId, // Admin is the deleter
          adminUserId,
          req
        );
  
        return {
          success: result.success,
          message: result.message
        };
      } catch (error) {
        this.logger.error(`Error deleting supply request: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Get('stats/summary')
    @ApiOperation({ summary: 'Get supply request statistics for the project' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiResponse({
      status: 200,
      description: 'Returns supply request statistics',
      schema: {
        type: 'object',
        properties: {
          totalRequests: { type: 'number', example: 25 },
          pendingRequests: { type: 'number', example: 8 },
          approvedRequests: { type: 'number', example: 12 },
          deliveredRequests: { type: 'number', example: 5 },
          overdueRequests: { type: 'number', example: 2 },
          totalEstimatedCost: { type: 'number', example: 5250.75 },
          totalApprovedCost: { type: 'number', example: 4800.50 },
          totalActualCost: { type: 'number', example: 2100.25 },
          costSavings: { type: 'number', example: 700.25 },
          requestsByPriority: {
            type: 'object',
            properties: {
              urgent: { type: 'number', example: 3 },
              high: { type: 'number', example: 7 },
              medium: { type: 'number', example: 12 },
              low: { type: 'number', example: 3 }
            }
          },
          requestsByStatus: {
            type: 'object',
            properties: {
              pending: { type: 'number', example: 8 },
              approved: { type: 'number', example: 12 },
              delivered: { type: 'number', example: 5 }
            }
          },
          topRequestedEquipment: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                equipmentName: { type: 'string', example: 'Safety Helmet' },
                totalRequested: { type: 'number', example: 25 },
                totalDelivered: { type: 'number', example: 20 }
              }
            }
          },
          lastRequestAt: { type: 'string', format: 'date-time' },
          averageApprovalTime: { type: 'number', example: 2.5, description: 'Days' },
          averageDeliveryTime: { type: 'number', example: 5.2, description: 'Days' }
        }
      }
    })
    async getSupplyRequestStats(
      @Param('projectId') projectId: string,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<any> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID for audit logging
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        return this.supplyRequestService.getProjectSupplyRequestStats(
          projectId,
          adminUserId,
          req
        );
      } catch (error) {
        this.logger.error(`Error getting supply request stats: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    // HELPER METHODS
    private async validateProjectAccess(projectId: string, apiKey: string): Promise<AppProject> {
      if (!apiKey) {
        throw new UnauthorizedException('Business API key missing');
      }
  
      const project = await this.supplyRequestService.getProjectById(projectId);
      if (!project) {
        throw new NotFoundException('Project not found');
      }
  
      const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
      if (!business) {
        throw new UnauthorizedException('Invalid API key for this business');
      }
  
      return project;
    }
  }