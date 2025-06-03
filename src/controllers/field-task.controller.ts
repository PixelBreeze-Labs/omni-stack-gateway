// src/controllers/field-task.controller.ts
import { 
    Controller, 
    Get, 
    Post,
    Put,
    Delete,
    Param, 
    Query, 
    Headers, 
    UnauthorizedException, 
    NotFoundException, 
    Logger, 
    InternalServerErrorException,
    BadRequestException,
    Body
  } from '@nestjs/common';
  import { 
    ApiTags, 
    ApiOperation, 
    ApiHeader, 
    ApiParam, 
    ApiResponse, 
    ApiQuery,
    ApiBody
  } from '@nestjs/swagger';
  import { FieldTaskService } from '../services/field-task.service';
  import { BusinessService } from '../services/business.service';
  
  @ApiTags('Field Task Management')
  @Controller('business/tasks')
  @ApiHeader({ 
    name: 'business-x-api-key', 
    required: true, 
    description: 'Business API key for authentication' 
  })
  export class FieldTaskController {
    private readonly logger = new Logger(FieldTaskController.name);
  
    constructor(
      private readonly fieldTaskService: FieldTaskService,
      private readonly businessService: BusinessService
    ) {}
  
    // ============================================================================
    // TASK CRUD ENDPOINTS
    // ============================================================================
  
    @Post()
    @ApiOperation({ 
      summary: 'Create a new field task',
      description: 'Create a new field task with location, schedule, and requirements'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiBody({
      description: 'Field task creation data',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'HVAC Installation - Office Building' },
          description: { type: 'string', example: 'Install new HVAC system in main conference room' },
          type: { type: 'string', enum: ['installation', 'maintenance', 'inspection', 'delivery', 'pickup'] },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          location: {
            type: 'object',
            properties: {
              address: { type: 'string', example: '123 Business Ave, City, State 12345' },
              coordinates: { 
                type: 'object',
                properties: {
                  lat: { type: 'number', example: 40.7128 },
                  lng: { type: 'number', example: -74.0060 }
                }
              },
              accessInstructions: { type: 'string', example: 'Use rear entrance, ask for building manager' }
            }
          },
          schedule: {
            type: 'object',
            properties: {
              scheduledDate: { type: 'string', format: 'date', example: '2024-01-15' },
              timeWindow: {
                type: 'object',
                properties: {
                  start: { type: 'string', example: '09:00' },
                  end: { type: 'string', example: '17:00' },
                  isFlexible: { type: 'boolean', example: true }
                }
              },
              estimatedDuration: { type: 'number', example: 120, description: 'Duration in minutes' }
            }
          },
          requirements: {
            type: 'object',
            properties: {
              skillsRequired: { type: 'array', items: { type: 'string' }, example: ['HVAC', 'Electrical'] },
              equipmentRequired: { type: 'array', items: { type: 'string' }, example: ['Van', 'Lift Equipment'] }
            }
          },
          customer: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'ABC Corporation' },
              email: { type: 'string', example: 'contact@abccorp.com' },
              phone: { type: 'string', example: '+1-555-0123' },
              contactPreference: { type: 'string', enum: ['email', 'phone', 'sms'] }
            }
          },
          metadata: { type: 'object', description: 'Additional custom data' }
        },
        required: ['name', 'type', 'priority', 'location', 'schedule']
      }
    })
    @ApiResponse({ 
      status: 201, 
      description: 'Field task created successfully'
    })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid task data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async createTask(
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Body() taskData: any
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const result = await this.fieldTaskService.createTask({
          businessId,
          ...taskData
        });
  
        return result;
  
      } catch (error) {
        this.logger.error(`Error creating field task: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to create field task');
      }
    }
  
    @Get()
    @ApiOperation({ 
      summary: 'Get field tasks with filters',
      description: 'Retrieve field tasks with optional filtering by status, type, priority, team, and date'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
    @ApiQuery({ name: 'type', required: false, description: 'Filter by task type' })
    @ApiQuery({ name: 'priority', required: false, description: 'Filter by priority' })
    @ApiQuery({ name: 'assignedTeam', required: false, description: 'Filter by assigned team' })
    @ApiQuery({ name: 'date', required: false, description: 'Filter by date (YYYY-MM-DD)' })
    @ApiResponse({ 
      status: 200, 
      description: 'Field tasks retrieved successfully'
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getTasks(
      @Query('businessId') businessId: string,
      @Query('status') status?: string,
      @Query('type') type?: string,
      @Query('priority') priority?: string,
      @Query('assignedTeam') assignedTeam?: string,
      @Query('date') date?: string,
      @Headers('business-x-api-key') apiKey?: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const filters = {
          status,
          type,
          priority,
          assignedTeam,
          date
        };
  
        const result = await this.fieldTaskService.getTasks(businessId, filters);
  
        return {
          success: true,
          ...result
        };
  
      } catch (error) {
        this.logger.error(`Error getting field tasks: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to retrieve field tasks');
      }
    }
  
    @Get('date-range')
    @ApiOperation({ 
      summary: 'Get tasks by date range',
      description: 'Retrieve field tasks within a specific date range'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'startDate', required: true, description: 'Start date (YYYY-MM-DD)' })
    @ApiQuery({ name: 'endDate', required: true, description: 'End date (YYYY-MM-DD)' })
    @ApiResponse({ 
      status: 200, 
      description: 'Tasks retrieved successfully'
    })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid date range' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getTasksByDateRange(
      @Query('businessId') businessId: string,
      @Query('startDate') startDate: string,
      @Query('endDate') endDate: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!startDate || !endDate) {
          throw new BadRequestException('Start date and end date are required');
        }
  
        // Validate date format
        if (isNaN(Date.parse(startDate)) || isNaN(Date.parse(endDate))) {
          throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
        }
  
        if (new Date(startDate) > new Date(endDate)) {
          throw new BadRequestException('Start date must be before end date');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const result = await this.fieldTaskService.getTasksByDateRange(businessId, startDate, endDate);
  
        return {
          success: true,
          startDate,
          endDate,
          ...result
        };
  
      } catch (error) {
        this.logger.error(`Error getting tasks by date range: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to retrieve tasks by date range');
      }
    }
  
    @Put(':taskId')
    @ApiOperation({ 
      summary: 'Update a field task',
      description: 'Update an existing field task with new information'
    })
    @ApiParam({ name: 'taskId', description: 'Task ID' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiBody({
      description: 'Task update data',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          type: { type: 'string', enum: ['installation', 'maintenance', 'inspection', 'delivery', 'pickup'] },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          location: {
            type: 'object',
            properties: {
              address: { type: 'string' },
              coordinates: { 
                type: 'object',
                properties: {
                  lat: { type: 'number' },
                  lng: { type: 'number' }
                }
              },
              accessInstructions: { type: 'string' }
            }
          },
          schedule: {
            type: 'object',
            properties: {
              scheduledDate: { type: 'string', format: 'date' },
              timeWindow: {
                type: 'object',
                properties: {
                  start: { type: 'string' },
                  end: { type: 'string' },
                  isFlexible: { type: 'boolean' }
                }
              },
              estimatedDuration: { type: 'number' }
            }
          },
          requirements: {
            type: 'object',
            properties: {
              skillsRequired: { type: 'array', items: { type: 'string' } },
              equipmentRequired: { type: 'array', items: { type: 'string' } }
            }
          },
          customer: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
              contactPreference: { type: 'string', enum: ['email', 'phone', 'sms'] }
            }
          },
          metadata: { type: 'object' }
        }
      }
    })
    @ApiResponse({ 
      status: 200, 
      description: 'Task updated successfully'
    })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid update data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business or task not found' })
    async updateTask(
      @Param('taskId') taskId: string,
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Body() updateData: any
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!taskId) {
          throw new BadRequestException('Task ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const result = await this.fieldTaskService.updateTask(businessId, taskId, updateData);
  
        return result;
  
      } catch (error) {
        this.logger.error(`Error updating field task: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to update field task');
      }
    }
  
    @Delete(':taskId')
    @ApiOperation({ 
      summary: 'Delete a field task',
      description: 'Remove a field task from the system'
    })
    @ApiParam({ name: 'taskId', description: 'Task ID' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ 
      status: 200, 
      description: 'Task deleted successfully'
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business or task not found' })
    async deleteTask(
      @Param('taskId') taskId: string,
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!taskId) {
          throw new BadRequestException('Task ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const result = await this.fieldTaskService.deleteTask(businessId, taskId);
  
        return result;
  
      } catch (error) {
        this.logger.error(`Error deleting field task: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to delete field task');
      }
    }
  
    // ============================================================================
    // TASK ASSIGNMENT ENDPOINTS
    // ============================================================================
  
    @Post(':taskId/assign')
    @ApiOperation({ 
      summary: 'Assign task to team',
      description: 'Assign a field task to a specific team'
    })
    @ApiParam({ name: 'taskId', description: 'Task ID' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiBody({
      description: 'Team assignment data',
      schema: {
        type: 'object',
        properties: {
          teamId: { type: 'string', description: 'Team ID to assign the task to' }
        },
        required: ['teamId']
      }
    })
    @ApiResponse({ 
      status: 200, 
      description: 'Task assigned to team successfully'
    })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid assignment data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business, task, or team not found' })
    async assignTaskToTeam(
      @Param('taskId') taskId: string,
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Body() assignmentData: {
        teamId: string;
      }
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!taskId) {
          throw new BadRequestException('Task ID is required');
        }
  
        if (!assignmentData.teamId) {
          throw new BadRequestException('Team ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const result = await this.fieldTaskService.assignTaskToTeam(
          businessId,
          taskId,
          assignmentData.teamId
        );
  
        return result;
  
      } catch (error) {
        this.logger.error(`Error assigning task to team: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to assign task to team');
      }
    }
  
    @Put(':taskId/status')
    @ApiOperation({ 
      summary: 'Update task status',
      description: 'Update the status of a field task'
    })
    @ApiParam({ name: 'taskId', description: 'Task ID' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiBody({
      description: 'Status update data',
      schema: {
        type: 'object',
        properties: {
          status: { 
            type: 'string', 
            enum: ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'],
            description: 'New task status'
          }
        },
        required: ['status']
      }
    })
    @ApiResponse({ 
      status: 200, 
      description: 'Task status updated successfully'
    })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid status' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business or task not found' })
    async updateTaskStatus(
      @Param('taskId') taskId: string,
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Body() statusData: {
        status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
      }
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!taskId) {
          throw new BadRequestException('Task ID is required');
        }
  
        if (!statusData.status) {
          throw new BadRequestException('Status is required');
        }
  
        const validStatuses = ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'];
        if (!validStatuses.includes(statusData.status)) {
          throw new BadRequestException('Invalid status. Must be one of: ' + validStatuses.join(', '));
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const result = await this.fieldTaskService.updateTaskStatus(
          businessId,
          taskId,
          statusData.status
        );
  
        return result;
  
      } catch (error) {
        this.logger.error(`Error updating task status: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to update task status');
      }
    }
  
    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================
  
    /**
     * Validate business API key
     */
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