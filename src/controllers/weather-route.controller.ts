// src/controllers/weather-route.controller.ts
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
  import { WeatherRouteService } from '../services/weather-route.service';
  import { BusinessService } from '../services/business.service';
  
  @ApiTags('Weather Integration for Routes')
  @Controller('business/weather-routes')
  @ApiHeader({ 
    name: 'business-x-api-key', 
    required: true, 
    description: 'Business API key for authentication' 
  })
  export class WeatherRouteController {
    private readonly logger = new Logger(WeatherRouteController.name);
  
    constructor(
      private readonly weatherRouteService: WeatherRouteService,
      private readonly businessService: BusinessService
    ) {}
  
    // ============================================================================
    // WEATHER IMPACT ANALYSIS ENDPOINTS
    // ============================================================================
  
    @Get('weather-impact')
    @ApiOperation({ 
      summary: 'Get weather impact analysis',
      description: 'Analyze weather conditions and their impact on route planning'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'lat', required: true, description: 'Latitude coordinate' })
    @ApiQuery({ name: 'lng', required: true, description: 'Longitude coordinate' })
    @ApiQuery({ name: 'date', required: false, description: 'Date for weather analysis (YYYY-MM-DD)' })
    @ApiResponse({ 
      status: 200, 
      description: 'Weather impact analysis retrieved successfully'
    })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid coordinates or date' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getWeatherImpact(
      @Query('businessId') businessId: string,
      @Query('lat') lat: string,
      @Query('lng') lng: string,
      @Query('date') date?: string,
      @Headers('business-x-api-key') apiKey?: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!lat || !lng) {
          throw new BadRequestException('Latitude and longitude are required');
        }
  
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);
  
        if (isNaN(latitude) || isNaN(longitude)) {
          throw new BadRequestException('Invalid latitude or longitude format');
        }
  
        if (latitude < -90 || latitude > 90) {
          throw new BadRequestException('Latitude must be between -90 and 90 degrees');
        }
  
        if (longitude < -180 || longitude > 180) {
          throw new BadRequestException('Longitude must be between -180 and 180 degrees');
        }
  
        // Validate date format if provided
        if (date) {
          const dateObj = new Date(date);
          if (isNaN(dateObj.getTime())) {
            throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
          }
  
          // Don't allow dates more than 7 days in the future
          const maxDate = new Date();
          maxDate.setDate(maxDate.getDate() + 7);
          if (dateObj > maxDate) {
            throw new BadRequestException('Date cannot be more than 7 days in the future');
          }
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const weatherImpact = await this.weatherRouteService.getWeatherImpact(
          businessId,
          { lat: latitude, lng: longitude },
          date
        );
  
        return {
          success: true,
          coordinates: { lat: latitude, lng: longitude },
          date: date || new Date().toISOString().split('T')[0],
          weatherImpact
        };
  
      } catch (error) {
        this.logger.error(`Error getting weather impact: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to retrieve weather impact analysis');
      }
    }
  
    @Post('adjust-route')
    @ApiOperation({ 
      summary: 'Adjust route for weather conditions',
      description: 'Adjust route timing and planning based on current weather conditions'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiBody({
      description: 'Route adjustment data',
      schema: {
        type: 'object',
        properties: {
          taskIds: { 
            type: 'array', 
            items: { type: 'string' },
            example: ['task-1', 'task-2', 'task-3'],
            description: 'Array of task IDs in the route'
          },
          coordinates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                lat: { type: 'number', example: 40.7128 },
                lng: { type: 'number', example: -74.0060 }
              }
            },
            description: 'Array of route coordinates'
          },
          originalTime: { 
            type: 'number', 
            example: 240,
            description: 'Original estimated time in minutes'
          },
          originalDistance: { 
            type: 'number', 
            example: 45.5,
            description: 'Original estimated distance in kilometers'
          },
          date: { 
            type: 'string', 
            format: 'date',
            example: '2024-01-15',
            description: 'Date for weather analysis (optional)'
          }
        },
        required: ['taskIds', 'coordinates', 'originalTime', 'originalDistance']
      }
    })
    @ApiResponse({ 
      status: 200, 
      description: 'Route adjusted for weather conditions successfully'
    })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid route data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async adjustRouteForWeather(
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Body() routeData: {
        taskIds: string[];
        coordinates: Array<{ lat: number; lng: number }>;
        originalTime: number;
        originalDistance: number;
        date?: string;
      }
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!routeData.taskIds || !Array.isArray(routeData.taskIds) || routeData.taskIds.length === 0) {
          throw new BadRequestException('Task IDs array is required and cannot be empty');
        }
  
        if (!routeData.coordinates || !Array.isArray(routeData.coordinates) || routeData.coordinates.length === 0) {
          throw new BadRequestException('Coordinates array is required and cannot be empty');
        }
  
        if (typeof routeData.originalTime !== 'number' || routeData.originalTime <= 0) {
          throw new BadRequestException('Valid original time is required (in minutes)');
        }
  
        if (typeof routeData.originalDistance !== 'number' || routeData.originalDistance <= 0) {
          throw new BadRequestException('Valid original distance is required (in kilometers)');
        }
  
        // Validate coordinates
        for (const coord of routeData.coordinates) {
          if (typeof coord.lat !== 'number' || typeof coord.lng !== 'number') {
            throw new BadRequestException('All coordinates must have valid lat and lng values');
          }
          if (coord.lat < -90 || coord.lat > 90 || coord.lng < -180 || coord.lng > 180) {
            throw new BadRequestException('Invalid coordinate values');
          }
        }
  
        // Validate date if provided
        if (routeData.date) {
          const dateObj = new Date(routeData.date);
          if (isNaN(dateObj.getTime())) {
            throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
          }
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const routeAdjustment = await this.weatherRouteService.adjustRouteForWeather(
          businessId,
          routeData,
          routeData.date
        );
  
        return {
          success: true,
          message: `Route adjusted with ${routeAdjustment.adjustedRoute.weatherDelay} minutes weather delay`,
          routeAdjustment
        };
  
      } catch (error) {
        this.logger.error(`Error adjusting route for weather: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to adjust route for weather conditions');
      }
    }
  
    // ============================================================================
    // WEATHER ALERTS ENDPOINTS
    // ============================================================================
  
    @Get('alerts')
    @ApiOperation({ 
      summary: 'Get weather alerts',
      description: 'Retrieve weather alerts affecting business service areas and routes'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'severity', required: false, description: 'Filter by alert severity', enum: ['low', 'medium', 'high', 'critical'] })
    @ApiQuery({ name: 'alertType', required: false, description: 'Filter by alert type', enum: ['weather_warning', 'route_impact', 'safety_concern'] })
    @ApiResponse({ 
      status: 200, 
      description: 'Weather alerts retrieved successfully'
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getWeatherAlerts(
      @Query('businessId') businessId: string,
      @Query('severity') severity?: string,
      @Query('alertType') alertType?: string,
      @Headers('business-x-api-key') apiKey?: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        // Validate severity filter
        if (severity) {
          const validSeverities = ['low', 'medium', 'high', 'critical'];
          if (!validSeverities.includes(severity)) {
            throw new BadRequestException('Invalid severity. Must be: ' + validSeverities.join(', '));
          }
        }
  
        // Validate alert type filter
        if (alertType) {
          const validTypes = ['weather_warning', 'route_impact', 'safety_concern'];
          if (!validTypes.includes(alertType)) {
            throw new BadRequestException('Invalid alert type. Must be: ' + validTypes.join(', '));
          }
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        let alerts = await this.weatherRouteService.getWeatherAlerts(businessId);
  
        // Apply filters
        if (severity) {
          alerts = alerts.filter(alert => alert.severity === severity);
        }
  
        if (alertType) {
          alerts = alerts.filter(alert => alert.alertType === alertType);
        }
  
        return {
          success: true,
          totalAlerts: alerts.length,
          filters: { severity, alertType },
          alerts
        };
  
      } catch (error) {
        this.logger.error(`Error getting weather alerts: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to retrieve weather alerts');
      }
    }
  
    // ============================================================================
    // WEATHER DATA MANAGEMENT ENDPOINTS
    // ============================================================================
  
    @Put('update-weather-data')
    @ApiOperation({ 
      summary: 'Update weather data',
      description: 'Manually trigger weather data update for all business locations'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ 
      status: 200, 
      description: 'Weather data updated successfully'
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async updateWeatherData(
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const updateResult = await this.weatherRouteService.updateWeatherData(businessId);
  
        return updateResult;
  
      } catch (error) {
        this.logger.error(`Error updating weather data: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to update weather data');
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