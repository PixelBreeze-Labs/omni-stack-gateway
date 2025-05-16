// src/controllers/business-weather-alert.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Headers, Query, UnauthorizedException, NotFoundException, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiParam, ApiBody, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { WeatherService } from '../services/weather.service';
import { BusinessService } from '../services/business.service';
import { BusinessWeatherSettingsDto, WeatherAlertConfigDto } from '../dtos/business-weather.dto';

@ApiTags('Business Weather Alerts')
@Controller('business-weather')
@ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
export class BusinessWeatherAlertController {
  private readonly logger = new Logger(BusinessWeatherAlertController.name);

  constructor(
    private readonly weatherService: WeatherService,
    private readonly businessService: BusinessService
  ) {}

  @Get('settings/:businessId')
  @ApiOperation({ summary: 'Get weather alert settings for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiResponse({ status: 200, description: 'Returns business weather settings' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async getWeatherSettings(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ) {
    try {
      await this.validateBusinessApiKey(businessId, apiKey);
      return this.weatherService.getBusinessWeatherSettings(businessId);
    } catch (error) {
      this.handleError(error, 'Failed to get weather settings');
    }
  }

  @Put('settings/:businessId')
  @ApiOperation({ summary: 'Update weather alert settings for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiBody({ type: BusinessWeatherSettingsDto })
  @ApiResponse({ status: 200, description: 'Settings updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async updateWeatherSettings(
    @Param('businessId') businessId: string,
    @Body() settings: BusinessWeatherSettingsDto,
    @Headers('business-x-api-key') apiKey: string
  ) {
    try {
      await this.validateBusinessApiKey(businessId, apiKey);
      return this.weatherService.updateBusinessWeatherSettings(businessId, settings);
    } catch (error) {
      this.handleError(error, 'Failed to update weather settings');
    }
  }

  @Get('forecast/:businessId')
  @ApiOperation({ summary: 'Get weather forecast for business projects' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'projectId', required: false, description: 'Filter by project ID' })
  @ApiResponse({ status: 200, description: 'Returns weather forecast data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or project not found' })
  async getProjectForecast(
    @Param('businessId') businessId: string,
    @Query('projectId') projectId: string,
    @Headers('business-x-api-key') apiKey: string
  ) {
    try {
      await this.validateBusinessApiKey(businessId, apiKey);
      
      if (projectId) {
        return this.weatherService.getProjectForecast(businessId, projectId);
      } else {
        return this.weatherService.getAllProjectsForecasts(businessId);
      }
    } catch (error) {
      this.handleError(error, 'Failed to get weather forecast');
    }
  }

  @Get('alerts/:businessId')
  @ApiOperation({ summary: 'Get active weather alerts for business projects' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'projectId', required: false, description: 'Filter by project ID' })
  @ApiResponse({ status: 200, description: 'Returns active weather alerts' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or project not found' })
  async getActiveAlerts(
    @Param('businessId') businessId: string,
    @Query('projectId') projectId: string,
    @Headers('business-x-api-key') apiKey: string
  ) {
    try {
      await this.validateBusinessApiKey(businessId, apiKey);
      
      if (projectId) {
        return this.weatherService.getProjectAlerts(businessId, projectId);
      } else {
        return this.weatherService.getAllBusinessAlerts(businessId);
      }
    } catch (error) {
      this.handleError(error, 'Failed to get weather alerts');
    }
  }

  @Post('alerts/:businessId/project/:projectId')
  @ApiOperation({ summary: 'Configure project-specific weather alerts' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiBody({ type: WeatherAlertConfigDto })
  @ApiResponse({ status: 200, description: 'Project weather alerts configured successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or project not found' })
  async configureProjectAlerts(
    @Param('businessId') businessId: string,
    @Param('projectId') projectId: string,
    @Body() config: WeatherAlertConfigDto,
    @Headers('business-x-api-key') apiKey: string
  ) {
    try {
      await this.validateBusinessApiKey(businessId, apiKey);
      return this.weatherService.configureProjectWeatherAlerts(businessId, projectId, config);
    } catch (error) {
      this.handleError(error, 'Failed to configure project weather alerts');
    }
  }

  @Delete('alerts/:businessId/project/:projectId')
  @ApiOperation({ summary: 'Disable weather alerts for a project' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Project weather alerts disabled successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or project not found' })
  async disableProjectAlerts(
    @Param('businessId') businessId: string,
    @Param('projectId') projectId: string,
    @Headers('business-x-api-key') apiKey: string
  ) {
    try {
      await this.validateBusinessApiKey(businessId, apiKey);
      return this.weatherService.disableProjectWeatherAlerts(businessId, projectId);
    } catch (error) {
      this.handleError(error, 'Failed to disable project weather alerts');
    }
  }

  @Post('trigger-check/:businessId')
  @ApiOperation({ summary: 'Manually trigger weather check for all projects' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiResponse({ status: 200, description: 'Weather check triggered successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async triggerWeatherCheck(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ) {
    try {
      await this.validateBusinessApiKey(businessId, apiKey);
      return this.weatherService.checkWeatherForBusinessProjects(businessId);
    } catch (error) {
      this.handleError(error, 'Failed to trigger weather check');
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

  private handleError(error: any, defaultMessage: string) {
    this.logger.error(`${defaultMessage}: ${error.message}`, error.stack);
    
    if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
      throw error;
    } else {
      throw new InternalServerErrorException(defaultMessage);
    }
  }

  @Get('current-weather/:businessId')
    @ApiOperation({ summary: 'Get current weather for a specific location' })
    @ApiParam({ name: 'businessId', description: 'Business ID' })
    @ApiQuery({ name: 'latitude', required: true, description: 'Location latitude' })
    @ApiQuery({ name: 'longitude', required: true, description: 'Location longitude' })
    @ApiResponse({ status: 200, description: 'Returns current weather data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    @ApiResponse({ status: 400, description: 'Bad request - Missing latitude or longitude' })
    async getCurrentWeather(
    @Param('businessId') businessId: string,
    @Query('latitude') latitude: string,
    @Query('longitude') longitude: string,
    @Headers('business-x-api-key') apiKey: string
    ) {
    try {
        await this.validateBusinessApiKey(businessId, apiKey);
        
        if (!latitude || !longitude) {
        throw new BadRequestException('Latitude and longitude are required');
        }
        
        return this.weatherService.getCurrentWeather(parseFloat(latitude), parseFloat(longitude));
    } catch (error) {
        this.handleError(error, 'Failed to get current weather');
    }
    }


    @Get('projects-with-sites/:businessId')
    @ApiOperation({ summary: 'Get projects associated with construction sites' })
    @ApiParam({ name: 'businessId', description: 'Business ID' })
    @ApiResponse({ status: 200, description: 'Returns projects with construction site information' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getProjectsWithConstructionSites(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
    ) {
    try {
        await this.validateBusinessApiKey(businessId, apiKey);
        return this.weatherService.getProjectsWithConstructionSites(businessId);
    } catch (error) {
        this.handleError(error, 'Failed to get projects with construction sites');
    }
    }
}