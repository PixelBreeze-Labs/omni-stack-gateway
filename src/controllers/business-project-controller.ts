// src/controllers/business-project-weather.controller.ts
import { Controller, Get, Post, Body, Param, Headers, UnauthorizedException, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger';
import { BusinessService } from '../services/business.service';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { AppProject } from '../schemas/app-project.schema';
import { WeatherAlert } from '../schemas/weather-alert.schema';
import { AddWeatherDelayDto, ProjectWeatherDetailsDto } from '../dtos/project-weather.dto';

@ApiTags('Business Project Weather')
@Controller('business-project')
@ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
export class BusinessProjectWeatherController {
  private readonly logger = new Logger(BusinessProjectWeatherController.name);

  constructor(
    private readonly businessService: BusinessService,
    @InjectModel(AppProject.name) private appProjectModel: Model<AppProject>,
    @InjectModel(WeatherAlert.name) private weatherAlertModel: Model<WeatherAlert>
  ) {}

  @Post('weather-delay/:businessId/project/:projectId')
  @ApiOperation({ summary: 'Add a weather-related delay to a project' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiBody({ type: AddWeatherDelayDto })
  @ApiResponse({ status: 200, description: 'Delay added successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or project not found' })
  async addWeatherDelay(
    @Param('businessId') businessId: string,
    @Param('projectId') projectId: string,
    @Body() delayData: AddWeatherDelayDto,
    @Headers('business-x-api-key') apiKey: string
  ) {
    try {
      await this.validateBusinessApiKey(businessId, apiKey);
      
      // Validate project exists and belongs to the business
      const project = await this.appProjectModel.findOne({
        _id: projectId,
        businessId,
        isDeleted: false
      });
      
      if (!project) {
        throw new NotFoundException('Project not found');
      }
      
      // Initialize weather delays array if it doesn't exist
      if (!project.metadata.weatherDelays) {
        project.metadata.weatherDelays = [];
      }
      
      // Add new delay to project
      project.metadata.weatherDelays.push({
        date: delayData.date,
        hours: delayData.delayHours,
        reason: delayData.reason,
        weatherType: delayData.weatherType,
        notes: delayData.notes || '',
        createdAt: new Date()
      });
      
      // Update total delay hours if needed
      if (!project.metadata.totalWeatherDelayHours) {
        project.metadata.totalWeatherDelayHours = 0;
      }
      project.metadata.totalWeatherDelayHours += delayData.delayHours;
      
      // Save project
      await project.save();
      
      return {
        success: true,
        message: 'Weather delay added successfully',
        delay: {
          date: delayData.date,
          hours: delayData.delayHours,
          reason: delayData.reason,
          weatherType: delayData.weatherType
        },
        totalDelayHours: project.metadata.totalWeatherDelayHours
      };
    } catch (error) {
      this.handleError(error, 'Failed to add weather delay');
    }
  }

  @Get('weather-details/:businessId/project/:projectId')
  @ApiOperation({ summary: 'Get weather-related details for a project' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Returns project weather details' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or project not found' })
  async getProjectWeatherDetails(
    @Param('businessId') businessId: string,
    @Param('projectId') projectId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<ProjectWeatherDetailsDto> {
    try {
      await this.validateBusinessApiKey(businessId, apiKey);
      
      // Get project
      const project = await this.appProjectModel.findOne({
        _id: projectId,
        businessId,
        isDeleted: false
      });
      
      if (!project) {
        throw new NotFoundException('Project not found');
      }
      
      // Get active alerts for the project
      const activeAlerts = await this.weatherAlertModel.find({
        businessId,
        affectedProjectIds: projectId,
        resolved: false
      }).sort({ startTime: -1 });
      
      // Format response
      const response: ProjectWeatherDetailsDto = {
        projectId: project._id.toString(),
        projectName: project.name,
        activeAlertsCount: activeAlerts.length,
        totalDelayHours: project.metadata.totalWeatherDelayHours || 0,
        
        // Get recent delays (last 5)
        recentDelays: (project.metadata.weatherDelays || [])
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 5)
          .map(delay => ({
            date: delay.date,
            hours: delay.hours,
            reason: delay.reason,
            weatherType: delay.weatherType
          })),
        
        // Format weather alerts
        weatherAlerts: activeAlerts.map(alert => ({
          id: alert._id.toString(),
          title: alert.title,
          severity: alert.severity,
          startTime: alert.startTime,
          endTime: alert.endTime,
          weatherType: alert.weatherType,
          resolved: alert.resolved
        }))
      };
      
      return response;
    } catch (error) {
      this.handleError(error, 'Failed to get project weather details');
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
}