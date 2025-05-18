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
 * Runs by default every 3 Hours
 */
@Cron(CronExpression.EVERY_3_HOURS)
async checkWeatherForAllBusinesses() {
  const startTime = new Date();
  this.logger.log('[CRON START] Weather check job started at ' + startTime.toISOString());
  
  try {
    // Get all active businesses
    const businesses = await this.businessModel.find({
      isActive: true,
      // Optional: only businesses with specifically enabled weather feature
      // 'includedFeatures': { $in: ['weather_alerts'] }
    });
    
    const businessResults = [];
    let totalAlerts = 0;
    
    // For each business, create a separate job record and check weather
    for (const business of businesses) {
      // Create a business-specific job record
      const jobRecord = await this.cronJobHistoryModel.create({
        jobName: `weatherCheckJob-${business._id}`,
        startTime: new Date(),
        status: 'started',
        businessId: business._id  // Set the businessId directly
      });
      
      try {
        const settings = await this.businessWeatherSettingsModel.findOne({ businessId: business._id });
        
        // Skip businesses with weather alerts disabled but update the job record
        if (!settings || !settings.enableWeatherAlerts) {
          businessResults.push({
            businessId: business._id,
            businessName: business.name,
            skipped: true,
            reason: 'Weather alerts disabled'
          });
          
          // Update job record for skipped business
          await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
            endTime: new Date(),
            duration: 0,
            status: 'completed',
            details: {
              skipped: true,
              reason: 'Weather alerts disabled'
            }
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
        
        // Update the job record for this business
        const endTime = new Date();
        const duration = (endTime.getTime() - startTime.getTime()) / 1000;
        
        await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
          endTime,
          duration,
          status: 'completed',
          targetCount: projects.length,
          processedCount: projectResults.filter(p => p.success).length,
          failedCount: projectResults.filter(p => !p.success).length,
          details: {
            totalProjects: projects.length,
            processedProjects: projectResults.filter(p => p.success).length,
            failedProjects: projectResults.filter(p => !p.success).length,
            alertCount: businessAlertCount,
            projectResults: projectResults
          }
        });
      } catch (businessError) {
        this.logger.error(`Error processing business ${business._id} (${business.name}): ${businessError.message}`);
        
        businessResults.push({
          businessId: business._id,
          businessName: business.name,
          success: false,
          error: businessError.message
        });
        
        // Update the job record for this business on error
        const endTime = new Date();
        const duration = (endTime.getTime() - startTime.getTime()) / 1000;
        
        await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
          endTime,
          duration,
          status: 'failed',
          error: businessError.message
        });
      }
    }
    
    this.logger.log(`[CRON COMPLETE] Weather check job completed at ${new Date().toISOString()}, processed ${businesses.length} businesses, total alerts: ${totalAlerts}`);
  } catch (error) {
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