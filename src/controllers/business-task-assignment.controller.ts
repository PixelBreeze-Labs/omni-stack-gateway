// src/controllers/business-task-assignment.controller.ts
import { Controller, Get, Post, Put, Body, Param, Headers, UnauthorizedException, NotFoundException, Logger, InternalServerErrorException, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiParam, ApiBody, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { BusinessTaskAssignmentService } from '../services/business-task-assignment.service';
import { BusinessService } from '../services/business.service';
import { TaskAssignment } from '../schemas/task-assignment.schema';

@ApiTags('Business Task Assignment')
@Controller('business-tasks')
@ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
export class BusinessTaskAssignmentController {
  private readonly logger = new Logger(BusinessTaskAssignmentController.name);

  constructor(
    private readonly businessTaskAssignmentService: BusinessTaskAssignmentService,
    private readonly businessService: BusinessService
  ) {}

  @Get('debug/:businessId')
  @ApiOperation({ summary: 'Debug endpoint to check task statuses (remove in production)' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiResponse({ status: 200, description: 'Returns debug information about tasks' })
  async debugTasks(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<any> {
    try {
      await this.validateBusinessApiKey(businessId, apiKey);
      
      // Get all tasks for debugging
      const tasks = await this.businessTaskAssignmentService.debugTaskStatuses(businessId);
      
      return {
        businessId,
        totalTasks: tasks.length,
        tasks: tasks.map(task => ({
          id: task._id,
          title: task.title,
          status: task.status,
          assignedUserId: task.assignedUserId,
          metadata: task.metadata,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt
        }))
      };
    } catch (error) {
      this.logger.error(`Error in debug endpoint: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('pending-approval/:businessId')
  @ApiOperation({ summary: 'Get all tasks pending approval for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiResponse({ status: 200, description: 'Returns all pending approval tasks' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async getPendingApprovalTasks(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<TaskAssignment[]> {
    try {
      // Verify API key is valid for this business
      await this.validateBusinessApiKey(businessId, apiKey);
      
      return this.businessTaskAssignmentService.getPendingApprovalTasks(businessId);
    } catch (error) {
      this.logger.error(`Error getting pending approval tasks: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to get pending approval tasks');
      }
    }
  }

  @Get('approved-rejected/:businessId')
  @ApiOperation({ summary: 'Get approved and rejected task assignments for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status: approved or rejected' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number for pagination' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of items per page' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Filter from date (ISO string)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Filter to date (ISO string)' })
  @ApiResponse({ status: 200, description: 'Returns approved and rejected task assignments' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async getApprovedRejectedTasks(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Query('status') status?: 'approved' | 'rejected',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string
  ): Promise<{
    tasks: TaskAssignment[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    summary: {
      approved: number;
      rejected: number;
      total: number;
    };
  }> {
    try {
      // Verify API key is valid for this business
      await this.validateBusinessApiKey(businessId, apiKey);
      
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      
      const filters = {
        status,
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null,
      };
      
      return this.businessTaskAssignmentService.getApprovedRejectedTasks(
        businessId, 
        pageNum, 
        limitNum, 
        filters
      );
    } catch (error) {
      this.logger.error(`Error getting approved/rejected tasks: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to get approved/rejected tasks');
      }
    }
  }

  @Get('assignment-stats/:businessId')
  @ApiOperation({ summary: 'Get assignment statistics for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'period', required: false, description: 'Time period: today, week, month' })
  @ApiResponse({ status: 200, description: 'Returns assignment statistics' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async getAssignmentStats(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Query('period') period?: 'today' | 'week' | 'month'
  ): Promise<{
    pending: number;
    approved: number;
    rejected: number;
    approvedToday: number;
    rejectedToday: number;
    trends: {
      approvedTrend: number;
      rejectedTrend: number;
    };
  }> {
    try {
      // Verify API key is valid for this business
      await this.validateBusinessApiKey(businessId, apiKey);
      
      return this.businessTaskAssignmentService.getAssignmentStats(businessId, period || 'today');
    } catch (error) {
      this.logger.error(`Error getting assignment stats: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to get assignment stats');
      }
    }
  }

  @Post(':taskId/auto-assign')
  @ApiOperation({ summary: 'Trigger automatic assignment for a specific task' })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiResponse({ status: 200, description: 'Auto-assignment process triggered' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async triggerAutoAssign(
    @Param('taskId') taskId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<{ success: boolean, message: string }> {
    try {
      // Verify task belongs to a business with this API key
      const task = await this.businessTaskAssignmentService.getTaskById(taskId);
      if (!task) {
        throw new NotFoundException('Task not found');
      }
      
      await this.validateBusinessApiKey(task.businessId, apiKey);
      
      const result = await this.businessTaskAssignmentService.triggerAutoAssign(taskId);
      return {
        success: result,
        message: result ? 'Auto-assignment process triggered successfully' : 'Failed to trigger auto-assignment'
      };
    } catch (error) {
      this.logger.error(`Error triggering auto-assign: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to trigger auto-assignment');
      }
    }
  }

  @Put(':taskId/approve')
  @ApiOperation({ summary: 'Approve a pending task assignment' })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiResponse({ status: 200, description: 'Task assignment approved' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Task not found or no pending assignment' })
  async approveTaskAssignment(
    @Param('taskId') taskId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<TaskAssignment> {
    try {
      // Verify task belongs to a business with this API key
      const task = await this.businessTaskAssignmentService.getTaskById(taskId);
      if (!task) {
        throw new NotFoundException('Task not found');
      }
      
      await this.validateBusinessApiKey(task.businessId, apiKey);
      
      if (!task.metadata?.pendingAssignment) {
        throw new NotFoundException('No pending assignment found for this task');
      }
      
      return this.businessTaskAssignmentService.approveTaskAssignment(taskId);
    } catch (error) {
      this.logger.error(`Error approving task assignment: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to approve task assignment');
      }
    }
  }

  @Put(':taskId/reject')
  @ApiOperation({ summary: 'Reject a pending task assignment' })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiBody({ description: 'Rejection reason', type: Object, schema: { properties: { reason: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Task assignment rejected' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Task not found or no pending assignment' })
  async rejectTaskAssignment(
    @Param('taskId') taskId: string,
    @Body() body: { reason: string },
    @Headers('business-x-api-key') apiKey: string
  ): Promise<TaskAssignment> {
    try {
      // Verify task belongs to a business with this API key
      const task = await this.businessTaskAssignmentService.getTaskById(taskId);
      if (!task) {
        throw new NotFoundException('Task not found');
      }
      
      await this.validateBusinessApiKey(task.businessId, apiKey);
      
      if (!task.metadata?.pendingAssignment) {
        throw new NotFoundException('No pending assignment found for this task');
      }
      
      return this.businessTaskAssignmentService.rejectTaskAssignment(taskId, body.reason);
    } catch (error) {
      this.logger.error(`Error rejecting task assignment: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to reject task assignment');
      }
    }
  }

  private async validateBusinessApiKey(businessId: string, apiKey: string) {
    if (!apiKey) {
      throw new UnauthorizedException('Business API key missing');
    }
    
    const business = await this.businessService.findByIdAndApiKey(businessId, apiKey);
    if (!business) {
      throw new UnauthorizedException('Invalid API key for this business');
    }
    
    return business;
  }
}