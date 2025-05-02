// src/controllers/auto-assignment.controller.ts
import { Controller, Get, Post, Body, Param, Query, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { AutoAssignmentAgentService } from '../services/auto-assignment-agent.service';
import { TaskAssignment, TaskStatus } from '../schemas/task-assignment.schema';

@ApiTags('Auto Assignment')
@Controller('auto-assignment')
export class AutoAssignmentController {
  constructor(private readonly autoAssignmentService: AutoAssignmentAgentService) {}

  @Post('tasks')
  @ApiOperation({ summary: 'Create a new task' })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  async createTask(@Body() taskData: Partial<TaskAssignment>): Promise<TaskAssignment> {
    return this.autoAssignmentService.createTask(taskData);
  }

  @Get('tasks/business/:businessId')
  @ApiOperation({ summary: 'Get all tasks for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'status', required: false, enum: TaskStatus })
  @ApiQuery({ name: 'assignedUserId', required: false })
  async getBusinessTasks(
    @Param('businessId') businessId: string,
    @Query('status') status?: TaskStatus,
    @Query('assignedUserId') assignedUserId?: string,
    @Query('dueDate') dueDate?: Date
  ): Promise<TaskAssignment[]> {
    return this.autoAssignmentService.getBusinessTasks(businessId, {
      status,
      assignedUserId,
      dueDate
    });
  }

  @Put('tasks/:taskId/assign/:userId')
  @ApiOperation({ summary: 'Manually assign a task to a user' })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  async assignTask(
    @Param('taskId') taskId: string,
    @Param('userId') userId: string
  ): Promise<TaskAssignment> {
    return this.autoAssignmentService.manuallyAssignTask(taskId, userId);
  }

  // Update in auto-assignment.controller.ts
    @Post('tasks/:taskId/auto-assign')
    @ApiOperation({ summary: 'Trigger automatic assignment for a specific task' })
    @ApiParam({ name: 'taskId', description: 'Task ID' })
    async triggerAutoAssign(@Param('taskId') taskId: string): Promise<{ success: boolean, message: string }> {
    const task = await this.autoAssignmentService.getTaskById(taskId);
    if (!task) {
        return { success: false, message: 'Task not found' };
    }
    
    await this.autoAssignmentService.findOptimalAssignee(task);
    return { success: true, message: 'Auto-assignment process triggered' };
    }

    @Put('tasks/:taskId/approve')
  @ApiOperation({ summary: 'Approve a pending task assignment' })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
 
  async approveTaskAssignment(
    @Param('taskId') taskId: string
  ): Promise<TaskAssignment> {
    return this.autoAssignmentService.approveAssignment(taskId);
  }

  @Put('tasks/:taskId/reject')
  @ApiOperation({ summary: 'Reject a pending task assignment' })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiBody({ description: 'Rejection reason' })
  async rejectTaskAssignment(
    @Param('taskId') taskId: string,
    @Body() body: { reason: string }
  ): Promise<TaskAssignment> {
    return this.autoAssignmentService.rejectAssignment(taskId, body.reason);
  }

  @Get('tasks/pending-approval/:businessId')
@ApiOperation({ summary: 'Get all tasks pending approval for a business' })
@ApiParam({ name: 'businessId', description: 'Business ID' })
async getPendingApprovalTasks(
  @Param('businessId') businessId: string
): Promise<TaskAssignment[]> {
  return this.autoAssignmentService.getPendingApprovalTasks(businessId);
}
}