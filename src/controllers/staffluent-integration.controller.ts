// src/controllers/staffluent-integration.controller.ts
import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StaffluentTaskService } from '../services/staffluent-task.service';
import { StaffluentEmployeeService } from '../services/staffluent-employee.service';
import { AutoAssignmentAgentService } from '../services/auto-assignment-agent.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { TaskStatus } from 'src/schemas/task-assignment.schema';
import { TaskAssignment } from 'src/schemas/task-assignment.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

@ApiTags('Staffluent Integration')
@Controller('staffluent-integration')
@UseGuards(ClientAuthGuard)
@ApiBearerAuth()
export class StaffluentIntegrationController {
  constructor(
    private readonly staffluentTaskService: StaffluentTaskService,
    private readonly staffluentEmployeeService: StaffluentEmployeeService,
    private readonly autoAssignmentService: AutoAssignmentAgentService,
    @InjectModel(TaskAssignment.name) private readonly taskAssignmentModel: Model<TaskAssignment>, // Fixed this line

  ) {}

  // Cronjob
  @Post('tasks/sync/:businessId')
  @ApiOperation({ summary: 'Sync tasks from VenueBoost for a business' })
  async syncTasks(@Param('businessId') businessId: string) {
    const count = await this.staffluentTaskService.syncTasksFromVenueBoost(businessId);
    return {
      success: true,
      message: `Successfully synced ${count} tasks for business ${businessId}`
    };
  }

  // Cronjob
  @Post('employees/sync/:businessId')
  @ApiOperation({ summary: 'Sync employees from VenueBoost for a business' })
  async syncEmployees(@Param('businessId') businessId: string) {
    const count = await this.staffluentEmployeeService.syncEmployeesFromVenueBoost(businessId);
    return {
      success: true,
      message: `Successfully synced ${count} employees for business ${businessId}`
    };
  }

  // Auto Assignment Agent
  @Post('tasks/:taskId/assign')
  @ApiOperation({ summary: 'Find optimal assignee for a VenueBoost task' })
  async findOptimalAssignee(@Param('taskId') taskId: string) {
    const result = await this.autoAssignmentService.findOptimalAssigneeForVenueBoostTask(taskId);
    return {
      success: result,
      message: result 
        ? 'Successfully found optimal assignee for task' 
        : 'Could not find optimal assignee for task'
    };
  }

  // Auto Assignment Agent
  @Post('tasks/:taskId/approve-assignment')
  @ApiOperation({ summary: 'Approve pending assignment for a VenueBoost task' })
  async approveAssignment(@Param('taskId') taskId: string) {
    const task = await this.autoAssignmentService.approveVenueBoostAssignment(taskId);
    return {
      success: true,
      message: 'Successfully approved assignment'
    };
  }
  
  // Auto Assignment Agent
  @Post('tasks/assign-batch')
  @ApiOperation({ summary: 'Find optimal assignees for all unassigned tasks' })
  async assignAllUnassignedTasks(@Body() body: { businessId: string }) {
    // Find all unassigned tasks for the given business
    const tasks = await this.taskAssignmentModel.find({
      businessId: body.businessId,
      status: TaskStatus.UNASSIGNED,
      assignedUserId: { $exists: false }
    });
    
    let successCount = 0;
    for (const task of tasks) {
      const success = await this.autoAssignmentService.findOptimalAssigneeForVenueBoostTask(
        task._id.toString()
      );
      if (success) successCount++;
    }
    
    return {
      success: true,
      message: `Successfully processed ${successCount} out of ${tasks.length} unassigned tasks`,
      total: tasks.length,
      assigned: successCount
    };
  }
  
  // Cronjob
  @Post('webhook/task-created')
  @ApiOperation({ summary: 'Webhook endpoint for task creation in VenueBoost' })
  async taskCreatedWebhook(@Body() body: { taskId: string, businessId: string }) {
    try {
      // Sync the specific task from VenueBoost
      await this.staffluentTaskService.syncTasksFromVenueBoost(body.businessId);
      
      return {
        success: true,
        message: 'Task synced successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to sync task: ${error.message}`
      };
    }
  }
  
  // Cronjob
  @Post('webhook/task-updated')
  @ApiOperation({ summary: 'Webhook endpoint for task updates in VenueBoost' })
  async taskUpdatedWebhook(@Body() body: { taskId: string, businessId: string }) {
    try {
      // Sync the specific task from VenueBoost
      await this.staffluentTaskService.syncTasksFromVenueBoost(body.businessId);
      
      return {
        success: true,
        message: 'Task synced successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to sync task: ${error.message}`
      };
    }
  }
  
  // Cronjob
  @Post('webhook/employee-updated')
  @ApiOperation({ summary: 'Webhook endpoint for employee updates in VenueBoost' })
  async employeeUpdatedWebhook(@Body() body: { employeeId: string, businessId: string }) {
    try {
      // Sync the specific employee from VenueBoost
      await this.staffluentEmployeeService.syncEmployeesFromVenueBoost(body.businessId);
      
      return {
        success: true,
        message: 'Employee synced successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to sync employee: ${error.message}`
      };
    }
  }
 }