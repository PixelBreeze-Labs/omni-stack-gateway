// src/controllers/team-location.controller.ts
import { 
    Controller, 
    Get, 
    Post,
    Put,
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
  import { TeamLocationService } from '../services/team-location.service';
  import { BusinessService } from '../services/business.service';
  
  @ApiTags('Team Location Tracking')
  @Controller('business/team-locations')
  @ApiHeader({ 
    name: 'business-x-api-key', 
    required: true, 
    description: 'Business API key for authentication' 
  })
  export class TeamLocationController {
    private readonly logger = new Logger(TeamLocationController.name);
  
    constructor(
      private readonly teamLocationService: TeamLocationService,
      private readonly businessService: BusinessService
    ) {}
  
    // ============================================================================
    // LOCATION TRACKING ENDPOINTS
    // ============================================================================
  
    @Post(':teamId/location')
    @ApiOperation({ 
      summary: 'Update team location',
      description: 'Update the current location and status of a field team'
    })
    @ApiParam({ name: 'teamId', description: 'Team ID' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiBody({
      description: 'Team location update data',
      schema: {
        type: 'object',
        properties: {
          location: {
            type: 'object',
            properties: {
              lat: { type: 'number', example: 40.7128, description: 'Latitude coordinate' },
              lng: { type: 'number', example: -74.0060, description: 'Longitude coordinate' },
              address: { type: 'string', example: '123 Main St, New York, NY', description: 'Human-readable address' }
            },
            required: ['lat', 'lng']
          },
          status: { 
            type: 'string', 
            enum: ['active', 'inactive', 'break', 'offline'],
            example: 'active',
            description: 'Current team status'
          },
          currentTask: { 
            type: 'string', 
            example: 'task-123',
            description: 'ID of current task being worked on'
          },
          batteryLevel: { 
            type: 'number', 
            minimum: 0, 
            maximum: 100,
            example: 85,
            description: 'Device battery level percentage'
          },
          connectivity: { 
            type: 'string', 
            enum: ['online', 'offline', 'poor'],
            example: 'online',
            description: 'Device connectivity status'
          },
          metadata: { 
            type: 'object', 
            description: 'Additional custom data'
          }
        },
        required: ['location']
      }
    })
    @ApiResponse({ 
      status: 200, 
      description: 'Team location updated successfully'
    })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid location data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business or team not found' })
    async updateTeamLocation(
      @Param('teamId') teamId: string,
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Body() locationData: {
        location: {
          lat: number;
          lng: number;
          address?: string;
        };
        status?: 'active' | 'inactive' | 'break' | 'offline';
        currentTask?: string;
        batteryLevel?: number;
        connectivity?: 'online' | 'offline' | 'poor';
        metadata?: any;
      }
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!teamId) {
          throw new BadRequestException('Team ID is required');
        }
  
        if (!locationData.location) {
          throw new BadRequestException('Location data is required');
        }
  
        if (typeof locationData.location.lat !== 'number' || typeof locationData.location.lng !== 'number') {
          throw new BadRequestException('Valid latitude and longitude are required');
        }
  
        // Validate battery level if provided
        if (locationData.batteryLevel !== undefined) {
          if (locationData.batteryLevel < 0 || locationData.batteryLevel > 100) {
            throw new BadRequestException('Battery level must be between 0 and 100');
          }
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const result = await this.teamLocationService.updateTeamLocation({
          businessId,
          teamId,
          ...locationData
        });
  
        return result;
  
      } catch (error) {
        this.logger.error(`Error updating team location: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to update team location');
      }
    }
  
    @Get()
    @ApiOperation({ 
      summary: 'Get team locations',
      description: 'Retrieve current locations of all teams with optional filtering'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'status', required: false, description: 'Filter by team status' })
    @ApiQuery({ name: 'project', required: false, description: 'Filter by project name' })
    @ApiResponse({ 
      status: 200, 
      description: 'Team locations retrieved successfully'
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getTeamLocations(
      @Query('businessId') businessId: string,
      @Query('status') status?: string,
      @Query('project') project?: string,
      @Headers('business-x-api-key') apiKey?: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const filters = {
          status,
          project
        };
  
        const teamLocations = await this.teamLocationService.getTeamLocations(businessId, filters);
  
        return {
          success: true,
          teamLocations,
          total: teamLocations.length
        };
  
      } catch (error) {
        this.logger.error(`Error getting team locations: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to retrieve team locations');
      }
    }
  
    @Get('stats')
    @ApiOperation({ 
      summary: 'Get location statistics',
      description: 'Retrieve team location statistics and metrics'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ 
      status: 200, 
      description: 'Location statistics retrieved successfully'
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getLocationStats(
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const stats = await this.teamLocationService.getLocationStats(businessId);
  
        return {
          success: true,
          stats
        };
  
      } catch (error) {
        this.logger.error(`Error getting location statistics: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to retrieve location statistics');
      }
    }
  
    @Post(':teamId/route-progress')
    @ApiOperation({ 
      summary: 'Track route progress',
      description: 'Update the route progress for a team currently on assignment'
    })
    @ApiParam({ name: 'teamId', description: 'Team ID' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiBody({
      description: 'Route progress data',
      schema: {
        type: 'object',
        properties: {
          taskIds: { 
            type: 'array', 
            items: { type: 'string' },
            example: ['task-1', 'task-2', 'task-3'],
            description: 'Array of task IDs in the route'
          },
          currentTaskIndex: { 
            type: 'number', 
            example: 1,
            description: 'Index of current task being worked on'
          },
          completedTasks: { 
            type: 'number', 
            example: 1,
            description: 'Number of tasks completed'
          }
        },
        required: ['taskIds', 'currentTaskIndex', 'completedTasks']
      }
    })
    @ApiResponse({ 
      status: 200, 
      description: 'Route progress updated successfully'
    })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid progress data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business or team not found' })
    async trackRouteProgress(
      @Param('teamId') teamId: string,
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Body() progressData: {
        taskIds: string[];
        currentTaskIndex: number;
        completedTasks: number;
      }
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!teamId) {
          throw new BadRequestException('Team ID is required');
        }
  
        if (!progressData.taskIds || !Array.isArray(progressData.taskIds) || progressData.taskIds.length === 0) {
          throw new BadRequestException('Valid task IDs array is required');
        }
  
        if (typeof progressData.currentTaskIndex !== 'number' || progressData.currentTaskIndex < 0) {
          throw new BadRequestException('Valid current task index is required');
        }
  
        if (typeof progressData.completedTasks !== 'number' || progressData.completedTasks < 0) {
          throw new BadRequestException('Valid completed tasks count is required');
        }
  
        if (progressData.currentTaskIndex >= progressData.taskIds.length) {
          throw new BadRequestException('Current task index cannot exceed total tasks');
        }
  
        if (progressData.completedTasks > progressData.taskIds.length) {
          throw new BadRequestException('Completed tasks cannot exceed total tasks');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const result = await this.teamLocationService.trackRouteProgress(
          businessId,
          teamId,
          progressData
        );
  
        return result;
  
      } catch (error) {
        this.logger.error(`Error tracking route progress: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to track route progress');
      }
    }
  
    @Get('export')
    @ApiOperation({ 
      summary: 'Export location data',
      description: 'Export team location data for reporting and analysis'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ 
      status: 200, 
      description: 'Location data exported successfully'
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async exportLocationData(
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const result = await this.teamLocationService.exportLocationData(businessId);
  
        return result;
  
      } catch (error) {
        this.logger.error(`Error exporting location data: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to export location data');
      }
    }
  
    @Get('availability')
    @ApiOperation({ 
      summary: 'Get team availability',
      description: 'Get availability status of all teams or a specific team'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'teamId', required: false, description: 'Specific team ID (optional)' })
    @ApiResponse({ 
      status: 200, 
      description: 'Team availability retrieved successfully'
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business or team not found' })
    async getTeamAvailability(
      @Query('businessId') businessId: string,
      @Query('teamId') teamId?: string,
      @Headers('business-x-api-key') apiKey?: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const availability = await this.teamLocationService.getTeamAvailability(businessId, teamId);
  
        return {
          success: true,
          ...availability
        };
  
      } catch (error) {
        this.logger.error(`Error getting team availability: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to retrieve team availability');
      }
    }
  
    // ============================================================================
    // LEGACY ENDPOINT FOR BACKWARD COMPATIBILITY
    // ============================================================================
  
    @Put(':teamId')
    @ApiOperation({ 
      summary: 'Update team location (legacy)',
      description: 'Legacy endpoint for updating team location - use POST /:teamId/location instead'
    })
    @ApiParam({ name: 'teamId', description: 'Team ID' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiBody({
      description: 'Team location data (legacy format)',
      schema: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          address: { type: 'string' },
          status: { type: 'string', enum: ['active', 'inactive', 'break', 'offline'] },
          currentTask: { type: 'string' },
          batteryLevel: { type: 'number' },
          connectivity: { type: 'string', enum: ['online', 'offline', 'poor'] }
        },
        required: ['lat', 'lng']
      }
    })
    @ApiResponse({ 
      status: 200, 
      description: 'Team location updated successfully'
    })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid location data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business or team not found' })
    async updateTeamLocationLegacy(
      @Param('teamId') teamId: string,
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Body() legacyData: {
        lat: number;
        lng: number;
        address?: string;
        status?: 'active' | 'inactive' | 'break' | 'offline';
        currentTask?: string;
        batteryLevel?: number;
        connectivity?: 'online' | 'offline' | 'poor';
      }
    ): Promise<any> {
      try {
        // Convert legacy format to new format
        const locationData = {
          location: {
            lat: legacyData.lat,
            lng: legacyData.lng,
            address: legacyData.address
          },
          status: legacyData.status,
          currentTask: legacyData.currentTask,
          batteryLevel: legacyData.batteryLevel,
          connectivity: legacyData.connectivity
        };
  
        // Call the main update method
        return await this.updateTeamLocation(teamId, businessId, apiKey, locationData);
  
      } catch (error) {
        this.logger.error(`Error updating team location (legacy): ${error.message}`, error.stack);
        throw error;
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