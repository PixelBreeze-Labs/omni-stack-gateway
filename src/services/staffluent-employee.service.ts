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

@Injectable()
export class StaffluentEmployeeService {
  private readonly logger = new Logger(StaffluentEmployeeService.name);

  constructor(
    @InjectModel(StaffProfile.name) private staffProfileModel: Model<StaffProfile>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(TaskAssignment.name) private taskAssignmentModel: Model<TaskAssignment>,
    @InjectModel(CronJobHistory.name) private cronJobHistoryModel: Model<CronJobHistory>,
    private readonly venueBoostService: VenueBoostService,
  ) {}

  /**
   * Sync employees from Staffluent to NestJS for a specific business
   */
  async syncEmployeesFromVenueBoost(businessId: string): Promise<number> {
    const startTime = new Date();
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

      // Get employees from VenueBoost API
      const venueBoostEmployees = await this.venueBoostService.getEmployees(business.externalIds.venueBoostId);
      
      const syncSummary = {
        added: 0,
        updated: 0,
        skipped: 0,
        failed: 0
      };
      
      for (const phpEmployee of venueBoostEmployees) {
        // Check if employee already exists in our system
        let staffProfile = await this.staffProfileModel.findOne({
          'externalIds.venueBoostId': String(phpEmployee.id)
        });
        
        // Map skills from PHP to MongoDB format
        const skills = this.mapSkillsFromPhp(phpEmployee.skills || []);
        
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
          updated: syncSummary.updated
        }
      });
      
      this.logger.log(`[SYNC COMPLETE] Successfully synced ${totalSynced} employees for business ${businessId}`);
      return totalSynced;
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
      
      this.logger.error(`[SYNC FAILED] Error syncing employees from VenueBoost: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Map employee skills from PHP format to MongoDB format
   */
  private mapSkillsFromPhp(phpSkills: any[]): Record<string, any> {
    const skills: Record<string, any> = {};
    
    for (const skill of phpSkills) {
      skills[skill.name] = {
        level: this.mapPhpSkillLevelToMongoLevel(skill.level),
        lastUsed: skill.last_used ? new Date(skill.last_used) : null,
        yearsExperience: skill.years_experience || 0
      };
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
        failed: 0
      };
      
      const businessResults = [];
      
      for (const business of businesses) {
        try {
          const count = await this.syncEmployeesFromVenueBoost(business.id);
          
          businessResults.push({
            businessId: business.id,
            businessName: business.name,
            employeesSynced: count,
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
}