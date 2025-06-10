// src/controllers/route-optimization.controller.ts
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
import { RouteOptimizationService } from '../services/route-optimization.service';
import { BusinessService } from '../services/business.service';

@ApiTags('Route Optimization')
@Controller('business/routes')
@ApiHeader({ 
  name: 'business-x-api-key', 
  required: true, 
  description: 'Business API key for authentication' 
})
export class RouteOptimizationController {
  private readonly logger = new Logger(RouteOptimizationController.name);

  constructor(
    private readonly routeOptimizationService: RouteOptimizationService,
    private readonly businessService: BusinessService
  ) {}

  // ============================================================================
  // ROUTE OPTIMIZATION ENDPOINTS
  // ============================================================================

  @Post('optimize')
  @ApiOperation({ 
    summary: 'Optimize routes for tasks and teams',
    description: 'Generate optimized routes for given tasks and teams using AI algorithms'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiBody({
    description: 'Route optimization parameters',
    schema: {
      type: 'object',
      properties: {
        date: { type: 'string', example: '2024-01-15' },
        month: { type: 'string', example: '2024-01' },
        taskIds: { type: 'array', items: { type: 'string' } },
        teamIds: { type: 'array', items: { type: 'string' } },
        params: {
          type: 'object',
          properties: {
            prioritizeTime: { type: 'boolean' },
            prioritizeFuel: { type: 'boolean' },
            considerWeather: { type: 'boolean' },
            maxRouteTime: { type: 'number' }
          }
        }
      }
    }
  })
  async optimizeRoutes(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Body() optimizationData: {
      date?: string;
      month?: string;
      taskIds: string[];
      teamIds: string[];
      params?: {
        prioritizeTime?: boolean;
        prioritizeFuel?: boolean;
        considerWeather?: boolean;
        maxRouteTime?: number;
      };
    },
    @Req() req: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }
  
      // Either date or month is required (or taskIds for specific task optimization)
      if (!optimizationData.date && !optimizationData.month && !optimizationData.taskIds?.length) {
        throw new BadRequestException('Either date, month, or taskIds is required');
      }
  
      if (!optimizationData.teamIds?.length) {
        throw new BadRequestException('Team IDs are required');
      }
  
      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID
  
      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const optimizedRoutes = await this.routeOptimizationService.optimizeRoutes({
        businessId,
        ...optimizationData
      },
      adminUserId, // ⬅️ FILL EXISTING userId parameter
      req // ⬅️ FILL EXISTING req parameter
      );
  
      return {
        success: true,
        message: `Generated ${optimizedRoutes.routes.length} optimized routes`,
        routes: optimizedRoutes.routes,
        debug: optimizedRoutes.debug
      };
  
    } catch (error) {
      this.logger.error(`Error optimizing routes: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to optimize routes');
    }
  }

  @Get('optimized')
  @ApiOperation({ 
    summary: 'Get optimized routes for a date or month',
    description: 'Retrieve existing optimized routes for a specific date or month'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiQuery({ name: 'date', required: false, description: 'Date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'month', required: false, description: 'Month (YYYY-MM)' })
  @ApiResponse({ status: 200, description: 'Optimized routes retrieved successfully' })
  async getOptimizedRoutes(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Query('date') date?: string,
    @Query('month') month?: string,
    @Req() req?: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      // Either date or month is required
      if (!date && !month) {
        throw new BadRequestException('Either date or month is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const routes = await this.routeOptimizationService.getOptimizedRoutes(
        businessId, 
        date, 
        month,
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

      return {
        success: true,
        date: routes.date,
        routes: routes.routes,
        debug: routes.debug
      };

    } catch (error) {
      this.logger.error(`Error getting optimized routes: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve optimized routes');
    }
  }

  @Get('stats')
  @ApiOperation({ 
    summary: 'Get route statistics',
    description: 'Retrieve route performance statistics for a specific date or month'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiQuery({ name: 'date', required: false, description: 'Date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'month', required: false, description: 'Month (YYYY-MM)' })
  @ApiResponse({ status: 200, description: 'Route statistics retrieved successfully' })
  async getRouteStats(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Query('date') date?: string,
    @Query('month') month?: string,
    @Req() req?: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      // Either date or month is required
      if (!date && !month) {
        throw new BadRequestException('Either date or month is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const stats = await this.routeOptimizationService.getRouteStats(
        businessId, 
        date, 
        month,
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

      return {
        success: true,
        date: date || month,
        stats: stats.stats,
        debug: stats.debug
      };

    } catch (error) {
      this.logger.error(`Error getting route stats: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve route statistics');
    }
  }

  @Post(':routeId/assign')
  @ApiOperation({ 
    summary: 'Assign route to team',
    description: 'Assign an optimized route to a specific team'
  })
  @ApiParam({ name: 'routeId', description: 'Route ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiBody({
    description: 'Route assignment data',
    schema: {
      type: 'object',
      properties: {
        teamId: { type: 'string' }
      },
      required: ['teamId']
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Route assigned successfully'
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid assignment data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or team not found' })
  async assignRoute(
    @Param('routeId') routeId: string,
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Body() assignmentData: {
      teamId: string;
    },
    @Req() req: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!routeId) {
        throw new BadRequestException('Route ID is required');
      }

      if (!assignmentData.teamId) {
        throw new BadRequestException('Team ID is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const result = await this.routeOptimizationService.assignRouteToTeam(
        businessId,
        assignmentData.teamId,
        routeId,
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

      return result;

    } catch (error) {
      this.logger.error(`Error assigning route: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to assign route');
    }
  }

  @Put(':routeId/progress')
  @ApiOperation({ 
    summary: 'Update route progress',
    description: 'Update the progress of a task within a route'
  })
  @ApiParam({ name: 'routeId', description: 'Route ID (team ID)' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiBody({
    description: 'Progress update data',
    schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        status: { type: 'string', enum: ['started', 'completed', 'paused', 'arrived'] },
        currentLocation: {
          type: 'object',
          properties: {
            latitude: { type: 'number' },
            longitude: { type: 'number' }
          }
        }
      },
      required: ['taskId', 'status']
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Route progress updated successfully'
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid progress data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async updateRouteProgress(
    @Param('routeId') routeId: string,
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Body() progressData: {
      taskId: string;
      status: 'started' | 'completed' | 'paused' | 'arrived';
      currentLocation?: { latitude: number; longitude: number };
    },
    @Req() req: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!routeId) {
        throw new BadRequestException('Route ID is required');
      }

      if (!progressData.taskId) {
        throw new BadRequestException('Task ID is required');
      }

      if (!progressData.status) {
        throw new BadRequestException('Status is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const result = await this.routeOptimizationService.updateRouteProgress(
        businessId,
        routeId,
        progressData.taskId,
        progressData.status,
        progressData.currentLocation,
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

      return result;

    } catch (error) {
      this.logger.error(`Error updating route progress: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update route progress');
    }
  }

  @Get(':teamId/metrics')
  @ApiOperation({ 
    summary: 'Calculate route metrics',
    description: 'Calculate metrics for a potential route assignment'
  })
  @ApiParam({ name: 'teamId', description: 'Team ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiQuery({ name: 'taskIds', required: true, description: 'Comma-separated task IDs' })
  @ApiResponse({ 
    status: 200, 
    description: 'Route metrics calculated successfully'
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async calculateRouteMetrics(
    @Param('teamId') teamId: string,
    @Query('businessId') businessId: string,
    @Query('taskIds') taskIdsQuery: string,
    @Headers('business-x-api-key') apiKey: string,
    @Req() req?: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!teamId) {
        throw new BadRequestException('Team ID is required');
      }

      if (!taskIdsQuery) {
        throw new BadRequestException('Task IDs are required');
      }

      const taskIds = taskIdsQuery.split(',').filter(id => id.trim());
      if (taskIds.length === 0) {
        throw new BadRequestException('Valid task IDs are required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const result = await this.routeOptimizationService.calculateRouteMetrics(
        businessId,
        taskIds,
        teamId,
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

      return {
        success: true,
        teamId,
        taskIds,
        metrics: result.metrics,
        debug: result.debug
      };

    } catch (error) {
      this.logger.error(`Error calculating route metrics: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to calculate route metrics');
    }
  }

  @Post(':routeId/reoptimize')
  @ApiOperation({ 
    summary: 'Re-optimize existing route',
    description: 'Re-optimize an existing route with new parameters'
  })
  @ApiParam({ name: 'routeId', description: 'Route ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiBody({
    description: 'Re-optimization data',
    schema: {
      type: 'object',
      properties: {
        params: {
          type: 'object',
          properties: {
            prioritizeTime: { type: 'boolean' },
            prioritizeFuel: { type: 'boolean' },
            considerWeather: { type: 'boolean' }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Route re-optimized successfully'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async reoptimizeRoute(
    @Param('routeId') routeId: string,
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Body() reoptimizationData: {
      params?: any;
    },
    @Req() req: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!routeId) {
        throw new BadRequestException('Route ID is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const result = await this.routeOptimizationService.reoptimizeRoute(
        businessId,
        routeId,
        reoptimizationData.params,
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

      return {
        success: true,
        message: 'Route re-optimized successfully',
        route: result.route,
        debug: result.debug
      };

    } catch (error) {
      this.logger.error(`Error re-optimizing route: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to re-optimize route');
    }
  }

  @Get(':teamId/validate')
  @ApiOperation({ 
    summary: 'Validate route constraints',
    description: 'Validate if a route assignment meets business constraints'
  })
  @ApiParam({ name: 'teamId', description: 'Team ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiQuery({ name: 'taskIds', required: true, description: 'Comma-separated task IDs' })
  @ApiQuery({ name: 'maxTime', required: false, description: 'Maximum route time in minutes' })
  @ApiQuery({ name: 'maxDistance', required: false, description: 'Maximum route distance in km' })
  @ApiResponse({ 
    status: 200, 
    description: 'Route constraints validated successfully'
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async validateRouteConstraints(
    @Param('teamId') teamId: string,
    @Query('businessId') businessId: string,
    @Query('taskIds') taskIdsQuery: string,
    @Headers('business-x-api-key') apiKey: string,
    @Query('maxTime') maxTime?: string,
    @Query('maxDistance') maxDistance?: string,
    @Req() req?: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!teamId) {
        throw new BadRequestException('Team ID is required');
      }

      if (!taskIdsQuery) {
        throw new BadRequestException('Task IDs are required');
      }

      const taskIds = taskIdsQuery.split(',').filter(id => id.trim());
      if (taskIds.length === 0) {
        throw new BadRequestException('Valid task IDs are required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const result = await this.routeOptimizationService.validateRouteConstraints(
        businessId,
        {
          taskIds,
          teamId,
          maxTime: maxTime ? parseInt(maxTime) : undefined,
          maxDistance: maxDistance ? parseFloat(maxDistance) : undefined
        },
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

      return {
        success: true,
        teamId,
        taskIds,
        valid: result.valid,
        violations: result.violations,
        debug: result.debug
      };

    } catch (error) {
      this.logger.error(`Error validating route constraints: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to validate route constraints');
    }
  }

  @Get(':teamId/progress')
  @ApiOperation({ 
    summary: 'Get route progress',
    description: 'Get current progress of a team\'s route for a specific date or month'
  })
  @ApiParam({ name: 'teamId', description: 'Team ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiQuery({ name: 'date', required: false, description: 'Date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'month', required: false, description: 'Month (YYYY-MM)' })
  @ApiResponse({ status: 200, description: 'Route progress retrieved successfully' })
  async getRouteProgress(
    @Param('teamId') teamId: string,
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Query('date') date?: string,
    @Query('month') month?: string,
    @Req() req?: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!teamId) {
        throw new BadRequestException('Team ID is required');
      }

      // Either date or month is required
      if (!date && !month) {
        throw new BadRequestException('Either date or month is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const result = await this.routeOptimizationService.getRouteProgress(
        businessId,
        teamId,
        date,
        month,
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

      return {
        success: true,
        teamId,
        date: date || month,
        progress: result.progress,
        debug: result.debug
      };

    } catch (error) {
      this.logger.error(`Error getting route progress: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get route progress');
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Validate business API key and return business object
   */
  private async validateBusinessApiKey(businessId: string, apiKey: string) {
    if (!apiKey) {
      throw new UnauthorizedException('Business API key missing');
    }
    
    const business = await this.businessService.findByIdAndApiKey(businessId, apiKey);
    if (!business) {
      throw new UnauthorizedException('Invalid API key for this business');
    }

    // Ensure business has adminUserId
    if (!business.adminUserId) {
      this.logger.warn(`Business ${businessId} missing adminUserId - route activities will not be tracked`);
    }
    
    return business; // ⬅️ RETURN BUSINESS (instead of void)
  }
}