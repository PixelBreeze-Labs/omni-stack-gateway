// src/controllers/project-checklist.controller.ts
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
  import { ProjectChecklistService } from '../services/project-checklist.service';
  import { BusinessService } from '../services/business.service';
  import { AppProject } from '../schemas/app-project.schema';
  import { ChecklistStatus, ChecklistType, ChecklistPriority, ChecklistItemStatus, ChecklistItemPriority } from '../schemas/project-checklist.schema';
  import {
    CreateProjectChecklistDto,
    UpdateProjectChecklistDto,
    CreateChecklistItemDto,
    UpdateChecklistItemDto,
    CompleteChecklistItemDto,
    ApproveChecklistItemDto,
    BulkUpdateChecklistItemsDto,
    ProjectChecklistResponseDto,
    ProjectChecklistWithItemsResponseDto,
    ChecklistItemResponseDto,
    ProjectChecklistsListResponseDto,
    ChecklistItemsListResponseDto,
    ChecklistActionResponseDto,
    ProjectChecklistStatsResponseDto
  } from '../dtos/project-checklist.dto';
  
  @ApiTags('Project Checklists')
  @Controller('projects/:projectId/checklists')
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class ProjectChecklistController {
    private readonly logger = new Logger(ProjectChecklistController.name);
  
    constructor(
      private readonly projectChecklistService: ProjectChecklistService,
      private readonly businessService: BusinessService
    ) {}
  
    @Get()
    @ApiOperation({ summary: 'Get all checklists for a project' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiQuery({ name: 'page', description: 'Page number', required: false, example: 1 })
    @ApiQuery({ name: 'limit', description: 'Checklists per page', required: false, example: 20 })
    @ApiQuery({ name: 'status', description: 'Filter by status', required: false, enum: ChecklistStatus })
    @ApiQuery({ name: 'type', description: 'Filter by type', required: false, enum: ChecklistType })
    @ApiQuery({ name: 'priority', description: 'Filter by priority', required: false, enum: ChecklistPriority })
    @ApiQuery({ name: 'assignedTo', description: 'Filter by assigned user ID', required: false })
    @ApiQuery({ name: 'overdueOnly', description: 'Show only overdue checklists', required: false, example: false })
    @ApiResponse({
      status: 200,
      description: 'Returns project checklists with pagination',
      type: ProjectChecklistsListResponseDto
    })
    async getProjectChecklists(
      @Param('projectId') projectId: string,
      @Query('page') page?: number,
      @Query('limit') limit?: number,
      @Query('status') status?: ChecklistStatus,
      @Query('type') type?: ChecklistType,
      @Query('priority') priority?: ChecklistPriority,
      @Query('assignedTo') assignedTo?: string,
      @Query('overdueOnly') overdueOnly?: boolean,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ProjectChecklistsListResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID for audit logging
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        return this.projectChecklistService.getProjectChecklists(
          projectId,
          {
            page: page ? parseInt(page.toString()) : 1,
            limit: limit ? parseInt(limit.toString()) : 20,
            status,
            type,
            priority,
            assignedTo,
            // @ts-ignore
            overdueOnly: overdueOnly === true || overdueOnly === 'true'
          },
          adminUserId,
          req
        );
      } catch (error) {
        this.logger.error(`Error getting project checklists: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Post()
    @ApiOperation({ summary: 'Create a new checklist for the project' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiBody({ type: CreateProjectChecklistDto, description: 'Checklist details' })
    @ApiResponse({
      status: 201,
      description: 'Checklist created successfully',
      type: ChecklistActionResponseDto
    })
    async createChecklist(
      @Param('projectId') projectId: string,
      @Body() createChecklistDto: CreateProjectChecklistDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ChecklistActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const checklist = await this.projectChecklistService.createChecklist(
          projectId,
          createChecklistDto,
          adminUserId, // For now, admin is the creator
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Checklist created successfully',
          checklist
        };
      } catch (error) {
        this.logger.error(`Error creating checklist: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || 
            error instanceof NotFoundException || 
            error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to create checklist');
      }
    }
  
    @Get(':checklistId')
    @ApiOperation({ summary: 'Get a specific checklist with its items' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'checklistId', description: 'Checklist ID' })
    @ApiResponse({
      status: 200,
      description: 'Returns checklist with items',
      type: ProjectChecklistWithItemsResponseDto
    })
    async getChecklistWithItems(
      @Param('projectId') projectId: string,
      @Param('checklistId') checklistId: string,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ProjectChecklistWithItemsResponseDto> {
      try {
        await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID for audit logging
        const business = await this.businessService.findByIdAndApiKey(
          (await this.projectChecklistService.getProjectById(projectId)).businessId, 
          apiKey
        );
        const adminUserId = business.adminUserId;
  
        return this.projectChecklistService.getChecklistWithItems(
          projectId,
          checklistId,
          adminUserId,
          req
        );
      } catch (error) {
        this.logger.error(`Error getting checklist with items: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Post(':checklistId/items')
    @ApiOperation({ summary: 'Add an item to a checklist' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'checklistId', description: 'Checklist ID' })
    @ApiBody({ type: CreateChecklistItemDto, description: 'Checklist item details' })
    @ApiResponse({
      status: 201,
      description: 'Checklist item created successfully',
      type: ChecklistActionResponseDto
    })
    async addChecklistItem(
      @Param('projectId') projectId: string,
      @Param('checklistId') checklistId: string,
      @Body() createItemDto: CreateChecklistItemDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ChecklistActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const item = await this.projectChecklistService.addChecklistItem(
          projectId,
          checklistId,
          createItemDto,
          adminUserId, // For now, admin is the creator
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Checklist item created successfully',
          item
        };
      } catch (error) {
        this.logger.error(`Error adding checklist item: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Put(':checklistId/items/:itemId/complete')
    @ApiOperation({ summary: 'Mark a checklist item as completed' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'checklistId', description: 'Checklist ID' })
    @ApiParam({ name: 'itemId', description: 'Checklist item ID' })
    @ApiBody({ type: CompleteChecklistItemDto, description: 'Completion details' })
    @ApiResponse({
      status: 200,
      description: 'Checklist item completed successfully',
      type: ChecklistActionResponseDto
    })
    async completeChecklistItem(
      @Param('projectId') projectId: string,
      @Param('checklistId') checklistId: string,
      @Param('itemId') itemId: string,
      @Body() completeDto: CompleteChecklistItemDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ChecklistActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const item = await this.projectChecklistService.completeChecklistItem(
          projectId,
          checklistId,
          itemId,
          completeDto,
          adminUserId, // For now, admin is completing
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Checklist item completed successfully',
          item
        };
      } catch (error) {
        this.logger.error(`Error completing checklist item: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Put(':checklistId')
    @ApiOperation({ summary: 'Update a checklist' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'checklistId', description: 'Checklist ID to update' })
    @ApiBody({ type: UpdateProjectChecklistDto, description: 'Updated checklist details' })
    @ApiResponse({
      status: 200,
      description: 'Checklist updated successfully',
      type: ChecklistActionResponseDto
    })
    async updateChecklist(
      @Param('projectId') projectId: string,
      @Param('checklistId') checklistId: string,
      @Body() updateChecklistDto: UpdateProjectChecklistDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ChecklistActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        // For now, we'll implement a basic update method
        // In a full implementation, you'd add updateChecklist to the service
        return {
          success: false,
          message: 'Update checklist functionality not yet implemented'
        };
      } catch (error) {
        this.logger.error(`Error updating checklist: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Put(':checklistId/items/:itemId')
    @ApiOperation({ summary: 'Update a checklist item' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'checklistId', description: 'Checklist ID' })
    @ApiParam({ name: 'itemId', description: 'Checklist item ID to update' })
    @ApiBody({ type: UpdateChecklistItemDto, description: 'Updated item details' })
    @ApiResponse({
      status: 200,
      description: 'Checklist item updated successfully',
      type: ChecklistActionResponseDto
    })
    async updateChecklistItem(
      @Param('projectId') projectId: string,
      @Param('checklistId') checklistId: string,
      @Param('itemId') itemId: string,
      @Body() updateItemDto: UpdateChecklistItemDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ChecklistActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // For now, we'll implement a basic response
        // In a full implementation, you'd add updateChecklistItem to the service
        return {
          success: false,
          message: 'Update checklist item functionality not yet implemented'
        };
      } catch (error) {
        this.logger.error(`Error updating checklist item: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Delete(':checklistId')
    @ApiOperation({ summary: 'Delete a checklist' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'checklistId', description: 'Checklist ID to delete' })
    @ApiResponse({
      status: 200,
      description: 'Checklist deleted successfully',
      type: ChecklistActionResponseDto
    })
    async deleteChecklist(
      @Param('projectId') projectId: string,
      @Param('checklistId') checklistId: string,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ChecklistActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // For now, we'll implement a basic response
        // In a full implementation, you'd add deleteChecklist to the service
        return {
          success: false,
          message: 'Delete checklist functionality not yet implemented'
        };
      } catch (error) {
        this.logger.error(`Error deleting checklist: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Delete(':checklistId/items/:itemId')
    @ApiOperation({ summary: 'Delete a checklist item' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'checklistId', description: 'Checklist ID' })
    @ApiParam({ name: 'itemId', description: 'Checklist item ID to delete' })
    @ApiResponse({
      status: 200,
      description: 'Checklist item deleted successfully',
      type: ChecklistActionResponseDto
    })
    async deleteChecklistItem(
      @Param('projectId') projectId: string,
      @Param('checklistId') checklistId: string,
      @Param('itemId') itemId: string,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ChecklistActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // For now, we'll implement a basic response
        // In a full implementation, you'd add deleteChecklistItem to the service
        return {
          success: false,
          message: 'Delete checklist item functionality not yet implemented'
        };
      } catch (error) {
        this.logger.error(`Error deleting checklist item: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Put(':checklistId/items/bulk-update')
    @ApiOperation({ summary: 'Bulk update multiple checklist items' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'checklistId', description: 'Checklist ID' })
    @ApiBody({ type: BulkUpdateChecklistItemsDto, description: 'Bulk update details' })
    @ApiResponse({
      status: 200,
      description: 'Checklist items updated successfully',
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: '5 items updated successfully' },
          updatedCount: { type: 'number', example: 5 }
        }
      }
    })
    async bulkUpdateChecklistItems(
      @Param('projectId') projectId: string,
      @Param('checklistId') checklistId: string,
      @Body() bulkUpdateDto: BulkUpdateChecklistItemsDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<{ success: boolean; message: string; updatedCount: number }> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // For now, we'll implement a basic response
        // In a full implementation, you'd add bulkUpdateChecklistItems to the service
        return {
          success: false,
          message: 'Bulk update functionality not yet implemented',
          updatedCount: 0
        };
      } catch (error) {
        this.logger.error(`Error bulk updating checklist items: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Get('stats/summary')
    @ApiOperation({ summary: 'Get checklist statistics for the project' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiResponse({
      status: 200,
      description: 'Returns checklist statistics',
      type: ProjectChecklistStatsResponseDto
    })
    async getChecklistStats(
      @Param('projectId') projectId: string,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ProjectChecklistStatsResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID for audit logging
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        return this.projectChecklistService.getProjectChecklistStats(
          projectId,
          adminUserId,
          req
        );
      } catch (error) {
        this.logger.error(`Error getting checklist stats: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Get(':checklistId/items')
    @ApiOperation({ summary: 'Get items for a specific checklist' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'checklistId', description: 'Checklist ID' })
    @ApiQuery({ name: 'page', description: 'Page number', required: false, example: 1 })
    @ApiQuery({ name: 'limit', description: 'Items per page', required: false, example: 50 })
    @ApiQuery({ name: 'status', description: 'Filter by status', required: false, enum: ChecklistItemStatus })
    @ApiQuery({ name: 'priority', description: 'Filter by priority', required: false, enum: ChecklistItemPriority })
    @ApiQuery({ name: 'assignedTo', description: 'Filter by assigned user ID', required: false })
    @ApiQuery({ name: 'overdueOnly', description: 'Show only overdue items', required: false, example: false })
    @ApiQuery({ name: 'completedOnly', description: 'Show only completed items', required: false, example: false })
    @ApiResponse({
      status: 200,
      description: 'Returns checklist items with pagination',
      type: ChecklistItemsListResponseDto
    })
    async getChecklistItems(
      @Param('projectId') projectId: string,
      @Param('checklistId') checklistId: string,
      @Query('page') page?: number,
      @Query('limit') limit?: number,
      @Query('status') status?: ChecklistItemStatus,
      @Query('priority') priority?: ChecklistItemPriority,
      @Query('assignedTo') assignedTo?: string,
      @Query('overdueOnly') overdueOnly?: boolean,
      @Query('completedOnly') completedOnly?: boolean,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ChecklistItemsListResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // For now, we'll implement a basic response
        // In a full implementation, you'd add getChecklistItems to the service
        return {
          items: [],
          pagination: {
            total: 0,
            page: page || 1,
            limit: limit || 50,
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false
          },
          summary: {
            totalItems: 0,
            completedItems: 0,
            pendingItems: 0,
            overdueItems: 0,
            completionPercentage: 0,
            lastCompletionAt: null
          }
        };
      } catch (error) {
        this.logger.error(`Error getting checklist items: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    // HELPER METHODS
    private async validateProjectAccess(projectId: string, apiKey: string): Promise<AppProject> {
      if (!apiKey) {
        throw new UnauthorizedException('Business API key missing');
      }
  
      const project = await this.projectChecklistService.getProjectById(projectId);
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