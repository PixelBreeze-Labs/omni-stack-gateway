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
        },
        required: ['date', 'taskIds', 'teamIds']
      }
    })
    @ApiResponse({ 
      status: 201, 
      description: 'Routes optimized successfully'
    })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid optimization parameters' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async optimizeRoutes(
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Body() optimizationData: {
        date: string;
        taskIds: string[];
        teamIds: string[];
        params?: {
          prioritizeTime?: boolean;
          prioritizeFuel?: boolean;
          considerWeather?: boolean;
          maxRouteTime?: number;
        };
      }
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!optimizationData.date) {
          throw new BadRequestException('Date is required');
        }
  
        if (!optimizationData.taskIds?.length) {
          throw new BadRequestException('Task IDs are required');
        }
  
        if (!optimizationData.teamIds?.length) {
          throw new BadRequestException('Team IDs are required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const optimizedRoutes = await this.routeOptimizationService.optimizeRoutes({
          businessId,
          ...optimizationData
        });
  
        return {
          success: true,
          message: `Generated ${optimizedRoutes.length} optimized routes`,
          routes: optimizedRoutes
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
      summary: 'Get optimized routes for a date',
      description: 'Retrieve existing optimized routes for a specific date'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'date', required: true, description: 'Date (YYYY-MM-DD)' })
    @ApiResponse({ 
      status: 200, 
      description: 'Optimized routes retrieved successfully'
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getOptimizedRoutes(
      @Query('businessId') businessId: string,
      @Query('date') date: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!date) {
          throw new BadRequestException('Date is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const routes = await this.routeOptimizationService.getOptimizedRoutes(businessId, date);
  
        return {
          success: true,
          date,
          routes
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
      description: 'Retrieve route performance statistics for a specific date'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'date', required: true, description: 'Date (YYYY-MM-DD)' })
    @ApiResponse({ 
      status: 200, 
      description: 'Route statistics retrieved successfully'
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getRouteStats(
      @Query('businessId') businessId: string,
      @Query('date') date: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!date) {
          throw new BadRequestException('Date is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const stats = await this.routeOptimizationService.getRouteStats(businessId, date);
  
        return {
          success: true,
          date,
          stats
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
    @ApiParam({ name: 'routeId', description: 'Route ID (team ID)' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiBody({
      description: 'Route assignment data',
      schema: {
        type: 'object',
        properties: {
          taskIds: { type: 'array', items: { type: 'string' } }
        },
        required: ['taskIds']
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
        taskIds: string[];
      }
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!routeId) {
          throw new BadRequestException('Route ID is required');
        }
  
        if (!assignmentData.taskIds?.length) {
          throw new BadRequestException('Task IDs are required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const result = await this.routeOptimizationService.assignRouteToTeam(
          businessId,
          routeId,
          assignmentData.taskIds
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
          status: { type: 'string', enum: ['started', 'completed'] }
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
        status: 'started' | 'completed';
      }
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
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const result = await this.routeOptimizationService.updateRouteProgress(
          businessId,
          routeId,
          progressData.taskId,
          progressData.status
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
      @Headers('business-x-api-key') apiKey: string
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
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const metrics = await this.routeOptimizationService.calculateRouteMetrics(
          businessId,
          taskIds,
          teamId
        );
  
        return {
          success: true,
          teamId,
          taskIds,
          metrics
        };
  
      } catch (error) {
        this.logger.error(`Error calculating route metrics: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to calculate route metrics');
      }
    }
  
    @Post(':teamId/reoptimize')
    @ApiOperation({ 
      summary: 'Re-optimize existing route',
      description: 'Re-optimize an existing route with optional additional tasks'
    })
    @ApiParam({ name: 'teamId', description: 'Team ID' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiBody({
      description: 'Re-optimization data',
      schema: {
        type: 'object',
        properties: {
          additionalTaskIds: { type: 'array', items: { type: 'string' } }
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
      @Param('teamId') teamId: string,
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Body() reoptimizationData: {
        additionalTaskIds?: string[];
      }
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!teamId) {
          throw new BadRequestException('Team ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const optimizedRoute = await this.routeOptimizationService.reoptimizeRoute(
          businessId,
          teamId,
          reoptimizationData.additionalTaskIds
        );
  
        return {
          success: true,
          message: 'Route re-optimized successfully',
          route: optimizedRoute
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
      @Headers('business-x-api-key') apiKey: string
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
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const validation = await this.routeOptimizationService.validateRouteConstraints(
          businessId,
          teamId,
          taskIds
        );
  
        return {
          success: true,
          teamId,
          taskIds,
          validation
        };
  
      } catch (error) {
        this.logger.error(`Error validating route constraints: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to validate route constraints');
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