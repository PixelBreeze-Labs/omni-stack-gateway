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
  Body,
  Req
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
import { TeamLocationStatus, ConnectivityStatus } from '../schemas/team-location.schema';
import { TeamAvailabilityResponse, AllTeamsAvailabilityResponse } from '../services/team-location.service';

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
  @ApiParam({ name: 'teamId', description: 'Team ID (PHP ID or MongoDB ID)' })
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
            address: { type: 'string', example: '123 Main St, New York, NY', description: 'Human-readable address' },
            accuracy: { type: 'number', example: 5, description: 'GPS accuracy in meters' },
            altitude: { type: 'number', example: 100, description: 'Altitude in meters' },
            speed: { type: 'number', example: 25, description: 'Speed in km/h' },
            heading: { type: 'number', example: 180, description: 'Direction in degrees' }
          },
          required: ['lat', 'lng']
        },
        status: { 
          type: 'string', 
          enum: ['active', 'inactive', 'break', 'offline'],
          example: 'active',
          description: 'Current team status'
        },
        currentTaskId: { 
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
        deviceId: {
          type: 'string',
          example: 'device-12345',
          description: 'Unique device identifier'
        },
        appVersion: {
          type: 'string',
          example: '1.2.3',
          description: 'App version being used'
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
        accuracy?: number;
        altitude?: number;
        speed?: number;
        heading?: number;
      };
      status?: 'active' | 'inactive' | 'break' | 'offline';
      currentTaskId?: string;
      batteryLevel?: number;
      connectivity?: 'online' | 'offline' | 'poor';
      deviceId?: string;
      appVersion?: string;
      metadata?: any;
    },
    @Req() req: any
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

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // Convert string status to enum
      let status: TeamLocationStatus | undefined;
      if (locationData.status) {
        switch (locationData.status) {
          case 'active':
            status = TeamLocationStatus.ACTIVE;
            break;
          case 'inactive':
            status = TeamLocationStatus.INACTIVE;
            break;
          case 'break':
            status = TeamLocationStatus.BREAK;
            break;
          case 'offline':
            status = TeamLocationStatus.OFFLINE;
            break;
          default:
            throw new BadRequestException('Invalid status value');
        }
      }

      // Convert string connectivity to enum
      let connectivity: ConnectivityStatus | undefined;
      if (locationData.connectivity) {
        switch (locationData.connectivity) {
          case 'online':
            connectivity = ConnectivityStatus.ONLINE;
            break;
          case 'offline':
            connectivity = ConnectivityStatus.OFFLINE;
            break;
          case 'poor':
            connectivity = ConnectivityStatus.POOR;
            break;
          default:
            throw new BadRequestException('Invalid connectivity value');
        }
      }

      this.logger.log(`Updating location for team ${teamId} in business ${businessId}`);

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const result = await this.teamLocationService.updateTeamLocation({
        businessId,
        teamId,
        location: locationData.location,
        status,
        currentTaskId: locationData.currentTaskId,
        batteryLevel: locationData.batteryLevel,
        connectivity,
        deviceId: locationData.deviceId,
        appVersion: locationData.appVersion,
        metadata: locationData.metadata
      },
      adminUserId, // ⬅️ FILL EXISTING userId parameter
      req // ⬅️ FILL EXISTING req parameter
      );

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
  @ApiQuery({ name: 'lastUpdatedSince', required: false, description: 'Filter by last update time (ISO string)' })
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
    @Query('lastUpdatedSince') lastUpdatedSince?: string,
    @Headers('business-x-api-key') apiKey?: string,
    @Req() req?: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      const filters = {
        status,
        project,
        lastUpdatedSince
      };

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const teamLocations = await this.teamLocationService.getTeamLocations(
        businessId, 
        filters,
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

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
    @Headers('business-x-api-key') apiKey: string,
    @Req() req: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const stats = await this.teamLocationService.getLocationStats(
        businessId,
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

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

  @Get(':teamId/location-history')
  @ApiOperation({ 
    summary: 'Get team location history',
    description: 'Retrieve historical location data for a specific team'
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (PHP ID or MongoDB ID)' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of records to return (default: 100)' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date for filtering (ISO string)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date for filtering (ISO string)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Location history retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        history: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' },
              latitude: { type: 'number' },
              longitude: { type: 'number' },
              address: { type: 'string' },
              accuracy: { type: 'number' },
              source: { type: 'string', enum: ['gps', 'manual', 'address'] },
              notes: { type: 'string' },
              isManualUpdate: { type: 'boolean' },
              batteryLevel: { type: 'number' },
              speed: { type: 'number' },
              heading: { type: 'number' }
            }
          }
        },
        total: { type: 'number' },
        teamId: { type: 'string' },
        teamName: { type: 'string' }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or team not found' })
  async getTeamLocationHistory(
    @Param('teamId') teamId: string,
    @Query('businessId') businessId: string,
    @Query('limit') limit?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Headers('business-x-api-key') apiKey?: string,
    @Req() req?: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!teamId) {
        throw new BadRequestException('Team ID is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      const filters = {
        limit: limit ? parseInt(limit) : 100,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      };

      // Validate date range
      if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
        throw new BadRequestException('Start date cannot be after end date');
      }

      // Validate limit
      if (filters.limit < 1 || filters.limit > 1000) {
        throw new BadRequestException('Limit must be between 1 and 1000');
      }

      this.logger.log(`Getting location history for team ${teamId} (business: ${businessId})`);
      
      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const result = await this.teamLocationService.getTeamLocationHistory(
        businessId, 
        teamId, 
        filters,
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

      return {
        success: true,
        ...result
      };

    } catch (error) {
      this.logger.error(`Error getting team location history: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve location history');
    }
  }

  @Post(':teamId/route-progress')
  @ApiOperation({ 
    summary: 'Track route progress',
    description: 'Update the route progress for a team currently on assignment'
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (PHP ID or MongoDB ID)' })
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
        },
        routeDate: {
          type: 'string',
          format: 'date',
          example: '2024-01-15',
          description: 'Date of the route (optional, defaults to today)'
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
      routeDate?: string;
    },
    @Req() req: any
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

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // Parse route date if provided
      const routeDate = progressData.routeDate ? new Date(progressData.routeDate) : undefined;

      this.logger.log(`Tracking route progress for team ${teamId}: ${progressData.completedTasks}/${progressData.taskIds.length} tasks`);

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const result = await this.teamLocationService.trackRouteProgress(
        businessId,
        teamId,
        {
          taskIds: progressData.taskIds,
          currentTaskIndex: progressData.currentTaskIndex,
          completedTasks: progressData.completedTasks,
          routeDate
        },
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
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
    @Headers('business-x-api-key') apiKey: string,
    @Req() req: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const result = await this.teamLocationService.exportLocationData(
        businessId,
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

      return result;

    } catch (error) {
      this.logger.error(`Error exporting location data: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to export location data');
    }
  }

  /**
* Get team availability with comprehensive analytics
* Returns detailed availability data including today's status, weekly view, upcoming schedule, and performance metrics
*/
@Get('/availability')
@ApiOperation({ 
summary: 'Get comprehensive team availability data',
description: 'Returns detailed availability information including current status, weekly schedule, upcoming tasks, and performance metrics'
})
@ApiResponse({ 
status: 200, 
description: 'Team availability data retrieved successfully',
schema: {
  example: {
    teamId: "team_123",
    teamName: "Alpha Team",
    availability: {
      today: {
        status: "available",
        workingHours: { start: "8:00 AM", end: "5:00 PM" },
        scheduledTasks: 6,
        completedTasks: 4,
        currentCapacity: 6,
        maxCapacity: 10
      },
      week: [
        {
          date: "2025-06-05",
          dayOfWeek: "Thursday",
          status: "busy",
          scheduledHours: 7.5,
          tasks: 6
        }
      ],
      upcomingSchedule: [
        {
          date: "2025-06-06",
          time: "2:00 PM",
          task: "Client site inspection",
          location: "123 Main St, Downtown",
          duration: 2
        }
      ]
    },
    performance: {
      efficiency: 87,
      completionRate: 94,
      averageResponseTime: 18,
      rating: 4.3
    },
    lastUpdated: "2025-06-05T10:30:00Z",
    emergencyContact: {
      name: "John Supervisor",
      phone: "+1-555-0123",
      relationship: "Team Lead"
    }
  }
}
})
async getTeamAvailability(
@Query('businessId') businessId: string,
@Query('teamId') teamId?: string,
@Req() req?: any
): Promise<TeamAvailabilityResponse | AllTeamsAvailabilityResponse> {
try {
  // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
  const business = await this.validateBusinessApiKey(businessId, ''); // Note: No API key validation needed for this method
  const adminUserId = business.adminUserId; // Extract admin user ID
  
  this.logger.log(`Getting availability for ${teamId ? `team ${teamId}` : 'all teams'} in business ${businessId}`);
  
  // 🎯 PASS TO EXISTING SERVICE PARAMETERS
  const result = await this.teamLocationService.getTeamAvailability(
    businessId, 
    teamId,
    adminUserId, // ⬅️ FILL EXISTING userId parameter
    req // ⬅️ FILL EXISTING req parameter
  );
  
  // Return the comprehensive availability data
  return {
    // @ts-ignore
    success: true,
    data: result,
    message: teamId ? 
      `Availability data retrieved for team ${teamId}` : 
      `Availability data retrieved for ${result.teams?.length || 0} teams`
  };
  
} catch (error) {
  this.logger.error(`Error getting team availability: ${error.message}`, error.stack);
  
  if (error instanceof NotFoundException) {
    throw new NotFoundException(error.message);
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
  @ApiParam({ name: 'teamId', description: 'Team ID (PHP ID or MongoDB ID)' })
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
    },
    @Req() req: any
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
        currentTaskId: legacyData.currentTask, // Note: mapped from currentTask to currentTaskId
        batteryLevel: legacyData.batteryLevel,
        connectivity: legacyData.connectivity
      };

      // Call the main update method with req parameter
      return await this.updateTeamLocation(teamId, businessId, apiKey, locationData, req);

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