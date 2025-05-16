// src/services/weather.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { lastValueFrom } from 'rxjs';
import { NotificationService } from './saas-notification.service';
import { BusinessWeatherSettings } from '../schemas/business-weather-settings.schema';
import { ProjectWeatherSettings } from '../schemas/project-weather-settings.schema';
import { WeatherAlert, WeatherType, WeatherAlertSeverity } from '../schemas/weather-alert.schema';
import { AppProject } from '../schemas/app-project.schema';
import { BusinessWeatherSettingsDto, WeatherAlertConfigDto, ForecastResponseDto, ProjectAlertResponseDto } from '../dtos/business-weather.dto';
import { NotificationType, DeliveryChannel, NotificationPriority } from '../schemas/saas-notification.schema';

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly oneCallUrl: string;
  private readonly geocodingUrl: string;
  private readonly units: string;
  private readonly language: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    @InjectModel(BusinessWeatherSettings.name) private businessWeatherSettingsModel: Model<BusinessWeatherSettings>,
    @InjectModel(ProjectWeatherSettings.name) private projectWeatherSettingsModel: Model<ProjectWeatherSettings>,
    @InjectModel(WeatherAlert.name) private weatherAlertModel: Model<WeatherAlert>,
    @InjectModel(AppProject.name) private appProjectModel: Model<AppProject>
  ) {
    this.apiKey = this.configService.get<string>('weather.apiKey');
    this.baseUrl = this.configService.get<string>('weather.baseUrl');
    this.oneCallUrl = this.configService.get<string>('weather.oneCallUrl');
    this.geocodingUrl = this.configService.get<string>('weather.geocodingUrl');
    this.units = this.configService.get<string>('weather.units', 'metric');
    this.language = this.configService.get<string>('weather.language', 'en');
  }

  /**
   * Get current weather by coordinates
   */
  async getCurrentWeather(lat: number, lon: number) {
    try {
      const url = `${this.baseUrl}/weather`;
      const response = await lastValueFrom(
        this.httpService.get(url, {
          params: {
            lat,
            lon,
            appid: this.apiKey,
            units: this.units,
            lang: this.language
          }
        })
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Error fetching current weather: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get one call weather data (current, minutely, hourly, daily, alerts)
   */
  async getOneCallWeather(lat: number, lon: number) {
    try {
      const url = `${this.oneCallUrl}`;
      const response = await lastValueFrom(
        this.httpService.get(url, {
          params: {
            lat,
            lon,
            appid: this.apiKey,
            units: this.units,
            lang: this.language,
            exclude: 'minutely' // We can exclude minutely to reduce data size
          }
        })
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Error fetching one call weather: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Geocode address to coordinates
   */
  async geocodeAddress(address: string) {
    try {
      const url = `${this.geocodingUrl}/direct`;
      const response = await lastValueFrom(
        this.httpService.get(url, {
          params: {
            q: address,
            limit: 1,
            appid: this.apiKey
          }
        })
      );
      
      if (response.data && response.data.length > 0) {
        return {
          latitude: response.data[0].lat,
          longitude: response.data[0].lon,
          name: response.data[0].name,
          country: response.data[0].country,
          state: response.data[0].state
        };
      } else {
        throw new Error('Location not found');
      }
    } catch (error) {
      this.logger.error(`Error geocoding address: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get business weather settings
   */
  async getBusinessWeatherSettings(businessId: string): Promise<BusinessWeatherSettings> {
    try {
      let settings = await this.businessWeatherSettingsModel.findOne({ businessId });
      
      // Create default settings if none exists
      if (!settings) {
        settings = await this.businessWeatherSettingsModel.create({
          businessId,
          enableWeatherAlerts: true,
          appNotificationsEnabled: true,
          emailNotificationsEnabled: true,
          smsNotificationsEnabled: false,
          checkIntervalHours: 3,
          alertThresholds: [
            { type: WeatherType.RAIN, threshold: 15, enabled: true },
            { type: WeatherType.SNOW, threshold: 5, enabled: true },
            { type: WeatherType.WIND, threshold: 30, enabled: true },
            { type: WeatherType.STORM, threshold: 0, enabled: true },
            { type: WeatherType.HEAT, threshold: 35, enabled: true },
            { type: WeatherType.COLD, threshold: 0, enabled: true }
          ]
        });
      }
      
      return settings;
    } catch (error) {
      this.logger.error(`Error getting business weather settings: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update business weather settings
   */
  async updateBusinessWeatherSettings(
    businessId: string, 
    settingsDto: BusinessWeatherSettingsDto
  ): Promise<BusinessWeatherSettings> {
    try {
      let settings = await this.businessWeatherSettingsModel.findOne({ businessId });
      
      // Create settings if not exists
      if (!settings) {
        settings = await this.businessWeatherSettingsModel.create({
          businessId,
          ...settingsDto
        });
      } else {
        // Update existing settings
        Object.assign(settings, settingsDto);
        await settings.save();
      }
      
      return settings;
    } catch (error) {
      this.logger.error(`Error updating business weather settings: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get project weather forecast
   */
  async getProjectForecast(businessId: string, projectId: string): Promise<ForecastResponseDto> {
    try {
      // Get project details
      const project = await this.appProjectModel.findOne({ 
        _id: projectId,
        businessId 
      });
      
      if (!project) {
        throw new Error('Project not found');
      }
      
      // Check if project has location data
      if (!project.metadata?.location?.latitude || !project.metadata?.location?.longitude) {
        throw new Error('Project does not have location data');
      }
      
      const { latitude, longitude, address } = project.metadata.location;
      
      // Get weather forecast data
      const weatherData = await this.getOneCallWeather(latitude, longitude);
      
      return {
        projectId: project._id.toString(),
        projectName: project.name,
        current: weatherData.current,
        hourly: weatherData.hourly,
        daily: weatherData.daily,
        alerts: weatherData.alerts || [],
        location: {
          latitude,
          longitude,
          address
        }
      };
    } catch (error) {
      this.logger.error(`Error getting project forecast: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all projects forecasts for a business
   */
  async getAllProjectsForecasts(businessId: string): Promise<ForecastResponseDto[]> {
    try {
      // Get all active projects with location data
      const projects = await this.appProjectModel.find({
        businessId,
        'metadata.status': { $in: ['planning', 'in_progress'] },
        'metadata.location.latitude': { $exists: true },
        'metadata.location.longitude': { $exists: true }
      });
      
      const forecasts: ForecastResponseDto[] = [];
      
      // Process each project with delay to avoid API rate limiting
      for (const project of projects) {
        try {
          const forecast = await this.getProjectForecast(businessId, project._id.toString());
          forecasts.push(forecast);
          
          // Add a small delay between API calls
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          this.logger.error(`Error getting forecast for project ${project._id}: ${error.message}`);
        }
      }
      
      return forecasts;
    } catch (error) {
      this.logger.error(`Error getting all projects forecasts: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get project alerts
   */
  async getProjectAlerts(businessId: string, projectId: string): Promise<ProjectAlertResponseDto[]> {
    try {
      // Get active alerts for the project
      const alerts = await this.weatherAlertModel.find({
        businessId,
        affectedProjectIds: projectId,
        resolved: false
      }).sort({ startTime: 1 });
      
      return alerts.map(alert => this.mapAlertToResponseDto(alert));
    } catch (error) {
      this.logger.error(`Error getting project alerts: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all business alerts
   */
  async getAllBusinessAlerts(businessId: string): Promise<ProjectAlertResponseDto[]> {
    try {
      // Get all active alerts for the business
      const alerts = await this.weatherAlertModel.find({
        businessId,
        resolved: false
      }).sort({ startTime: 1 });
      
      return alerts.map(alert => this.mapAlertToResponseDto(alert));
    } catch (error) {
      this.logger.error(`Error getting all business alerts: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Configure project weather alerts
   */
  async configureProjectWeatherAlerts(
    businessId: string, 
    projectId: string, 
    config: WeatherAlertConfigDto
  ): Promise<ProjectWeatherSettings> {
    try {
      // Check if project exists
      const projectExists = await this.appProjectModel.exists({ 
        _id: projectId,
        businessId 
      });
      
      if (!projectExists) {
        throw new Error('Project not found');
      }
      
      // Find or create project settings
      let settings = await this.projectWeatherSettingsModel.findOne({
        businessId,
        projectId
      });
      
      if (!settings) {
        settings = await this.projectWeatherSettingsModel.create({
          businessId,
          projectId,
          ...config
        });
      } else {
        // Update existing settings
        Object.assign(settings, config);
        await settings.save();
      }
      
      return settings;
    } catch (error) {
      this.logger.error(`Error configuring project weather alerts: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Disable project weather alerts
   */
  async disableProjectWeatherAlerts(businessId: string, projectId: string): Promise<ProjectWeatherSettings> {
    try {
      const settings = await this.projectWeatherSettingsModel.findOneAndUpdate(
        { businessId, projectId },
        { 
          enableWeatherAlerts: false,
          useCustomSettings: true
        },
        { new: true, upsert: true }
      );
      
      return settings;
    } catch (error) {
      this.logger.error(`Error disabling project weather alerts: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Check weather for business projects
   */
  async checkWeatherForBusinessProjects(businessId: string): Promise<any> {
    try {
      // Get business settings
      const businessSettings = await this.getBusinessWeatherSettings(businessId);
      
      if (!businessSettings.enableWeatherAlerts) {
        return { message: 'Weather alerts are disabled for this business' };
      }
      
      // Get all active projects with location data
      const projects = await this.appProjectModel.find({
        businessId,
        'metadata.status': { $in: ['planning', 'in_progress'] },
        'metadata.location.latitude': { $exists: true },
        'metadata.location.longitude': { $exists: true }
      });
      
      const results = {
        businessId,
        projectsChecked: 0,
        alertsCreated: 0,
        projectResults: []
      };
      
      // Check each project
      for (const project of projects) {
        try {
          const alerts = await this.checkWeatherForProject(businessId, project._id.toString());
          
          results.projectsChecked++;
          results.alertsCreated += alerts.length;
          results.projectResults.push({
            projectId: project._id,
            projectName: project.name,
            alertsCreated: alerts.length
          });
          
          // Add a small delay between API calls
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          this.logger.error(`Error checking weather for project ${project._id}: ${error.message}`);
          results.projectResults.push({
            projectId: project._id,
            projectName: project.name,
            error: error.message
          });
        }
      }
      
      return results;
    } catch (error) {
      this.logger.error(`Error checking weather for business projects: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Check weather for a specific project
   */
  async checkWeatherForProject(businessId: string, projectId: string): Promise<WeatherAlert[]> {
    try {
      // Get project details
      const project = await this.appProjectModel.findOne({ 
        _id: projectId,
        businessId 
      });
      
      if (!project) {
        throw new Error('Project not found');
      }
      
      // Check if project has location data
      if (!project.metadata?.location?.latitude || !project.metadata?.location?.longitude) {
        throw new Error('Project does not have location data');
      }
      
      // Get business settings
      const businessSettings = await this.getBusinessWeatherSettings(businessId);
      
      if (!businessSettings.enableWeatherAlerts) {
        return [];
      }
      
      // Get project settings if any
      const projectSettings = await this.projectWeatherSettingsModel.findOne({
        businessId,
        projectId
      });
      
      // Skip if project has custom settings and alerts disabled
      if (projectSettings?.useCustomSettings && !projectSettings.enableWeatherAlerts) {
        return [];
      }
      
      // Use project settings if available and enabled, otherwise use business settings
      const useProjectSettings = projectSettings?.useCustomSettings && projectSettings.enableWeatherAlerts;
      const alertThresholds = useProjectSettings ? projectSettings.alertThresholds : businessSettings.alertThresholds;
      const notificationRecipients = useProjectSettings && projectSettings.notificationRecipients?.length > 0 ? 
        projectSettings.notificationRecipients : businessSettings.notificationRecipients;
      
      // Get weather data
      const { latitude, longitude } = project.metadata.location;
      const weatherData = await this.getOneCallWeather(latitude, longitude);
      
      // Check for weather conditions that exceed thresholds
      const newAlerts: WeatherAlert[] = [];
      
      // Check for external alerts from weather provider
      if (weatherData.alerts && weatherData.alerts.length > 0) {
        for (const externalAlert of weatherData.alerts) {
          // Map external alert to our schema
          if (await this.shouldCreateStormAlert(externalAlert, businessId, projectId, alertThresholds)) {
            const alert = await this.createWeatherAlert({
              businessId,
              projectId,
              title: externalAlert.event,
              description: externalAlert.description,
              weatherType: WeatherType.STORM,
              severity: this.mapExternalAlertSeverity(externalAlert.event),
              startTime: new Date(externalAlert.start * 1000),
              endTime: new Date(externalAlert.end * 1000),
              location: project.metadata.location,
              weatherData: externalAlert
            });
            
            newAlerts.push(alert);
            
            // Send notification
            await this.sendAlertNotification(alert, project, notificationRecipients, businessSettings);
          }
        }
      }
      
      // Check for rain
      const rainThreshold = alertThresholds.find(t => t.type === WeatherType.RAIN && t.enabled);
      if (rainThreshold) {
        const alert = await this.checkForRainAlert(weatherData, businessId, projectId, project, rainThreshold.threshold);
        if (alert) {
          newAlerts.push(alert);
          await this.sendAlertNotification(alert, project, notificationRecipients, businessSettings);
        }
      }
      
      // Check for snow
      const snowThreshold = alertThresholds.find(t => t.type === WeatherType.SNOW && t.enabled);
      if (snowThreshold) {
        const alert = await this.checkForSnowAlert(weatherData, businessId, projectId, project, snowThreshold.threshold);
        if (alert) {
          newAlerts.push(alert);
          await this.sendAlertNotification(alert, project, notificationRecipients, businessSettings);
        }
      }
      
      // Check for wind
      const windThreshold = alertThresholds.find(t => t.type === WeatherType.WIND && t.enabled);
      if (windThreshold) {
        const alert = await this.checkForWindAlert(weatherData, businessId, projectId, project, windThreshold.threshold);
        if (alert) {
          newAlerts.push(alert);
          await this.sendAlertNotification(alert, project, notificationRecipients, businessSettings);
        }
      }
      
      // Check for heat
      const heatThreshold = alertThresholds.find(t => t.type === WeatherType.HEAT && t.enabled);
      if (heatThreshold) {
        const alert = await this.checkForHeatAlert(weatherData, businessId, projectId, project, heatThreshold.threshold);
        if (alert) {
          newAlerts.push(alert);
          await this.sendAlertNotification(alert, project, notificationRecipients, businessSettings);
        }
      }
      
      // Check for cold
      const coldThreshold = alertThresholds.find(t => t.type === WeatherType.COLD && t.enabled);
      if (coldThreshold) {
        const alert = await this.checkForColdAlert(weatherData, businessId, projectId, project, coldThreshold.threshold);
        if (alert) {
          newAlerts.push(alert);
          await this.sendAlertNotification(alert, project, notificationRecipients, businessSettings);
        }
      }
      
      return newAlerts;
    } catch (error) {
      this.logger.error(`Error checking weather for project: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Check if storm alert should be created (avoids duplicates)
   */
  private async shouldCreateStormAlert(
    externalAlert: any, 
    businessId: string, 
    projectId: string,
    alertThresholds: any[]
  ): Promise<boolean> {
    try {
      // Check if storm alerts are enabled
      const stormThreshold = alertThresholds.find(t => t.type === WeatherType.STORM && t.enabled);
      if (!stormThreshold) {
        return false;
      }
      
      // Check if a similar alert already exists
      const existingAlert = await this.weatherAlertModel.findOne({
        businessId,
        affectedProjectIds: projectId,
        weatherType: WeatherType.STORM,
        title: externalAlert.event,
        startTime: new Date(externalAlert.start * 1000),
        endTime: new Date(externalAlert.end * 1000),
        resolved: false
      });
      
      return !existingAlert;
    } catch (error) {
      this.logger.error(`Error checking if storm alert should be created: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Map external alert severity to our schema
   */
  private mapExternalAlertSeverity(eventType: string): WeatherAlertSeverity {
    eventType = eventType.toLowerCase();
    
    if (eventType.includes('warning')) {
      return WeatherAlertSeverity.WARNING;
    } else if (eventType.includes('watch')) {
      return WeatherAlertSeverity.WATCH;
    } else if (eventType.includes('emergency')) {
      return WeatherAlertSeverity.EMERGENCY;
    } else {
      return WeatherAlertSeverity.ADVISORY;
    }
  }

  /**
   * Check for rain alert
   */
  private async checkForRainAlert(
    weatherData: any, 
    businessId: string, 
    projectId: string, 
    project: any, 
    threshold: number
  ): Promise<WeatherAlert | null> {
    try {
      // Check daily forecast for rain
      for (let i = 0; i < 3; i++) { // Check next 3 days
        const dailyData = weatherData.daily[i];
        
        if (dailyData.rain && dailyData.rain >= threshold) {
          // Check if a similar alert already exists
          const existingAlert = await this.weatherAlertModel.findOne({
            businessId,
            affectedProjectIds: projectId,
            weatherType: WeatherType.RAIN,
            startTime: { $lte: new Date(dailyData.dt * 1000) },
            endTime: { $gte: new Date(dailyData.dt * 1000) },
            resolved: false
          });
          
          if (!existingAlert) {
            // Create a new alert
            const startTime = new Date(dailyData.dt * 1000);
            const endTime = new Date(startTime);
            endTime.setHours(23, 59, 59); // End of day
            
            const alert = await this.createWeatherAlert({
              businessId,
              projectId,
              title: `Heavy Rain Alert`,
              description: `Heavy rain expected with ${dailyData.rain}mm precipitation forecasted for ${startTime.toLocaleDateString()}.`,
              weatherType: WeatherType.RAIN,
              severity: this.determinePrecipitationSeverity(dailyData.rain, threshold),
              startTime,
              endTime,
              location: project.metadata.location,
              weatherData: dailyData
            });
            
            return alert;
          }
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Error checking for rain alert: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Check for snow alert
   */
  private async checkForSnowAlert(
    weatherData: any, 
    businessId: string, 
    projectId: string, 
    project: any, 
    threshold: number
  ): Promise<WeatherAlert | null> {
    try {
      // Check daily forecast for snow
      for (let i = 0; i < 3; i++) { // Check next 3 days
        const dailyData = weatherData.daily[i];
        
        if (dailyData.snow && dailyData.snow >= threshold) {
          // Check if a similar alert already exists
          const existingAlert = await this.weatherAlertModel.findOne({
            businessId,
            affectedProjectIds: projectId,
            weatherType: WeatherType.SNOW,
            startTime: { $lte: new Date(dailyData.dt * 1000) },
            endTime: { $gte: new Date(dailyData.dt * 1000) },
            resolved: false
          });
          
          if (!existingAlert) {
            // Create a new alert
            const startTime = new Date(dailyData.dt * 1000);
            const endTime = new Date(startTime);
            endTime.setHours(23, 59, 59); // End of day
            
            const alert = await this.createWeatherAlert({
              businessId,
              projectId,
              title: `Snow Alert`,
              description: `Significant snowfall expected with ${dailyData.snow}cm accumulation forecasted for ${startTime.toLocaleDateString()}.`,
              weatherType: WeatherType.SNOW,
              severity: this.determinePrecipitationSeverity(dailyData.snow, threshold),
              startTime,
              endTime,
              location: project.metadata.location,
              weatherData: dailyData
            });
            
            return alert;
          }
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Error checking for snow alert: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Check for wind alert
   */
  private async checkForWindAlert(
    weatherData: any, 
    businessId: string, 
    projectId: string, 
    project: any, 
    threshold: number
  ): Promise<WeatherAlert | null> {
    try {
      // Check daily forecast for high winds
      for (let i = 0; i < 3; i++) { // Check next 3 days
        const dailyData = weatherData.daily[i];
        
        if (dailyData.wind_speed >= threshold) {
          // Check if a similar alert already exists
          const existingAlert = await this.weatherAlertModel.findOne({
            businessId,
            affectedProjectIds: projectId,
            weatherType: WeatherType.WIND,
            startTime: { $lte: new Date(dailyData.dt * 1000) },
            endTime: { $gte: new Date(dailyData.dt * 1000) },
            resolved: false
          });
          
          if (!existingAlert) {
            // Create a new alert
            const startTime = new Date(dailyData.dt * 1000);
            const endTime = new Date(startTime);
            endTime.setHours(23, 59, 59); // End of day
            
            const windSpeed = this.units === 'metric' ? dailyData.wind_speed : dailyData.wind_speed * 1.60934; // Convert to km/h if imperial
            
            const alert = await this.createWeatherAlert({
              businessId,
              projectId,
              title: `High Wind Alert`,
              description: `Strong winds expected with speeds up to ${windSpeed.toFixed(1)} km/h on ${startTime.toLocaleDateString()}.`,
              weatherType: WeatherType.WIND,
              severity: this.determineWindSeverity(windSpeed, threshold),
              startTime,
              endTime,
              location: project.metadata.location,
              weatherData: dailyData
            });
            
            return alert;
          }
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Error checking for wind alert: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Check for heat alert
   */
  private async checkForHeatAlert(
    weatherData: any, 
    businessId: string, 
    projectId: string, 
    project: any, 
    threshold: number
  ): Promise<WeatherAlert | null> {
    try {
      // Check daily forecast for extreme heat
      for (let i = 0; i < 3; i++) { // Check next 3 days
        const dailyData = weatherData.daily[i];
        const maxTemp = dailyData.temp.max;
        
        if (maxTemp >= threshold) {
          // Check if a similar alert already exists
          const existingAlert = await this.weatherAlertModel.findOne({
            businessId,
            affectedProjectIds: projectId,
            weatherType: WeatherType.HEAT,
            startTime: { $lte: new Date(dailyData.dt * 1000) },
            endTime: { $gte: new Date(dailyData.dt * 1000) },
            resolved: false
          });
          
          if (!existingAlert) {
            // Create a new alert
            const startTime = new Date(dailyData.dt * 1000);
            const endTime = new Date(startTime);
            endTime.setHours(23, 59, 59); // End of day
            
            const tempUnit = this.units === 'metric' ? '°C' : '°F';
            
            const alert = await this.createWeatherAlert({
              businessId,
              projectId,
              title: `Extreme Heat Alert`,
              description: `High temperatures expected to reach ${maxTemp.toFixed(1)}${tempUnit} on ${startTime.toLocaleDateString()}.`,
              weatherType: WeatherType.HEAT,
              severity: this.determineTemperatureSeverity(maxTemp, threshold),
              startTime,
              endTime,
              location: project.metadata.location,
              weatherData: dailyData
            });
            
            return alert;
          }
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Error checking for heat alert: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Check for cold alert
   */
  private async checkForColdAlert(
    weatherData: any, 
    businessId: string, 
    projectId: string, 
    project: any, 
    threshold: number
  ): Promise<WeatherAlert | null> {
    try {
      // Check daily forecast for extreme cold
      for (let i = 0; i < 3; i++) { // Check next 3 days
        const dailyData = weatherData.daily[i];
        const minTemp = dailyData.temp.min;
        
        if (minTemp <= threshold) {
          // Check if a similar alert already exists
          const existingAlert = await this.weatherAlertModel.findOne({
            businessId,
            affectedProjectIds: projectId,
            weatherType: WeatherType.COLD,
            startTime: { $lte: new Date(dailyData.dt * 1000) },
            endTime: { $gte: new Date(dailyData.dt * 1000) },
            resolved: false
          });
          
          if (!existingAlert) {
            // Create a new alert
            const startTime = new Date(dailyData.dt * 1000);
            const endTime = new Date(startTime);
            endTime.setHours(23, 59, 59); // End of day
            
            const tempUnit = this.units === 'metric' ? '°C' : '°F';
            
            const alert = await this.createWeatherAlert({
              businessId,
              projectId,
              title: `Cold Temperature Alert`,
              description: `Low temperatures expected to reach ${minTemp.toFixed(1)}${tempUnit} on ${startTime.toLocaleDateString()}.`,
              weatherType: WeatherType.COLD,
              severity: this.determineTemperatureSeverity(Math.abs(minTemp), threshold),
              startTime,
              endTime,
              location: project.metadata.location,
              weatherData: dailyData
            });
            
            return alert;
          }
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Error checking for cold alert: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Determine precipitation severity based on amount
   */
  private determinePrecipitationSeverity(amount: number, threshold: number): WeatherAlertSeverity {
    if (amount >= threshold * 2) {
      return WeatherAlertSeverity.WARNING;
    } else if (amount >= threshold * 1.5) {
      return WeatherAlertSeverity.WATCH;
    } else {
      return WeatherAlertSeverity.ADVISORY;
    }
  }

  /**
   * Determine wind severity based on speed
   */
  private determineWindSeverity(speed: number, threshold: number): WeatherAlertSeverity {
    if (speed >= threshold * 1.5) {
      return WeatherAlertSeverity.WARNING;
    } else if (speed >= threshold * 1.2) {
      return WeatherAlertSeverity.WATCH;
    } else {
      return WeatherAlertSeverity.ADVISORY;
    }
  }

  /**
   * Determine temperature severity (for heat or cold)
   */
  private determineTemperatureSeverity(value: number, threshold: number): WeatherAlertSeverity {
    if (value >= threshold * 1.2) {
      return WeatherAlertSeverity.WARNING;
    } else if (value >= threshold * 1.1) {
      return WeatherAlertSeverity.WATCH;
    } else {
      return WeatherAlertSeverity.ADVISORY;
    }
  }

  /**
   * Create a weather alert
   */
  private async createWeatherAlert(params: {
    businessId: string,
    projectId: string,
    title: string,
    description: string,
    weatherType: WeatherType,
    severity: WeatherAlertSeverity,
    startTime: Date,
    endTime: Date,
    location: any,
    weatherData: any
  }): Promise<WeatherAlert> {
    try {
      const alert = new this.weatherAlertModel({
        businessId: params.businessId,
        title: params.title,
        description: params.description,
        weatherType: params.weatherType,
        severity: params.severity,
        startTime: params.startTime,
        endTime: params.endTime,
        location: params.location,
        affectedProjectIds: [params.projectId],
        weatherData: params.weatherData,
        resolved: false
      });
      
      await alert.save();
      return alert;
    } catch (error) {
      this.logger.error(`Error creating weather alert: ${error.message}`, error.stack);
      throw error;
    }
  }

 /**
   * Send alert notification
   */
 private async sendAlertNotification(
    alert: WeatherAlert, 
    project: any, 
    recipientIds: string[],
    businessSettings: BusinessWeatherSettings
  ): Promise<void> {
    try {
      if (!recipientIds || recipientIds.length === 0) {
        this.logger.warn(`No recipients configured for weather alerts for business ${alert.businessId}`);
        return;
      }
      
      // Determine which channels to use
      const channels: DeliveryChannel[] = [];
      if (businessSettings.appNotificationsEnabled) {
        channels.push(DeliveryChannel.APP);
      }
      if (businessSettings.emailNotificationsEnabled) {
        channels.push(DeliveryChannel.EMAIL);
      }
      if (businessSettings.smsNotificationsEnabled) {
        channels.push(DeliveryChannel.SMS);
      }
      
      if (channels.length === 0) {
        this.logger.warn(`No notification channels enabled for business ${alert.businessId}`);
        return;
      }
      
      // Create action data
      const actionData = {
        type: 'project_weather',
        entityId: project._id,
        entityType: 'project',
        url: `/projects/${project._id}/weather`
      };
      
      // Create notification for each recipient
      const notificationPromises = recipientIds.map(userId => 
        this.notificationService.createNotification({
          businessId: alert.businessId,
          userId,
          title: alert.title,
          body: alert.description,
          type: NotificationType.WEATHER,
          priority: this.mapAlertSeverityToPriority(alert.severity),
          channels,
          reference: {
            type: 'weather_alert',
            id: alert._id.toString()
          },
          actionData
        })
      );
      
      const notifications = await Promise.all(notificationPromises);
      
      // Update alert with notification IDs - fixed type assertion
      alert.notificationIds = notifications.map(n => n._id.toString());
      await alert.save();
    } catch (error) {
      this.logger.error(`Error sending alert notification: ${error.message}`, error.stack);
    }
  }

  /**
   * Map alert severity to notification priority
   */
  private mapAlertSeverityToPriority(severity: WeatherAlertSeverity): NotificationPriority {
    switch (severity) {
      case WeatherAlertSeverity.EMERGENCY:
        return NotificationPriority.URGENT;
      case WeatherAlertSeverity.WARNING:
        return NotificationPriority.HIGH;
      case WeatherAlertSeverity.WATCH:
        return NotificationPriority.MEDIUM;
      default:
        return NotificationPriority.LOW;
    }
  }

  /**
   * Map WeatherAlert to ProjectAlertResponseDto
   */
  private mapAlertToResponseDto(alert: WeatherAlert): ProjectAlertResponseDto {
    return {
      id: alert._id.toString(),
      title: alert.title,
      description: alert.description,
      weatherType: alert.weatherType,
      severity: alert.severity,
      startTime: alert.startTime,
      endTime: alert.endTime,
      affectedProjects: [], // This should be populated by joining with AppProject data
      location: alert.location
    };
  }
}