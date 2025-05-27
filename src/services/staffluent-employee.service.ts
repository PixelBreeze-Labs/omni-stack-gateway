// src/services/staffluent-employee.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StaffProfile, SkillLevel } from '../schemas/staff-profile.schema';
import { Business } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import { VenueBoostService } from './venueboost.service';
import { TaskAssignment, TaskStatus } from 'src/schemas/task-assignment.schema';
import { CronJobHistory } from 'src/schemas/cron-job-history.schema';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class StaffluentEmployeeService {
  private readonly logger = new Logger(StaffluentEmployeeService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    @InjectModel(StaffProfile.name) private staffProfileModel: Model<StaffProfile>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(TaskAssignment.name) private taskAssignmentModel: Model<TaskAssignment>,
    @InjectModel(CronJobHistory.name) private cronJobHistoryModel: Model<CronJobHistory>,
    private readonly venueBoostService: VenueBoostService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('venueboost.baseUrl');
    this.apiKey = this.configService.get<string>('venueboost.apiKey');
  }

  /**
   * Update Employee external ID in PHP via VenueBoost API
   */
  private async updateEmployeeExternalId(phpEmployeeId: number, omnistackStaffProfileId: string): Promise<boolean> {
    try {
      this.logger.log(`Attempting to update employee ${phpEmployeeId} with OmniStack ID ${omnistackStaffProfileId}`);
      this.logger.log(`Making POST request to: ${this.baseUrl}/employees-os/${phpEmployeeId}/external-id`);
      
      const response$ = this.httpService.post(
        `${this.baseUrl}/employees-os/${phpEmployeeId}/external-id`,
        {
          omnistack_id: omnistackStaffProfileId
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey
          }
        }
      );

      const response = await lastValueFrom(response$);
      
      this.logger.log(`API Response Status: ${response.status}`);
      this.logger.log(`API Response Data:`, JSON.stringify(response.data, null, 2));
      
      if (response.status >= 400) {
        this.logger.error(`Failed to update employee ${phpEmployeeId} external ID: ${response.data.error || 'Unknown error'}`);
        return false;
      }

      this.logger.log(`Successfully updated employee ${phpEmployeeId} with OmniStack ID ${omnistackStaffProfileId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error updating employee external ID for ${phpEmployeeId}:`, {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      return false;
    }
  }

 /**
   * Sync employees from Staffluent to NestJS for a specific business
   */
 async syncEmployeesFromVenueBoost(businessId: string): Promise<{
  totalSynced: number;
  logs: string[];
  summary: any;
}> {
  const startTime = new Date();
  const logs: string[] = [];
  
  logs.push(`[SYNC START] Syncing employees from VenueBoost for business: ${businessId}`);
  this.logger.log(`[SYNC START] Syncing employees from VenueBoost for business: ${businessId}`);
  
  // Create a record for this job execution
  const jobRecord = await this.cronJobHistoryModel.create({
    jobName: 'syncEmployeesFromVenueBoost',
    startTime,
    status: 'started',
    businessId
  });
  
  try {
    // Find the business in our system
    const business = await this.businessModel.findById(businessId);
    if (!business || !business.externalIds?.venueBoostId) {
      throw new Error(`Business ${businessId} not found or not connected to VenueBoost`);
    }

    logs.push(`Found business: ${business.name}, VenueBoost ID: ${business.externalIds.venueBoostId}`);

    // Get employees from VenueBoost API
    const venueBoostEmployees = await this.venueBoostService.getEmployees(business.externalIds.venueBoostId);
    logs.push(`Retrieved ${venueBoostEmployees.length} employees from VenueBoost API`);
    
    const syncSummary = {
      added: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      externalIdUpdates: 0,
      externalIdFailures: 0
    };
    
    for (const phpEmployee of venueBoostEmployees) {
      try {
        logs.push(`\n--- Processing employee: ${phpEmployee.name} (ID: ${phpEmployee.id}) ---`);
        
        // Check if employee already exists in our system
        let staffProfile = await this.staffProfileModel.findOne({
          'externalIds.venueBoostId': String(phpEmployee.id)
        });
        
        logs.push(`Staff profile exists: ${!!staffProfile}`);
        logs.push(`PHP Employee external_ids: ${phpEmployee.external_ids || 'null'}`);
        
        // Map skills from PHP to MongoDB format (with fallback since skills may not exist)
        const skills = this.mapSkillsFromPhp(phpEmployee.skills || [], phpEmployee);
        
        // Find or create a user for this employee
        let user = await this.userModel.findOne({ email: phpEmployee.email });
        if (!user && phpEmployee.user_id) {
          user = await this.userModel.create({
            email: phpEmployee.email,
            name: phpEmployee.name,
            role: this.mapPhpRoleToMongoRole(phpEmployee.role?.name || 'staff'),
            external_ids: {
              venueBoostId: String(phpEmployee.user_id)
            }
          });
          logs.push(`Created new user for employee: ${user._id}`);
        } else if (user) {
          logs.push(`Found existing user: ${user._id}`);
        }
        
        if (staffProfile) {
          // Update existing staff profile
          await staffProfile.updateOne({
            name: phpEmployee.name,
            email: phpEmployee.email,
            role: phpEmployee.role?.name || 'staff',
            department: phpEmployee.department?.name,
            skills,
            userId: user?._id,
            businessId,
            metadata: {
              ...staffProfile.metadata,
              lastSyncedAt: new Date(),
              status: phpEmployee.status,
              custom_role: phpEmployee.custom_role
            }
          });
          syncSummary.updated++;
          logs.push(`Updated existing staff profile: ${staffProfile._id}`);

          // Check if PHP employee needs external ID update
          let externalIds = {};
          if (phpEmployee.external_ids) {
            if (typeof phpEmployee.external_ids === 'string') {
              externalIds = JSON.parse(phpEmployee.external_ids);
            } else {
              externalIds = phpEmployee.external_ids; // Already an object
            }
          }
          
          // Check for BOTH possible property names
          // @ts-ignore
          const hasOmnistackId = externalIds.omnistackId || externalIds.omniStackGateway;
          const needsUpdate = !hasOmnistackId;
          
          logs.push(`External IDs object: ${JSON.stringify(externalIds)}`);
          // @ts-ignore
          logs.push(`Has omnistackId: ${!!externalIds.omnistackId}`);
          // @ts-ignore
          logs.push(`Has omniStackGateway: ${!!externalIds.omniStackGateway}`);
          logs.push(`PHP employee needs external ID update: ${needsUpdate}`);
                    
          if (needsUpdate) {
            logs.push(`Calling updateEmployeeExternalId(${phpEmployee.id}, ${staffProfile._id.toString()})`);
            const updateSuccess = await this.updateEmployeeExternalId(phpEmployee.id, staffProfile._id.toString());
            logs.push(`External ID update result: ${updateSuccess ? 'SUCCESS' : 'FAILED'}`);
            
            if (updateSuccess) {
              syncSummary.externalIdUpdates++;
            } else {
              syncSummary.externalIdFailures++;
            }
          }
        } else {
          // Create new staff profile
          staffProfile = await this.staffProfileModel.create({
            name: phpEmployee.name,
            email: phpEmployee.email,
            role: phpEmployee.role?.name || 'staff',
            department: phpEmployee.department?.name,
            skills,
            currentWorkload: 0, // Start with no workload
            userId: user?._id,
            businessId,
            externalIds: {
              venueBoostId: String(phpEmployee.id)
            },
            metadata: {
              status: phpEmployee.status,
              custom_role: phpEmployee.custom_role,
              lastSyncedAt: new Date()
            }
          });
          syncSummary.added++;
          logs.push(`Created new staff profile: ${staffProfile._id}`);

          // Update PHP employee with the new StaffProfile ID
          logs.push(`Calling updateEmployeeExternalId(${phpEmployee.id}, ${staffProfile._id.toString()})`);
          const updateSuccess = await this.updateEmployeeExternalId(phpEmployee.id, staffProfile._id.toString());
          logs.push(`External ID update result: ${updateSuccess ? 'SUCCESS' : 'FAILED'}`);
          
          if (updateSuccess) {
            syncSummary.externalIdUpdates++;
          } else {
            syncSummary.externalIdFailures++;
          }
        }
      } catch (employeeError) {
        const errorMsg = `Failed to sync employee ${phpEmployee.id}: ${employeeError.message}`;
        logs.push(`ERROR: ${errorMsg}`);
        this.logger.error(errorMsg);
        syncSummary.failed++;
      }
    }
    
    const totalSynced = syncSummary.added + syncSummary.updated;
    
    // Update the job record on completion
    const endTime = new Date();
    const duration = (endTime.getTime() - startTime.getTime()) / 1000;
    
    await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
      endTime,
      duration,
      status: 'completed',
      syncSummary,
      targetCount: venueBoostEmployees.length,
      processedCount: totalSynced,
      details: { 
        businessId,
        employeeCount: venueBoostEmployees.length,
        added: syncSummary.added,
        updated: syncSummary.updated,
        failed: syncSummary.failed,
        externalIdUpdates: syncSummary.externalIdUpdates,
        externalIdFailures: syncSummary.externalIdFailures
      }
    });
    
    const completionMsg = `[SYNC COMPLETE] Successfully synced ${totalSynced} employees for business ${businessId}. External ID updates: ${syncSummary.externalIdUpdates}, failures: ${syncSummary.externalIdFailures}`;
    logs.push(completionMsg);
    this.logger.log(completionMsg);
    
    return {
      totalSynced,
      logs,
      summary: syncSummary
    };
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
    
    const errorMsg = `[SYNC FAILED] Error syncing employees from VenueBoost: ${error.message}`;
    logs.push(`ERROR: ${errorMsg}`);
    this.logger.error(errorMsg, error.stack);
    
    throw {
      message: error.message,
      logs,
      stack: error.stack
    };
  }
}
  
  /**
   * Map employee skills from PHP format to MongoDB format
   * Enhanced to handle case where skills might not exist in PHP
   */
  private mapSkillsFromPhp(phpSkills: any[], phpEmployee: any): Record<string, any> {
    const skills: Record<string, any> = {};
    
    // Handle skills from the skills array (if it exists)
    if (phpSkills && Array.isArray(phpSkills)) {
      for (const skill of phpSkills) {
        skills[skill.name] = {
          level: this.mapPhpSkillLevelToMongoLevel(skill.level),
          lastUsed: skill.last_used ? new Date(skill.last_used) : null,
          yearsExperience: skill.years_experience || 0
        };
      }
    }
    
    // Fallback: Infer skills from role and department if no explicit skills
    if (Object.keys(skills).length === 0) {
      const inferredSkills = this.inferSkillsFromRoleAndDepartment(phpEmployee);
      Object.assign(skills, inferredSkills);
    }
    
    return skills;
  }

  /**
   * Infer skills based on employee role and department when explicit skills are not available
   */
  private inferSkillsFromRoleAndDepartment(phpEmployee: any): Record<string, any> {
    const skills: Record<string, any> = {};
    const roleName = phpEmployee.role?.name?.toLowerCase() || '';
    const departmentName = phpEmployee.department?.name?.toLowerCase() || '';

    // Role-based skill inference
    switch (roleName) {
      case 'owner':
      case 'manager':
        skills['Leadership'] = { level: SkillLevel.ADVANCED, yearsExperience: 2, lastUsed: new Date() };
        skills['Team Management'] = { level: SkillLevel.ADVANCED, yearsExperience: 2, lastUsed: new Date() };
        skills['Decision Making'] = { level: SkillLevel.ADVANCED, yearsExperience: 2, lastUsed: new Date() };
        break;
      case 'team leader':
      case 'operations manager':
        skills['Team Coordination'] = { level: SkillLevel.INTERMEDIATE, yearsExperience: 1, lastUsed: new Date() };
        skills['Problem Solving'] = { level: SkillLevel.INTERMEDIATE, yearsExperience: 1, lastUsed: new Date() };
        break;
      case 'staff':
      default:
        skills['Task Execution'] = { level: SkillLevel.INTERMEDIATE, yearsExperience: 1, lastUsed: new Date() };
        skills['Communication'] = { level: SkillLevel.INTERMEDIATE, yearsExperience: 1, lastUsed: new Date() };
        break;
    }

    // Department-based skill inference
    switch (departmentName) {
      case 'kitchen':
      case 'culinary':
        skills['Food Preparation'] = { level: SkillLevel.INTERMEDIATE, yearsExperience: 1, lastUsed: new Date() };
        skills['Food Safety'] = { level: SkillLevel.INTERMEDIATE, yearsExperience: 1, lastUsed: new Date() };
        break;
      case 'service':
      case 'front of house':
        skills['Customer Service'] = { level: SkillLevel.INTERMEDIATE, yearsExperience: 1, lastUsed: new Date() };
        skills['POS Systems'] = { level: SkillLevel.NOVICE, yearsExperience: 0, lastUsed: new Date() };
        break;
      case 'bar':
      case 'beverage':
        skills['Bartending'] = { level: SkillLevel.INTERMEDIATE, yearsExperience: 1, lastUsed: new Date() };
        skills['Drink Preparation'] = { level: SkillLevel.INTERMEDIATE, yearsExperience: 1, lastUsed: new Date() };
        break;
      case 'cleaning':
      case 'maintenance':
        skills['Facility Maintenance'] = { level: SkillLevel.INTERMEDIATE, yearsExperience: 1, lastUsed: new Date() };
        skills['Equipment Care'] = { level: SkillLevel.INTERMEDIATE, yearsExperience: 1, lastUsed: new Date() };
        break;
      default:
        // Add general hospitality skills
        skills['Hospitality'] = { level: SkillLevel.INTERMEDIATE, yearsExperience: 1, lastUsed: new Date() };
        break;
    }

    return skills;
  }
  
  /**
   * Map PHP skill level to MongoDB SkillLevel enum
   */
  private mapPhpSkillLevelToMongoLevel(phpLevel: string): SkillLevel {
    switch ((phpLevel || '').toLowerCase()) {
      case 'expert':
        return SkillLevel.EXPERT;
      case 'advanced':
        return SkillLevel.ADVANCED;
      case 'intermediate':
        return SkillLevel.INTERMEDIATE;
      case 'novice':
      default:
        return SkillLevel.NOVICE;
    }
  }
  
  /**
   * Map PHP role to MongoDB role
   */
  private mapPhpRoleToMongoRole(phpRole: string): string {
    switch (phpRole.toLowerCase()) {
      case 'team leader':
        return 'team_leader';
      case 'operations manager':
        return 'operations_manager';
      case 'manager':
        return 'manager';
      case 'owner':
        return 'owner';
      default:
        return 'staff';
    }
  }
  
  /**
   * Update employee workload based on assigned tasks
   */
  async updateEmployeeWorkload(userId: string): Promise<boolean> {
    try {
      const staffProfile = await this.staffProfileModel.findOne({ userId });
      if (!staffProfile) {
        throw new Error(`Staff profile for user ${userId} not found`);
      }
      
      // Count active tasks assigned to this user
      const activeTaskCount = await this.taskAssignmentModel.countDocuments({
        assignedUserId: userId,
        status: { $in: [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS] }
      });
      
      // Update workload
      await staffProfile.updateOne({ currentWorkload: activeTaskCount });
      
      return true;
    } catch (error) {
      this.logger.error(`Error updating employee workload: ${error.message}`, error.stack);
      return false;
    }
  }
  
  /**
   * Scheduled job to sync employees from VenueBoost for all businesses
   */
  @Cron(CronExpression.EVERY_4_HOURS)
  async scheduledEmployeeSync() {
    const startTime = new Date();
    this.logger.log(`[CRON START] Employee sync job started at ${startTime.toISOString()}`);
    
    // Create a record for this job execution
    const jobRecord = await this.cronJobHistoryModel.create({
      jobName: 'scheduledEmployeeSync',
      startTime,
      status: 'started'
    });
    
    try {
      // Find all businesses with VenueBoost connection
      const businesses = await this.businessModel.find({
        'externalIds.staffluentId': { $exists: true, $ne: null }
      });
      
      const syncSummary = {
        added: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        externalIdUpdates: 0,
        externalIdFailures: 0
      };
      
      const businessResults = [];
      
      for (const business of businesses) {
        try {
          const syncResult = await this.syncEmployeesFromVenueBoost(business.id);
          
          businessResults.push({
            businessId: business.id,
            businessName: business.name,
            employeesSynced: syncResult.totalSynced,
            success: true
          });
        } catch (error) {
          this.logger.error(`Error syncing employees for business ${business.id}: ${error.message}`);
          
          businessResults.push({
            businessId: business.id,
            businessName: business.name,
            error: error.message,
            success: false
          });
          
          syncSummary.failed++;
        }
      }
      
      // Update the job record on completion
      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000;
      
      await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
        endTime,
        duration,
        status: 'completed',
        businessIds: businesses.map(b => b.id),
        targetCount: businesses.length,
        processedCount: businesses.length - syncSummary.failed,
        failedCount: syncSummary.failed,
        syncSummary,
        details: { 
          businessResults,
          totalBusinesses: businesses.length
        }
      });
      
      this.logger.log(`[CRON COMPLETE] Employee sync job completed at ${endTime.toISOString()}, duration: ${duration}s, processed ${businesses.length} businesses`);
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
      
      this.logger.error(`[CRON FAILED] Error in employee sync job: ${error.message}`, error.stack);
    }
  }

  /**
   * Manual sync trigger for a specific business
   */
  async triggerManualSync(businessId: string): Promise<{
    success: boolean;
    message: string;
    syncedCount?: number;
    externalIdUpdates?: number;
    logs?: string[];
    summary?: any;
  }> {
    try {
      const syncResult = await this.syncEmployeesFromVenueBoost(businessId);
      return {
        success: true,
        message: `Successfully synced ${syncResult.totalSynced} employees`,
        syncedCount: syncResult.totalSynced,
        externalIdUpdates: syncResult.summary.externalIdUpdates,
        logs: syncResult.logs,
        summary: syncResult.summary
      };
    } catch (error) {
      this.logger.error(`Manual sync failed for business ${businessId}: ${error.message}`);
      return {
        success: false,
        message: `Sync failed: ${error.message}`,
        logs: error.logs || [`Error: ${error.message}`]
      };
    }
  }
}