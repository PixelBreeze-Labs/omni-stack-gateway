// src/services/weather.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { lastValueFrom } from 'rxjs';
import { SaasNotificationService } from './saas-notification.service';
import { BusinessWeatherSettings } from '../schemas/business-weather-settings.schema';
import { ProjectWeatherSettings } from '../schemas/project-weather-settings.schema';
import { WeatherAlert, WeatherType, WeatherAlertSeverity } from '../schemas/weather-alert.schema';
import { AppProject } from '../schemas/app-project.schema';
import { BusinessWeatherSettingsDto, WeatherAlertConfigDto, ForecastResponseDto, ProjectAlertResponseDto } from '../dtos/business-weather.dto';
import { NotificationType, DeliveryChannel, NotificationPriority } from '../schemas/saas-notification.schema';
import { EmailService } from './email.service';
import * as twilio from 'twilio';
import { Business } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import { ConstructionSite } from '../schemas/construction-site.schema';

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly oneCallUrl: string;
  private readonly geocodingUrl: string;
  private readonly units: string;
  private readonly language: string;
   private twilioClient: any;
   private twilioVerifyServiceSid: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly notificationService: SaasNotificationService,
    @InjectModel(BusinessWeatherSettings.name) private businessWeatherSettingsModel: Model<BusinessWeatherSettings>,
    @InjectModel(ProjectWeatherSettings.name) private projectWeatherSettingsModel: Model<ProjectWeatherSettings>,
    @InjectModel(WeatherAlert.name) private weatherAlertModel: Model<WeatherAlert>,
    @InjectModel(AppProject.name) private appProjectModel: Model<AppProject>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(ConstructionSite.name) private constructionSiteModel: Model<ConstructionSite>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly emailService?: EmailService
  ) {
    this.apiKey = this.configService.get<string>('weather.apiKey');
    this.baseUrl = this.configService.get<string>('weather.baseUrl');
    this.oneCallUrl = this.configService.get<string>('weather.oneCallUrl');
    this.geocodingUrl = this.configService.get<string>('weather.geocodingUrl');
    this.units = this.configService.get<string>('weather.units', 'metric');
    this.language = this.configService.get<string>('weather.language', 'en');
    
    // Optional Twilio setup
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.twilioVerifyServiceSid = this.configService.get<string>('TWILIO_VERIFY_SERVICE_SID');
    
    // Only create Twilio client if all required config is present
    if (accountSid && authToken) {
      try {
        this.twilioClient = twilio(accountSid, authToken);
      } catch (error) {
        this.logger.warn('Failed to initialize Twilio client: ' + error.message);
      }
    }
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
      
      let locationData;
      let locationSource = 'project';
      
      // 1. First check if project has location data
      if (project.metadata?.location?.latitude && project.metadata?.location?.longitude) {
        // Validate coordinates
        const validation = this.validateLocationCoordinates(
          project.metadata.location.latitude,
          project.metadata.location.longitude
        );
        
        if (validation.valid) {
          locationData = project.metadata.location;
          this.logger.log(`Using project's own location data for project ${projectId}`);
        } else {
          this.logger.warn(`Project ${projectId} has invalid coordinates: ${validation.error}`);
          // Try to use construction site data instead
        }
      } 
      
      // 2. If no valid project location, check if project has associated construction site with location
      if (!locationData) {
        // Find construction site for this project
        const site = await this.constructionSiteModel.findOne({
          businessId,
          appProjectId: projectId,
          isDeleted: false,
          'location.latitude': { $exists: true, $ne: null },
          'location.longitude': { $exists: true, $ne: null }
        });
        
        if (site && site.location?.latitude && site.location?.longitude) {
          // Validate coordinates
          const validation = this.validateLocationCoordinates(
            site.location.latitude,
            site.location.longitude
          );
          
          if (validation.valid) {
            locationData = {
              latitude: site.location.latitude,
              longitude: site.location.longitude,
              address: site.location.address
            };
            locationSource = 'construction_site';
            this.logger.log(`Using construction site's location data for project ${projectId}`);
          } else {
            this.logger.warn(`Construction site for project ${projectId} has invalid coordinates: ${validation.error}`);
            throw new Error('Project and associated construction site have invalid location data');
          }
        } else {
          throw new Error('Project does not have location data and no associated construction site with location data was found');
        }
      }
      
      // Get weather forecast data
      const weatherData = await this.getOneCallWeather(
        parseFloat(locationData.latitude), 
        parseFloat(locationData.longitude)
      );
      
      return {
        projectId: project._id.toString(),
        projectName: project.name,
        current: weatherData.current,
        hourly: weatherData.hourly,
        daily: weatherData.daily,
        alerts: weatherData.alerts || [],
        location: locationData,
        locationSource: locationSource
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
      // Get all active projects regardless of location data
      const activeProjects = await this.appProjectModel.find({
        businessId,
        'metadata.status': { $in: ['planning', 'in_progress'] }
      });
      
      // Get projects that have construction sites with location data
      const sitesWithLocation = await this.constructionSiteModel.find({
        businessId,
        isDeleted: false,
        'location.latitude': { $exists: true, $ne: null },
        'location.longitude': { $exists: true, $ne: null }
      });
      
      // Create a map of project IDs to site data for projects that have construction sites with location
      const projectsWithSiteLocation = new Map();
      sitesWithLocation.forEach(site => {
        if (site.appProjectId) {
          // Only add if the coordinates are valid
          const validation = this.validateLocationCoordinates(site.location.latitude, site.location.longitude);
          if (validation.valid) {
            projectsWithSiteLocation.set(site.appProjectId.toString(), {
              siteId: site._id,
              location: site.location
            });
          } else {
            this.logger.warn(`Construction site ${site._id} for project ${site.appProjectId} has invalid coordinates: ${validation.error}`);
          }
        }
      });
      
      // Filter projects to include those with valid location data
      const eligibleProjects = activeProjects.filter(project => {
        // Check if project has its own valid location data
        if (project.metadata?.location?.latitude && project.metadata?.location?.longitude) {
          const validation = this.validateLocationCoordinates(
            project.metadata.location.latitude, 
            project.metadata.location.longitude
          );
          if (validation.valid) {
            return true;
          }
          this.logger.warn(`Project ${project._id} has invalid coordinates: ${validation.error}`);
        }
        
        // Check if project has an associated construction site with valid location
        return projectsWithSiteLocation.has(project._id.toString());
      });
      
      this.logger.log(`Found ${eligibleProjects.length} projects eligible for weather forecasts (out of ${activeProjects.length} active projects)`);
      
      const forecasts: ForecastResponseDto[] = [];
      
      // Process each eligible project with delay to avoid API rate limiting
      for (const project of eligibleProjects) {
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
      
      // Use Promise.all to wait for all async mapping operations to complete
      return await Promise.all(alerts.map(alert => this.mapAlertToResponseDto(alert)));
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
      
      // Use Promise.all to wait for all async mapping operations to complete
      return await Promise.all(alerts.map(alert => this.mapAlertToResponseDto(alert)));
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
      
      // Get all active projects regardless of location data
      const projects = await this.appProjectModel.find({
        businessId,
        'metadata.status': { $in: ['planning', 'in_progress'] }
      });
      
      const results = {
        businessId,
        projectsChecked: 0,
        alertsCreated: 0,
        projectResults: []
      };
      
      // For each project
      for (const project of projects) {
        try {
          const projectId = project._id.toString();
          let hasLocation = false;
          let latitude, longitude, address;
          let locationSource = 'project'; // Default location source
          
          // Save the original location reference to determine source later
          const originalLocation = project.metadata?.location;
          
          // 1. First check if project has location data
          if (project.metadata?.location?.latitude && project.metadata?.location?.longitude) {
            // Validate coordinates
            const validation = this.validateLocationCoordinates(
              project.metadata.location.latitude,
              project.metadata.location.longitude
            );
            
            if (validation.valid) {
              hasLocation = true;
              latitude = project.metadata.location.latitude;
              longitude = project.metadata.location.longitude;
              address = project.metadata.location.address;
              this.logger.log(`Using project's own location data for project ${projectId}`);
            } else {
              this.logger.warn(`Project ${projectId} has invalid coordinates: ${validation.error}`);
            }
          } 
          // 2. If not, check if project has associated construction site with location
          if (!hasLocation) {
            // Find construction site for this project
            const site = await this.constructionSiteModel.findOne({
              businessId,
              appProjectId: projectId,
              isDeleted: false,
              'location.latitude': { $exists: true, $ne: null },
              'location.longitude': { $exists: true, $ne: null }
            });
            
            if (site && site.location?.latitude && site.location?.longitude) {
              // Validate coordinates
              const validation = this.validateLocationCoordinates(
                site.location.latitude,
                site.location.longitude
              );
              
              if (validation.valid) {
                hasLocation = true;
                latitude = site.location.latitude.toString();
                longitude = site.location.longitude.toString();
                address = site.location.address;
                locationSource = 'construction_site'; // Set location source to construction site
                this.logger.log(`Using construction site's location data for project ${projectId}`);
                
                // Temporarily update project with site's location data
                project.metadata = project.metadata || {};
                project.metadata.location = {
                  latitude,
                  longitude,
                  address
                };
              } else {
                this.logger.warn(`Construction site for project ${projectId} has invalid coordinates: ${validation.error}`);
              }
            }
          }
          
          // If we have location data from either source, check weather
          if (hasLocation) {
            const alerts = await this.checkWeatherForProject(businessId, projectId);
            
            results.projectsChecked++;
            results.alertsCreated += alerts.length;
            results.projectResults.push({
              projectId,
              projectName: project.name,
              alertsCreated: alerts.length,
              hasLocation: true,
              locationSource // Use the location source we determined
            });
          } else {
            // No valid location data available
            this.logger.warn(`No valid location data available for project ${projectId}`);
            results.projectResults.push({
              projectId,
              projectName: project.name,
              alertsCreated: 0,
              hasLocation: false,
              error: 'No valid location data available for this project or its construction sites'
            });
          }
          
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
      
      let locationData;
      
      // 1. First check if project has location data
      if (project.metadata?.location?.latitude && project.metadata?.location?.longitude) {
        // Validate coordinates
        const validation = this.validateLocationCoordinates(
          project.metadata.location.latitude,
          project.metadata.location.longitude
        );
        
        if (validation.valid) {
          locationData = project.metadata.location;
          this.logger.log(`Using project's own location data for project ${projectId}`);
        } else {
          this.logger.warn(`Project ${projectId} has invalid coordinates: ${validation.error}`);
          // Try to use construction site data instead
        }
      } 
      
      // 2. If no valid project location, check if project has associated construction site with location
      if (!locationData) {
        // Find construction site for this project
        const site = await this.constructionSiteModel.findOne({
          businessId,
          appProjectId: projectId,
          isDeleted: false,
          'location.latitude': { $exists: true, $ne: null },
          'location.longitude': { $exists: true, $ne: null }
        });
        
        if (site && site.location?.latitude && site.location?.longitude) {
          // Validate coordinates
          const validation = this.validateLocationCoordinates(
            site.location.latitude,
            site.location.longitude
          );
          
          if (validation.valid) {
            locationData = {
              latitude: site.location.latitude,
              longitude: site.location.longitude,
              address: site.location.address
            };
            this.logger.log(`Using construction site's location data for project ${projectId}`);
          } else {
            this.logger.warn(`Construction site for project ${projectId} has invalid coordinates: ${validation.error}`);
            throw new Error('Project and associated construction site have invalid location data');
          }
        } else {
          throw new Error('Project does not have location data and no associated construction site with location data was found');
        }
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

    const emailNotificationRecipients = useProjectSettings && projectSettings.emailNotificationRecipients?.length > 0 ? 
        projectSettings.emailNotificationRecipients : businessSettings.emailNotificationRecipients;
        
    const smsNotificationRecipients = useProjectSettings && projectSettings.smsNotificationRecipients?.length > 0 ? 
        projectSettings.smsNotificationRecipients : businessSettings.smsNotificationRecipients;
            
        // Get weather data
        const { latitude, longitude } = locationData;
        const weatherData = await this.getOneCallWeather(parseFloat(latitude), parseFloat(longitude));
        
        // Prepare a project object that includes location data for alert creation
        const projectWithLocation = { ...project.toObject() };
        projectWithLocation.metadata = projectWithLocation.metadata || {};
        projectWithLocation.metadata.location = locationData;
        
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
                location: locationData,
                weatherData: externalAlert
            });
            
            newAlerts.push(alert);
            
            // Send notification
            await this.sendAlertNotification(alert, projectWithLocation, notificationRecipients, businessSettings, emailNotificationRecipients, smsNotificationRecipients);
            }
        }
        }
      
      // Check for rain
      const rainThreshold = alertThresholds.find(t => t.type === WeatherType.RAIN && t.enabled);
      if (rainThreshold) {
        const alert = await this.checkForRainAlert(weatherData, businessId, projectId, project, rainThreshold.threshold);
        if (alert) {
            newAlerts.push(alert);
            await this.sendAlertNotification(alert, project, notificationRecipients, businessSettings, emailNotificationRecipients, smsNotificationRecipients);
          }
      }
      
      // Check for snow
      const snowThreshold = alertThresholds.find(t => t.type === WeatherType.SNOW && t.enabled);
      if (snowThreshold) {
        const alert = await this.checkForSnowAlert(weatherData, businessId, projectId, project, snowThreshold.threshold);
        if (alert) {
            newAlerts.push(alert);
            await this.sendAlertNotification(alert, project, notificationRecipients, businessSettings, emailNotificationRecipients, smsNotificationRecipients);
          }
      }
      
      // Check for wind
      const windThreshold = alertThresholds.find(t => t.type === WeatherType.WIND && t.enabled);
      if (windThreshold) {
        const alert = await this.checkForWindAlert(weatherData, businessId, projectId, project, windThreshold.threshold);
        if (alert) {
            newAlerts.push(alert);
            await this.sendAlertNotification(alert, project, notificationRecipients, businessSettings, emailNotificationRecipients, smsNotificationRecipients);
          }
      }
      
      // Check for heat
      const heatThreshold = alertThresholds.find(t => t.type === WeatherType.HEAT && t.enabled);
      if (heatThreshold) {
        const alert = await this.checkForHeatAlert(weatherData, businessId, projectId, project, heatThreshold.threshold);
        if (alert) {
            newAlerts.push(alert);
            await this.sendAlertNotification(alert, project, notificationRecipients, businessSettings, emailNotificationRecipients, smsNotificationRecipients);
          }
      }
      
      // Check for cold
      const coldThreshold = alertThresholds.find(t => t.type === WeatherType.COLD && t.enabled);
      if (coldThreshold) {
        const alert = await this.checkForColdAlert(weatherData, businessId, projectId, project, coldThreshold.threshold);
        if (alert) {
            newAlerts.push(alert);
            await this.sendAlertNotification(alert, project, notificationRecipients, businessSettings, emailNotificationRecipients, smsNotificationRecipients);
          }
      }
      
      // Process all the weather checks and return the alerts
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
    businessSettings: BusinessWeatherSettings,
    emailNotificationRecipients?: string[],
    smsNotificationRecipients?: string[]
  ): Promise<void> {
    try {
      // Get business name for notifications
      const business = await this.businessModel.findById(alert.businessId);
      const businessName = business ? business.name : "Your Business";
      
      // Determine which channels to use based on business settings
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
      
      // For tracking notifications sent
      const notificationIds: string[] = [];
      
      // 1. Process in-app notifications using recipientIds (users)
      if (channels.includes(DeliveryChannel.APP) && recipientIds && recipientIds.length > 0) {
        // Get all users for sending notifications
        const users = await this.userModel.find({
          _id: { $in: recipientIds }
        });
        
        for (const user of users) {
          const notification = await this.notificationService.createNotification({
            businessId: alert.businessId,
            userId: user._id.toString(),
            title: alert.title,
            body: alert.description,
            type: NotificationType.WEATHER,
            priority: this.mapAlertSeverityToPriority(alert.severity),
            channels: [DeliveryChannel.APP],
            reference: {
              type: 'weather_alert',
              id: alert._id.toString()
            },
            actionData
          });
          
          if (notification && notification._id) {
            notificationIds.push(notification._id.toString());
          }
        }
      } else if (channels.includes(DeliveryChannel.APP)) {
        this.logger.warn(`No app notification recipients configured for business ${alert.businessId}`);
      }
      
      // 2. Process email notifications
      if (channels.includes(DeliveryChannel.EMAIL)) {
        // First check if project-specific email recipients are provided
        if (emailNotificationRecipients && emailNotificationRecipients.length > 0) {
          for (const email of emailNotificationRecipients) {
            await this.sendWeatherAlertEmail({email}, businessName, project.name, alert);
          }
        }
        // If not, check if business has email recipients configured
        else if (businessSettings.emailNotificationRecipients && businessSettings.emailNotificationRecipients.length > 0) {
          for (const email of businessSettings.emailNotificationRecipients) {
            await this.sendWeatherAlertEmail({email}, businessName, project.name, alert);
          }
        } 
        // Otherwise, use the user emails from recipientIds
        else if (recipientIds && recipientIds.length > 0) {
          const users = await this.userModel.find({
            _id: { $in: recipientIds }
          });
          
          for (const user of users) {
            if (user.email) {
              await this.sendWeatherAlertEmail(user, businessName, project.name, alert);
            }
          }
        } else {
          this.logger.warn(`No email recipients configured for business ${alert.businessId}`);
        }
      }
      
      // 3. Process SMS notifications
      if (channels.includes(DeliveryChannel.SMS)) {
        // First check if project-specific SMS recipients are provided
        if (smsNotificationRecipients && smsNotificationRecipients.length > 0) {
          for (const phoneNumber of smsNotificationRecipients) {
            await this.sendWeatherAlertSMS(phoneNumber, businessName, project.name, alert);
          }
        }
        // If not, check if business has SMS recipients configured
        else if (businessSettings.smsNotificationRecipients && businessSettings.smsNotificationRecipients.length > 0) {
          for (const phoneNumber of businessSettings.smsNotificationRecipients) {
            await this.sendWeatherAlertSMS(phoneNumber, businessName, project.name, alert);
          }
        } 
        // Otherwise, use the user phone numbers from recipientIds
        else if (recipientIds && recipientIds.length > 0) {
          // don't send SMS notifications
        } else {
          this.logger.warn(`No SMS recipients configured for business ${alert.businessId}`);
        }
      }
      
      // Update alert with notification IDs
      if (notificationIds.length > 0) {
        alert.notificationIds = notificationIds;
        await alert.save();
      }
    } catch (error) {
      this.logger.error(`Error sending alert notification: ${error.message}`, error.stack);
    }
  }

  /**
 * Send weather alert email
 */
private async sendWeatherAlertEmail(
    user: any, 
    businessName: string, 
    projectName: string, 
    alert: WeatherAlert
  ): Promise<void> {
    try {
      // Extract user name
      const userName = user.name
        ? (user.surname ? `${user.name} ${user.surname}` : user.name)
        : 'Team Member';
  
      // Get current year for the copyright
      const currentYear = new Date().getFullYear();
  
      // Format date and time for email
      const startDate = alert.startTime.toLocaleDateString();
      const startTime = alert.startTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      
      // Determine alert level for styling
      const alertLevel = this.getSeverityDisplayInfo(alert.severity);
  
      // Send email notification
      await this.emailService.sendTemplateEmail(
        businessName,
        'weather-alerts@omnistackhub.xyz',
        user.email,
        `Weather Alert: ${alert.title}`,
        'templates/business/weather-alert-email.html', // You'll need to create this template
        {
          userName: userName,
          businessName: businessName,
          projectName: projectName,
          alertTitle: alert.title,
          alertDescription: alert.description,
          alertDate: startDate,
          alertTime: startTime,
          alertType: this.getWeatherTypeDisplayName(alert.weatherType),
          alertSeverity: alertLevel.name,
          alertColor: alertLevel.color,
          locationAddress: alert.location.address || 'Project Location',
          currentYear: currentYear,
          actionUrl: `https://app.staffluent.io/projects/details/${alert.affectedProjectIds[0]}`
        }
      );
  
      this.logger.log(`Sent weather alert email to user: ${user.email} for alert: ${alert._id}`);
    } catch (error) {
      this.logger.error(`Error sending weather alert email: ${error.message}`, error.stack);
    }
  }
  
  /**
   * Send weather alert SMS
   */
  private async sendWeatherAlertSMS(
    phoneNumber: string,
    businessName: string,
    projectName: string,
    alert: WeatherAlert
  ): Promise<void> {
    try {
      // Ensure proper E.164 format
      let formattedPhone = phoneNumber;
      if (!phoneNumber.startsWith('+')) {
        formattedPhone = `+${phoneNumber}`;
      }
      
      // Format date
      const startDate = alert.startTime.toLocaleDateString();
      
      // Prepare SMS message
      const message = `${businessName} Weather Alert: ${alert.title} for ${projectName} on ${startDate}. ${alert.description}`;
      
      // Send the SMS via Twilio
      const twilioMessage = await this.twilioClient.messages.create({
        body: message,
        messagingServiceSid: this.twilioVerifyServiceSid,
        to: formattedPhone
      });
      
      this.logger.log(`Sent weather alert SMS to ${formattedPhone}, message ID: ${twilioMessage.sid}`);
    } catch (error) {
      this.logger.error(`Failed to send weather alert SMS to ${phoneNumber}: ${error.message}`, error.stack);
    }
  }
  
  /**
   * Get display name for weather type
   */
  private getWeatherTypeDisplayName(type: WeatherType): string {
    switch (type) {
      case WeatherType.RAIN:
        return 'Heavy Rain';
      case WeatherType.SNOW:
        return 'Snowfall';
      case WeatherType.STORM:
        return 'Storm';
      case WeatherType.WIND:
        return 'High Winds';
      case WeatherType.HEAT:
        return 'Extreme Heat';
      case WeatherType.COLD:
        return 'Extreme Cold';
      case WeatherType.FOG:
        return 'Dense Fog';
      default:
        return 'Weather Alert';
    }
  }
  
  /**
   * Get severity display information
   */
  private getSeverityDisplayInfo(severity: WeatherAlertSeverity): { name: string, color: string } {
    switch (severity) {
      case WeatherAlertSeverity.EMERGENCY:
        return { name: 'Emergency', color: '#d32f2f' }; // Red
      case WeatherAlertSeverity.WARNING:
        return { name: 'Warning', color: '#f57c00' };   // Orange
      case WeatherAlertSeverity.WATCH:
        return { name: 'Watch', color: '#fbc02d' };     // Yellow
      case WeatherAlertSeverity.ADVISORY:
        return { name: 'Advisory', color: '#3f51b5' };  // Blue
      default:
        return { name: 'Notice', color: '#757575' };    // Grey
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
  private async mapAlertToResponseDto(alert: WeatherAlert): Promise<ProjectAlertResponseDto> {
    // Fetch project data for affected projects
    const affectedProjects = await Promise.all(
      alert.affectedProjectIds.map(async (projectId) => {
        const project = await this.appProjectModel.findById(projectId);
        if (project) {
          return {
            id: project._id.toString(),
            name: project.name
          };
        }
        return null;
      })
    );
  
    return {
      id: alert._id.toString(),
      title: alert.title,
      description: alert.description,
      weatherType: alert.weatherType,
      severity: alert.severity,
      startTime: alert.startTime,
      endTime: alert.endTime,
      affectedProjects: affectedProjects.filter(p => p !== null), // Filter out any null values
      location: alert.location
    };
  }

  /**
 * Get projects associated with construction sites
 */
async getProjectsWithConstructionSites(businessId: string): Promise<any> {
    try {
      // Find all construction sites for this business
      const constructionSites = await this.constructionSiteModel.find({
        businessId,
        isDeleted: false,
        appProjectId: { $exists: true, $ne: null }
      });
      
      // Extract project IDs
      const projectIds = constructionSites
        .map(site => site.appProjectId?.toString())
        .filter(Boolean);
      
      // Create a map of project ID to site info for quick lookup
      const projectToSiteMap = {};
      constructionSites.forEach(site => {
        if (site.appProjectId) {
          projectToSiteMap[site.appProjectId.toString()] = {
            siteId: site._id.toString(),
            siteName: site.name,
            siteType: site.type,
            siteStatus: site.status,
            location: site.location || null
          };
        }
      });
      
      return {
        projectIds,
        projectToSiteMap
      };
    } catch (error) {
      this.logger.error(`Error getting projects with construction sites: ${error.message}`, error.stack);
      throw error;
    }
  }

  private validateLocationCoordinates(latitude: string | number, longitude: string | number): { valid: boolean; error?: string } {
    try {
      // Convert to numbers if strings
      const lat = typeof latitude === 'string' ? parseFloat(latitude) : latitude;
      const lon = typeof longitude === 'string' ? parseFloat(longitude) : longitude;
      
      // Check if values are valid numbers
      if (isNaN(lat) || isNaN(lon)) {
        return { 
          valid: false, 
          error: `Invalid coordinates: latitude=${latitude}, longitude=${longitude} (not valid numbers)` 
        };
      }
      
      // Check if latitude is within valid range (-90 to 90)
      if (lat < -90 || lat > 90) {
        return { 
          valid: false, 
          error: `Invalid latitude: ${lat} (must be between -90 and 90)` 
        };
      }
      
      // Check if longitude is within valid range (-180 to 180)
      if (lon < -180 || lon > 180) {
        return { 
          valid: false, 
          error: `Invalid longitude: ${lon} (must be between -180 and 180)` 
        };
      }
      
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: `Error validating coordinates: ${error.message}` 
      };
    }
  }

  async getProjectWeatherSettings(businessId: string, projectId: string): Promise<ProjectWeatherSettings | null> {
    try {
      return await this.projectWeatherSettingsModel.findOne({ businessId, projectId });
    } catch (error) {
      this.logger.error(`Error getting project weather settings: ${error.message}`, error.stack);
      throw error;
    }
  }
}