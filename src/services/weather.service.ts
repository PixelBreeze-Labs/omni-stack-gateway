// src/services/weather.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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

  async checkWeatherForBusinessProjects(businessId: string): Promise<any> {
    try {
      // Get business settings
      const businessSettings = await this.getBusinessWeatherSettings(businessId);
      
      if (!businessSettings.enableWeatherAlerts) {
        return { 
          message: 'Weather alerts are disabled for this business',
          businessSettings 
        };
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
        businessSettings: {
          enableWeatherAlerts: businessSettings.enableWeatherAlerts,
          alertThresholds: businessSettings.alertThresholds
        },
        projectResults: [],
        debugInfo: {
          projects: projects.length,
          weatherData: [],
          thresholdChecks: [],
          alertCreationAttempts: []
        }
      };
      
      // For each project
      for (const project of projects) {
        try {
          const projectId = project._id.toString();
          let hasLocation = false;
          let latitude, longitude, address;
          let locationSource = 'project'; // Default location source
          
          // Initialize projectDebugInfo with properly typed objects
          const projectDebugInfo: any = {
            projectId,
            projectName: project.name,
            locationCheck: {
              projectLocation: null,
              constructionSite: null
            },
            weatherData: null,
            projectSettings: null,
            thresholdChecks: {
              usingSettingsFrom: null,
              alertThresholds: null,
              heat: {
                threshold: null,
                enabled: null,
                checks: []
              }
            },
            alertCreationResults: [],
            error: null,
            alertCreationDetails: null // Add field for alert creation details
          };
          
          // Save the original location reference to determine source later
          const originalLocation = project.metadata?.location;
          
          // 1. First check if project has location data
          if (project.metadata?.location?.latitude && project.metadata?.location?.longitude) {
            // Validate coordinates
            const validation = this.validateLocationCoordinates(
              project.metadata.location.latitude,
              project.metadata.location.longitude
            );
            
            projectDebugInfo.locationCheck.projectLocation = {
              hasLocation: validation.valid,
              latitude: project.metadata.location.latitude,
              longitude: project.metadata.location.longitude,
              validationResult: validation
            };
            
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
            
            projectDebugInfo.locationCheck.constructionSite = site ? {
              siteId: site._id.toString(),
              hasLocation: !!(site?.location?.latitude && site?.location?.longitude),
              latitude: site?.location?.latitude,
              longitude: site?.location?.longitude
            } : null;
            
            if (site && site.location?.latitude && site.location?.longitude) {
              // Validate coordinates
              const validation = this.validateLocationCoordinates(
                site.location.latitude,
                site.location.longitude
              );
              
              if (projectDebugInfo.locationCheck.constructionSite) {
                projectDebugInfo.locationCheck.constructionSite.validationResult = validation;
              }
              
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
            // Get project settings
            const projectSettings = await this.projectWeatherSettingsModel.findOne({
              businessId,
              projectId
            });
            
            projectDebugInfo.projectSettings = projectSettings ? {
              useCustomSettings: projectSettings.useCustomSettings,
              enableWeatherAlerts: projectSettings.enableWeatherAlerts,
              alertThresholds: projectSettings.alertThresholds
            } : 'No project settings';
            
            // Skip if project has custom settings and alerts disabled
            if (projectSettings?.useCustomSettings && !projectSettings.enableWeatherAlerts) {
              projectDebugInfo.alertCreationResults.push({
                status: 'skipped',
                reason: 'Project has custom settings with weather alerts disabled'
              });
              
              results.projectResults.push({
                projectId,
                projectName: project.name,
                alertsCreated: 0,
                hasLocation: true,
                locationSource,
                status: 'skipped',
                reason: 'Project alerts disabled'
              });
              
              results.debugInfo.alertCreationAttempts.push(projectDebugInfo);
              results.projectsChecked++;
              continue;
            }
            
            // Use project settings if available and enabled, otherwise use business settings
            const useProjectSettings = projectSettings?.useCustomSettings && projectSettings.enableWeatherAlerts;
            const alertThresholds = useProjectSettings ? projectSettings.alertThresholds : businessSettings.alertThresholds;
            
            projectDebugInfo.thresholdChecks.usingSettingsFrom = useProjectSettings ? 'project' : 'business';
            projectDebugInfo.thresholdChecks.alertThresholds = alertThresholds;
            
            // Get weather data
            try {
              const weatherData = await this.getOneCallWeather(parseFloat(latitude), parseFloat(longitude));
              
              // Create a simplified version of weather data for debugging
              const simplifiedWeatherData = {
                current: {
                  temp: weatherData.current.temp,
                  feels_like: weatherData.current.feels_like,
                  weather: weatherData.current.weather
                },
                daily: weatherData.daily ? weatherData.daily.slice(0, 3).map(day => ({
                  dt: day.dt,
                  date: new Date(day.dt * 1000).toISOString().split('T')[0],
                  temp: day.temp,
                  weather: day.weather
                })) : 'No daily data'
              };
              
              projectDebugInfo.weatherData = simplifiedWeatherData;
              
              // Process temperature checks
              const heatThreshold = alertThresholds.find(t => t.type === WeatherType.HEAT && t.enabled);
              
              projectDebugInfo.thresholdChecks.heat = {
                threshold: heatThreshold?.threshold,
                enabled: heatThreshold?.enabled,
                checks: []
              };
              
              if (heatThreshold && weatherData.daily) {
                for (let i = 0; i < Math.min(3, weatherData.daily.length); i++) {
                  const dailyData = weatherData.daily[i];
                  const maxTemp = dailyData.temp.max;
                  
                  projectDebugInfo.thresholdChecks.heat.checks.push({
                    day: i,
                    date: new Date(dailyData.dt * 1000).toISOString().split('T')[0],
                    maxTemp: maxTemp,
                    thresholdValue: heatThreshold.threshold,
                    exceeds: maxTemp >= heatThreshold.threshold
                  });
                }
              }
              
              // Execute modified alert check with detailed error handling
              const alertsOrErrors = await this.checkWeatherForProjectWithErrors(businessId, projectId);
              
              // Check if we have errors
              if (alertsOrErrors.errors && alertsOrErrors.errors.length > 0) {
                projectDebugInfo.alertCreationResults = [];
                projectDebugInfo.alertCreationDetails = alertsOrErrors.errors;
                
                results.projectsChecked++;
                results.alertsCreated = 0;
                results.projectResults.push({
                  projectId,
                  projectName: project.name,
                  alertsCreated: 0,
                  hasLocation: true,
                  locationSource,
                  heatThresholdChecks: projectDebugInfo.thresholdChecks.heat.checks,
                  alertCreationErrors: alertsOrErrors.errors
                });
              } else {
                // Normal case with successful alerts
                projectDebugInfo.alertCreationResults = alertsOrErrors.alerts.map(alert => ({
                  id: alert._id.toString(),
                  weatherType: alert.weatherType,
                  severity: alert.severity,
                  title: alert.title,
                  startTime: alert.startTime,
                  endTime: alert.endTime
                }));
                
                results.projectsChecked++;
                results.alertsCreated += alertsOrErrors.alerts.length;
                results.projectResults.push({
                  projectId,
                  projectName: project.name,
                  alertsCreated: alertsOrErrors.alerts.length,
                  hasLocation: true,
                  locationSource,
                  heatThresholdChecks: projectDebugInfo.thresholdChecks.heat.checks
                });
              }
            } catch (error) {
              projectDebugInfo.error = {
                weatherApi: error.message,
                stack: error.stack
              };
              
              results.projectResults.push({
                projectId,
                projectName: project.name,
                alertsCreated: 0,
                hasLocation: true,
                locationSource,
                error: `Weather API error: ${error.message}`
              });
            }
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
          
          // Add project debug info to results
          results.debugInfo.weatherData.push(projectDebugInfo);
          
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
 * Modified version of checkWeatherForProject that returns errors
 */
async checkWeatherForProjectWithErrors(businessId: string, projectId: string): Promise<{alerts: WeatherAlert[], errors: any[]}> {
    try {
      // Get project details
      const project = await this.appProjectModel.findOne({ 
        _id: projectId,
        businessId 
      });
      
      if (!project) {
        return { 
          alerts: [],
          errors: [{ message: 'Project not found', phase: 'project_lookup' }]
        };
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
        } else {
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
          } else {
            return {
              alerts: [],
              errors: [{ 
                message: 'Project and associated construction site have invalid location data',
                validation
              }]
            };
          }
        } else {
          return {
            alerts: [],
            errors: [{ 
              message: 'Project does not have location data and no associated construction site with location data was found'
            }]
          };
        }
      }
      
      // Get business settings
      const businessSettings = await this.getBusinessWeatherSettings(businessId);
      
      if (!businessSettings.enableWeatherAlerts) {
        return { 
          alerts: [],
          errors: [{ message: 'Weather alerts are disabled for this business' }]
        };
      }
      
      // Get project settings if any
      const projectSettings = await this.projectWeatherSettingsModel.findOne({
        businessId,
        projectId
      });
      
      // Skip if project has custom settings and alerts disabled
      if (projectSettings?.useCustomSettings && !projectSettings.enableWeatherAlerts) {
        return { 
          alerts: [],
          errors: [{ message: 'Project has custom settings with weather alerts disabled' }]
        };
    }
    
    // Use project settings if available and enabled, otherwise use business settings
    const useProjectSettings = projectSettings?.useCustomSettings && projectSettings.enableWeatherAlerts;
    const alertThresholds = useProjectSettings ? projectSettings.alertThresholds : businessSettings.alertThresholds;
   
    // Ensure notification recipients always have valid arrays
    const notificationRecipients = (useProjectSettings && 
      projectSettings.notificationRecipients && 
      projectSettings.notificationRecipients.length > 0) ? 
        projectSettings.notificationRecipients : 
        (businessSettings.notificationRecipients || []);
    
    // Ensure email recipients includes your specific email
    let emailNotificationRecipients = [];
    if (useProjectSettings && projectSettings.emailNotificationRecipients && projectSettings.emailNotificationRecipients.length > 0) {
      emailNotificationRecipients = projectSettings.emailNotificationRecipients;
    } else if (businessSettings.emailNotificationRecipients && businessSettings.emailNotificationRecipients.length > 0) {
      emailNotificationRecipients = businessSettings.emailNotificationRecipients;
    } else {
      emailNotificationRecipients = [];
    }
    
    const smsNotificationRecipients = (useProjectSettings && 
      projectSettings.smsNotificationRecipients && 
      projectSettings.smsNotificationRecipients.length > 0) ? 
        projectSettings.smsNotificationRecipients : 
        (businessSettings.smsNotificationRecipients || []);
          
    // Get weather data
    const { latitude, longitude } = locationData;
    let weatherData;
    try {
      weatherData = await this.getOneCallWeather(parseFloat(latitude), parseFloat(longitude));
    } catch (error) {
      return {
        alerts: [],
        errors: [{ 
          message: `Error fetching weather data: ${error.message}`,
          phase: 'weather_api'
        }]
      };
    }
    
    // Prepare a project object that includes location data for alert creation
    const projectWithLocation = { ...project.toObject() };
    projectWithLocation.metadata = projectWithLocation.metadata || {};
    projectWithLocation.metadata.location = locationData;
    
    // Check for weather conditions that exceed thresholds
    const newAlerts: WeatherAlert[] = [];
    const errors: any[] = [];
    
    // Check for external alerts from weather provider
    if (weatherData.alerts && weatherData.alerts.length > 0) {
      for (const externalAlert of weatherData.alerts) {
        try {
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
            
            try {
              await this.sendAlertNotification(alert, projectWithLocation, notificationRecipients, businessSettings, emailNotificationRecipients, smsNotificationRecipients);
            } catch (notifyError) {
              errors.push({
                phase: 'notification_storm',
                message: `Failed to send storm alert notification: ${notifyError.message}`
              });
            }
          }
        } catch (error) {
          errors.push({
            phase: 'storm_check',
            message: `Error processing storm alert: ${error.message}`
          });
        }
      }
    }
    
    // Check for rain
    const rainThreshold = alertThresholds.find(t => t.type === WeatherType.RAIN && t.enabled);
    if (rainThreshold) {
      try {
        const result = await this.checkForAlertWithErrors(
          weatherData, 
          businessId, 
          projectId, 
          project, 
          WeatherType.RAIN, 
          rainThreshold.threshold
        );
        
        if (result.alert) {
          newAlerts.push(result.alert);
          try {
            await this.sendAlertNotification(result.alert, project, notificationRecipients, businessSettings, emailNotificationRecipients, smsNotificationRecipients);
          } catch (notifyError) {
            errors.push({
              phase: 'notification_rain',
              message: `Failed to send rain alert notification: ${notifyError.message}`
            });
          }
        } else if (result.error) {
          errors.push(result.error);
        }
      } catch (error) {
        errors.push({
          phase: 'rain_check',
          message: `Error checking for rain alert: ${error.message}`
        });
      }
    }
    
    // Check for snow
    const snowThreshold = alertThresholds.find(t => t.type === WeatherType.SNOW && t.enabled);
    if (snowThreshold) {
      try {
        const result = await this.checkForAlertWithErrors(
          weatherData, 
          businessId, 
          projectId, 
          project, 
          WeatherType.SNOW, 
          snowThreshold.threshold
        );
        
        if (result.alert) {
          newAlerts.push(result.alert);
          try {
            await this.sendAlertNotification(result.alert, project, notificationRecipients, businessSettings, emailNotificationRecipients, smsNotificationRecipients);
          } catch (notifyError) {
            errors.push({
              phase: 'notification_snow',
              message: `Failed to send snow alert notification: ${notifyError.message}`
            });
          }
        } else if (result.error) {
          errors.push(result.error);
        }
      } catch (error) {
        errors.push({
          phase: 'snow_check',
          message: `Error checking for snow alert: ${error.message}`
        });
      }
    }
    
    // Check for wind
    const windThreshold = alertThresholds.find(t => t.type === WeatherType.WIND && t.enabled);
    if (windThreshold) {
      try {
        const result = await this.checkForAlertWithErrors(
          weatherData, 
          businessId, 
          projectId, 
          project, 
          WeatherType.WIND, 
          windThreshold.threshold
        );
        
        if (result.alert) {
          newAlerts.push(result.alert);
          try {
            await this.sendAlertNotification(result.alert, project, notificationRecipients, businessSettings, emailNotificationRecipients, smsNotificationRecipients);
          } catch (notifyError) {
            errors.push({
              phase: 'notification_wind',
              message: `Failed to send wind alert notification: ${notifyError.message}`
            });
          }
        } else if (result.error) {
          errors.push(result.error);
        }
      } catch (error) {
        errors.push({
          phase: 'wind_check',
          message: `Error checking for wind alert: ${error.message}`
        });
      }
    }
    
    // Check for heat
    const heatThreshold = alertThresholds.find(t => t.type === WeatherType.HEAT && t.enabled);
    if (heatThreshold) {
      try {
        // Try creating a heat alert with error details
        const result = await this.checkForHeatAlertWithErrors(weatherData, businessId, projectId, project, heatThreshold.threshold, locationData);
        
        if (result.alert) {
          newAlerts.push(result.alert);
          try {
            await this.sendAlertNotification(result.alert, project, notificationRecipients, businessSettings, emailNotificationRecipients, smsNotificationRecipients);
          } catch (notifyError) {
            errors.push({
              phase: 'notification_heat',
              message: `Failed to send heat alert notification: ${notifyError.message}`
            });
          }
        } else if (result.error) {
          errors.push(result.error);
        }
      } catch (error) {
        errors.push({
          phase: 'heat_check',
          message: `Error checking for heat alert: ${error.message}`,
          stack: error.stack
        });
      }
    }
    
    // Check for cold
    const coldThreshold = alertThresholds.find(t => t.type === WeatherType.COLD && t.enabled);
    if (coldThreshold) {
      try {
        const result = await this.checkForAlertWithErrors(
          weatherData, 
          businessId, 
          projectId, 
          project, 
          WeatherType.COLD, 
          coldThreshold.threshold
        );
        
        if (result.alert) {
          newAlerts.push(result.alert);
          try {
            await this.sendAlertNotification(result.alert, project, notificationRecipients, businessSettings, emailNotificationRecipients, smsNotificationRecipients);
          } catch (notifyError) {
            errors.push({
              phase: 'notification_cold',
              message: `Failed to send cold alert notification: ${notifyError.message}`
            });
          }
        } else if (result.error) {
          errors.push(result.error);
        }
      } catch (error) {
        errors.push({
          phase: 'cold_check',
          message: `Error checking for cold alert: ${error.message}`
        });
      }
    }
    
    // Return all alerts and errors
    return {
      alerts: newAlerts,
      errors: errors
    };
  } catch (error) {
    return {
      alerts: [],
      errors: [{
        phase: 'overall_check',
        message: `Error checking weather for project: ${error.message}`,
        stack: error.stack
      }]
    };
  }
}

/**
 * Generic check for weather alerts with errors (for rain, snow, wind, and cold)
 */
private async checkForAlertWithErrors(
  weatherData: any,
  businessId: string,
  projectId: string,
  project: any,
  weatherType: WeatherType,
  threshold: number
): Promise<{ alert: WeatherAlert | null, error: any | null }> {
  try {
    let propertyName: string;
    let valueGetter: (dailyData: any) => number;
    let title: string;
    let descriptionFormat: string;
    let unit: string = '';
    let thresholdComparator: (value: number, threshold: number) => boolean;
    
    // Configure based on weather type
    switch (weatherType) {
      case WeatherType.RAIN:
        propertyName = 'rain';
        valueGetter = (dailyData) => dailyData.rain || 0;
        title = 'Heavy Rain Alert';
        descriptionFormat = 'Heavy rain expected with %VALUE%%UNIT% precipitation forecasted for %DATE%.';
        unit = 'mm';
        thresholdComparator = (value, threshold) => value >= threshold;
        break;
      case WeatherType.SNOW:
        propertyName = 'snow';
        valueGetter = (dailyData) => dailyData.snow || 0;
        title = 'Snow Alert';
        descriptionFormat = 'Significant snowfall expected with %VALUE%%UNIT% accumulation forecasted for %DATE%.';
        unit = 'cm';
        thresholdComparator = (value, threshold) => value >= threshold;
        break;
      case WeatherType.WIND:
        propertyName = 'wind_speed';
        valueGetter = (dailyData) => {
          const windSpeed = dailyData.wind_speed || 0;
          return this.units === 'metric' ? windSpeed : windSpeed * 1.60934; // Convert to km/h if imperial
        };
        title = 'High Wind Alert';
        descriptionFormat = 'Strong winds expected with speeds up to %VALUE%%UNIT% on %DATE%.';
        unit = ' km/h';
        thresholdComparator = (value, threshold) => value >= threshold;
        break;
      case WeatherType.COLD:
        propertyName = 'temp.min';
        valueGetter = (dailyData) => dailyData.temp.min;
        title = 'Cold Temperature Alert';
        descriptionFormat = 'Low temperatures expected to reach %VALUE%%UNIT% on %DATE%.';
        unit = this.units === 'metric' ? '°C' : '°F';
        thresholdComparator = (value, threshold) => value <= threshold;
        break;
      default:
        return {
          alert: null,
          error: {
            phase: 'alert_type_check',
            message: `Unsupported weather type: ${weatherType}`
          }
        };
    }
    
    // Check daily forecast
    for (let i = 0; i < 3; i++) { // Check next 3 days
      const dailyData = weatherData.daily[i];
      const value = valueGetter(dailyData);
      
      if (thresholdComparator(value, threshold)) {
        try {
          // Create a new alert
          const startTime = new Date(dailyData.dt * 1000);
          const endTime = new Date(startTime);
          endTime.setHours(23, 59, 59); // End of day
          
          // Format description
          const description = descriptionFormat
            .replace('%VALUE%', value.toFixed(1))
            .replace('%UNIT%', unit)
            .replace('%DATE%', startTime.toLocaleDateString());
          
          // Determine severity based on weather type
          let severity: WeatherAlertSeverity;
          switch (weatherType) {
            case WeatherType.RAIN:
            case WeatherType.SNOW:
              severity = this.determinePrecipitationSeverity(value, threshold);
              break;
            case WeatherType.WIND:
              severity = this.determineWindSeverity(value, threshold);
              break;
            case WeatherType.COLD:
              severity = this.determineTemperatureSeverity(Math.abs(value), threshold);
              break;
            default:
              severity = WeatherAlertSeverity.ADVISORY;
          }
          
          // Create alert
          const alert = await this.createWeatherAlert({
            businessId,
            projectId,
            title,
            description,
            weatherType,
            severity,
            startTime,
            endTime,
            location: project.metadata?.location || { latitude: 0, longitude: 0 },
            weatherData: dailyData
          });
          
          return { alert, error: null };
        } catch (error) {
          return {
            alert: null,
            error: {
              phase: 'alert_creation',
              message: error.message,
              weatherType,
              day: i,
              value,
              threshold
            }
          };
        }
      }
    }
    
    // No threshold exceeded
    return {
      alert: null,
      error: {
        phase: 'threshold_check',
        message: `No ${weatherType} conditions exceeding threshold found`,
        weatherType,
        threshold
      }
    };
  } catch (error) {
    return {
      alert: null,
      error: {
        phase: 'weather_check',
        message: error.message,
        weatherType
      }
    };
  }
}

/**
* Modified version of checkForHeatAlert that returns error details
*/
private async checkForHeatAlertWithErrors(
  weatherData: any, 
  businessId: string, 
  projectId: string, 
  project: any, 
  threshold: number,
  locationData: any
): Promise<{ alert: WeatherAlert | null, error: any | null }> {
  try {
    // Check daily forecast for extreme heat
    for (let i = 0; i < 3; i++) { // Check next 3 days
      const dailyData = weatherData.daily[i];
      const maxTemp = dailyData.temp.max;
      
      if (maxTemp >= threshold) {
        try {
          // Try to create the alert
          const startTime = new Date(dailyData.dt * 1000);
          const endTime = new Date(startTime);
          endTime.setHours(23, 59, 59); // End of day
          
          const tempUnit = this.units === 'metric' ? '°C' : '°F';
          
          const alertData = {
            businessId,
            title: `Extreme Heat Alert`,
            description: `High temperatures expected to reach ${maxTemp.toFixed(1)}${tempUnit} on ${startTime.toLocaleDateString()}.`,
            weatherType: WeatherType.HEAT,
            severity: this.determineTemperatureSeverity(maxTemp, threshold),
            startTime,
            endTime,
            location: locationData,
            affectedProjectIds: [projectId],
            weatherData: {
              temp: dailyData.temp,
              dt: dailyData.dt
            },
            resolved: false
          };
          
          // Try direct create
          try {
            const alert = await this.weatherAlertModel.create(alertData);
            return { alert, error: null };
          } catch (createError) {
            // If create fails, try with new + save
            try {
              const alert = new this.weatherAlertModel(alertData);
              await alert.save();
              return { alert, error: null };
            } catch (saveError) {
              return {
                alert: null,
                error: {
                  phase: 'alert_save',
                  message: saveError.message,
                  code: saveError.code,
                  name: saveError.name,
                  validationErrors: saveError.errors,
                  alertData
                }
              };
            }
          }
        } catch (error) {
          return {
            alert: null,
            error: {
              phase: 'alert_creation',
              message: error.message,
              stack: error.stack,
              day: i,
              maxTemp,
              threshold
            }
          };
        }
      }
    }
    
    // No days exceeded threshold or other issue
    return { 
      alert: null,
      error: { 
        phase: 'temperature_check',
        message: 'No days with temperature exceeding threshold',
        thresholdValue: threshold,
        temperatures: weatherData.daily.slice(0, 3).map(d => d.temp.max)
      }
    };
  } catch (error) {
    return {
      alert: null,
      error: {
        phase: 'heat_check_overall',
        message: error.message,
        stack: error.stack
      }
    };
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
   
    // Ensure notification recipients always have valid arrays
    const notificationRecipients = (useProjectSettings && 
        projectSettings.notificationRecipients && 
        projectSettings.notificationRecipients.length > 0) ? 
          projectSettings.notificationRecipients : 
          (businessSettings.notificationRecipients || []);
    
    let emailNotificationRecipients = [];
    if (useProjectSettings && projectSettings.emailNotificationRecipients && projectSettings.emailNotificationRecipients.length > 0) {
      emailNotificationRecipients = projectSettings.emailNotificationRecipients;
    } else if (businessSettings.emailNotificationRecipients && businessSettings.emailNotificationRecipients.length > 0) {
      emailNotificationRecipients = businessSettings.emailNotificationRecipients;
    } else {
      emailNotificationRecipients = [];
    }
    
    const smsNotificationRecipients = (useProjectSettings && 
      projectSettings.smsNotificationRecipients && 
      projectSettings.smsNotificationRecipients.length > 0) ? 
        projectSettings.smsNotificationRecipients : 
        (businessSettings.smsNotificationRecipients || []);
    
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
          try {
            await this.sendAlertNotification(alert, projectWithLocation, notificationRecipients, businessSettings, emailNotificationRecipients, smsNotificationRecipients);
          } catch (error) {
            this.logger.error(`Failed to send alert notification for external alert: ${error.message}`);
          }
        }
      }
    }
    
    // Helper function to process each alert type
    const processAlertType = async (
      weatherType: WeatherType, 
      threshold: number
    ) => {
      try {
        const result = await this.checkForAlertWithErrors(
          weatherData, 
          businessId, 
          projectId, 
          project, 
          weatherType, 
          threshold
        );
        
        if (result.alert) {
          newAlerts.push(result.alert);
          try {
            await this.sendAlertNotification(result.alert, project, notificationRecipients, businessSettings, emailNotificationRecipients, smsNotificationRecipients);
          } catch (error) {
            this.logger.error(`Failed to send alert notification for ${weatherType} alert: ${error.message}`);
          }
        }
      } catch (error) {
        this.logger.error(`Error checking for ${weatherType} alert: ${error.message}`);
      }
    };
    
    // Check for rain
    const rainThreshold = alertThresholds.find(t => t.type === WeatherType.RAIN && t.enabled);
    if (rainThreshold) {
      await processAlertType(WeatherType.RAIN, rainThreshold.threshold);
    }
    
    // Check for snow
    const snowThreshold = alertThresholds.find(t => t.type === WeatherType.SNOW && t.enabled);
    if (snowThreshold) {
      await processAlertType(WeatherType.SNOW, snowThreshold.threshold);
    }
    
    // Check for wind
    const windThreshold = alertThresholds.find(t => t.type === WeatherType.WIND && t.enabled);
    if (windThreshold) {
      await processAlertType(WeatherType.WIND, windThreshold.threshold);
    }
    
    // Check for heat
    const heatThreshold = alertThresholds.find(t => t.type === WeatherType.HEAT && t.enabled);
    if (heatThreshold) {
      try {
        const result = await this.checkForHeatAlertWithErrors(weatherData, businessId, projectId, project, heatThreshold.threshold, locationData);
        if (result.alert) {
          newAlerts.push(result.alert);
          try {
            await this.sendAlertNotification(result.alert, project, notificationRecipients, businessSettings, emailNotificationRecipients, smsNotificationRecipients);
          } catch (error) {
            this.logger.error(`Failed to send alert notification for heat alert: ${error.message}`);
          }
        }
      } catch (error) {
        this.logger.error(`Error checking for heat alert: ${error.message}`);
      }
    }
    
    // Check for cold
    const coldThreshold = alertThresholds.find(t => t.type === WeatherType.COLD && t.enabled);
    if (coldThreshold) {
      await processAlertType(WeatherType.COLD, coldThreshold.threshold);
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

private async checkForHeatAlert(
  weatherData: any, 
  businessId: string, 
  projectId: string, 
  project: any, 
  threshold: number
): Promise<WeatherAlert | any> {  // Modified return type to allow error objects
  try {
    for (let i = 0; i < 3; i++) {
      const dailyData = weatherData.daily[i];
      const maxTemp = dailyData.temp.max;
      
      if (maxTemp >= threshold) {
        const startTime = new Date(dailyData.dt * 1000);
        const endTime = new Date(startTime);
        endTime.setHours(23, 59, 59);
        
        const tempUnit = this.units === 'metric' ? '°C' : '°F';
        
        try {
          const alert = await this.createWeatherAlert({
            businessId,
            projectId,
            title: `Extreme Heat Alert`,
            description: `High temperatures expected to reach ${maxTemp.toFixed(1)}${tempUnit} on ${startTime.toLocaleDateString()}.`,
            weatherType: WeatherType.HEAT,
            severity: this.determineTemperatureSeverity(maxTemp, threshold),
            startTime,
            endTime,
            location: project.metadata?.location || { latitude: 0, longitude: 0 },
            weatherData: dailyData
          });
          
          return alert;
        } catch (createError) {
          // Return detailed error information
          return {
            error: true,
            message: createError.message,
            stack: createError.stack,
            details: createError.errors || {},
            data: {
              businessId,
              projectId,
                weatherType: WeatherType.HEAT,
                maxTemp,
                threshold,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                location: project.metadata?.location
              }
            };
          }
        }
      }
      
      return { error: false, message: 'No temperatures exceeding threshold found' };
    } catch (error) {
      return {
        error: true,
        message: error.message,
        stack: error.stack,
        phase: 'checking_heat_alert'
      };
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
      // Ensure required fields exist
      if (!params.location) {
        params.location = { latitude: 0, longitude: 0 };
      }
      
      // Create the alert object
      const alertData = {
        businessId: params.businessId,
        title: params.title,
        description: params.description,
        weatherType: params.weatherType,
        severity: params.severity,
        startTime: params.startTime,
        endTime: params.endTime,
        location: params.location,
        affectedProjectIds: [params.projectId],
        weatherData: params.weatherData || {},
        resolved: false
      };
      
      try {
        // Try direct create method
        const alert = await this.weatherAlertModel.create(alertData);
        return alert;
      } catch (createError) {
        // If create fails, try the new + save approach
        const alert = new this.weatherAlertModel(alertData);
        await alert.save();
        return alert;
      }
    } catch (error) {
      throw error; // Re-throw to be caught by the caller
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
        url: `/projects/details/${project._id}`
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
            await this.sendWeatherAlertEmail(user, businessName, project.name, alert);
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
  
  private async sendWeatherAlertEmail(
    user: any, 
    businessName: string, 
    projectName: string, 
    alert: WeatherAlert
  ): Promise<void> {
    // Register the missing eq helper
    const handlebars = require('handlebars');
    handlebars.registerHelper('eq', function(a, b) {
      return a === b;
    });
    
    // Extract user email
    const email = user.email || (typeof user === 'object' && 'email' in user ? user.email : user);
    
    if (!email || typeof email !== 'string') {
      throw new Error(`Invalid email recipient: ${JSON.stringify(user)}`);
    }
    
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
  
    // Send email notification - don't catch errors here, let them propagate up
    await this.emailService.sendTemplateEmail(
      businessName,
      'weather-alerts@omnistackhub.xyz',
      email,
      `Weather Alert: ${alert.title}`,
      'templates/business/weather-alert-email.html',
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
        actionUrl: `https://app.staffluent.co/projects/details/${alert.affectedProjectIds[0]}`
      }
    );
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

  /**
 * Resolve a weather alert
 */
async resolveWeatherAlert(businessId: string, alertId: string): Promise<WeatherAlert> {
    try {
      // Find the alert and ensure it belongs to the specified business
      const alert = await this.weatherAlertModel.findOne({
        _id: alertId,
        businessId,
        resolved: false
      });
      
      if (!alert) {
        throw new NotFoundException('Alert not found or already resolved');
      }
      
      // Update the alert
      alert.resolved = true;
      alert.resolvedAt = new Date();
      await alert.save();
      
      return alert;
    } catch (error) {
      this.logger.error(`Error resolving weather alert: ${error.message}`, error.stack);
      throw error;
    }
  }
}