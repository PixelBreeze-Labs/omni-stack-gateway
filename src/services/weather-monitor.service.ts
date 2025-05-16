import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WeatherService } from './weather.service';
import { AppProject } from '../schemas/app-project.schema';
import { Business } from '../schemas/business.schema';
import { BusinessWeatherSettings } from '../schemas/business-weather-settings.schema';
import { CronJobHistory } from '../schemas/cron-job-history.schema';

@Injectable()
export class WeatherMonitorService {
  private readonly logger = new Logger(WeatherMonitorService.name);

  constructor(
    private readonly weatherService: WeatherService,
    @InjectModel(AppProject.name) private appProjectModel: Model<AppProject>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(BusinessWeatherSettings.name) private businessWeatherSettingsModel: Model<BusinessWeatherSettings>,
    @InjectModel(CronJobHistory.name) private cronJobHistoryModel: Model<CronJobHistory>
  ) {}

  /**
   * Check weather for all active businesses with weather alerts enabled
   * Runs by default every 3 hours
   */
  @Cron(CronExpression.EVERY_3_HOURS)
  async checkWeatherForAllBusinesses() {
    const startTime = new Date();
    this.logger.log('[CRON START] Weather check job started at ' + startTime.toISOString());
    
    // Create a record for this job execution
    const jobRecord = await this.cronJobHistoryModel.create({
      jobName: 'weatherCheckJob',
      startTime,
      status: 'started'
    });
    
    try {
      // Get all active businesses
      const businesses = await this.businessModel.find({
        isActive: true,
        // Optional: only businesses with specifically enabled weather feature
        // 'includedFeatures': { $in: ['weather_alerts'] }
      });
      
      const businessResults = [];
      let totalAlerts = 0;
      
      // For each business, check if they have weather alerts enabled
      for (const business of businesses) {
        try {
          const settings = await this.businessWeatherSettingsModel.findOne({ businessId: business._id });
          
          // Skip businesses with weather alerts disabled
          if (!settings || !settings.enableWeatherAlerts) {
            businessResults.push({
              businessId: business._id,
              businessName: business.name,
              skipped: true,
              reason: 'Weather alerts disabled'
            });
            continue;
          }
          
          // Get all active projects for this business
          const projects = await this.appProjectModel.find({
            businessId: business._id,
            'metadata.status': { $in: ['planning', 'in_progress'] }
          });
          
          this.logger.log(`Checking weather for ${projects.length} projects of business ${business.name} (${business._id})`);
          
          const projectResults = [];
          let businessAlertCount = 0;
          
          // Process each project with delay between API calls to avoid rate limiting
          for (const project of projects) {
            try {
              // Check weather for this project
              const alerts = await this.weatherService.checkWeatherForProject(
                business._id.toString(),
                project._id.toString()
              );
              
              projectResults.push({
                projectId: project._id,
                projectName: project.name,
                success: true,
                alertCount: alerts.length
              });
              
              businessAlertCount += alerts.length;
              
              // Add a small delay between API calls to avoid rate limiting
              await this.delay(1000);
            } catch (projectError) {
              this.logger.error(`Error checking weather for project ${project._id} (${project.name}): ${projectError.message}`);
              
              projectResults.push({
                projectId: project._id,
                projectName: project.name,
                success: false,
                error: projectError.message
              });
            }
          }
          
          businessResults.push({
            businessId: business._id,
            businessName: business.name,
            totalProjects: projects.length,
            processedProjects: projectResults.filter(p => p.success).length,
            failedProjects: projectResults.filter(p => !p.success).length,
            alertCount: businessAlertCount,
            projectResults: projectResults
          });
          
          totalAlerts += businessAlertCount;
        } catch (businessError) {
          this.logger.error(`Error processing business ${business._id} (${business.name}): ${businessError.message}`);
          
          businessResults.push({
            businessId: business._id,
            businessName: business.name,
            success: false,
            error: businessError.message
          });
        }
      }
      
      // Update the job record on completion
      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000;
      
      await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
        endTime,
        duration,
        status: 'completed',
        targetCount: businesses.length,
        processedCount: businessResults.filter(b => !b.error).length,
        failedCount: businessResults.filter(b => b.error).length,
        details: {
          totalBusinesses: businesses.length,
          totalAlerts,
          businessResults
        }
      });
      
      this.logger.log(`[CRON COMPLETE] Weather check job completed at ${endTime.toISOString()}, duration: ${duration}s, processed ${businesses.length} businesses`);
    } catch (error) {
      // Update the job record on failure
      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000;
      
      await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
        endTime,
        duration,
        status: 'failed',
        error: error.message
      });
      
      this.logger.error(`[CRON FAILED] Error in weather check job: ${error.message}`, error.stack);
    }
  }
  
  /**
   * Utility method to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}