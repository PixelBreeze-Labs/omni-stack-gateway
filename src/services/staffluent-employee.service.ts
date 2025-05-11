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

@Injectable()
export class StaffluentEmployeeService {
  private readonly logger = new Logger(StaffluentEmployeeService.name);

  constructor(
    @InjectModel(StaffProfile.name) private staffProfileModel: Model<StaffProfile>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(TaskAssignment.name) private taskAssignmentModel: Model<TaskAssignment>,
    private readonly venueBoostService: VenueBoostService,
  ) {}

  /**
   * Sync employees from Staffluent to NestJS for a specific business
   */
  async syncEmployeesFromStaffluent(businessId: string): Promise<number> {
    try {
      this.logger.log(`Syncing employees from Staffluent for business: ${businessId}`);
      
      // Find the business in our system
      const business = await this.businessModel.findById(businessId);
      if (!business || !business.externalIds?.venueBoostId) {
        throw new Error(`Business ${businessId} not found or not connected to VenueBoost`);
      }

      // Get employees from VenueBoost API
      const venueBoostEmployees = await this.venueBoostService.getEmployees(business.externalIds.venueBoostId);
      
      let syncCount = 0;
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
        }
        
        syncCount++;
      }
      
      this.logger.log(`Successfully synced ${syncCount} employees for business ${businessId}`);
      return syncCount;
    } catch (error) {
      this.logger.error(`Error syncing employees from Staffluent: ${error.message}`, error.stack);
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
   * Scheduled job to sync employees from Staffluent for all businesses
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async scheduledEmployeeSync() {
    try {
      this.logger.log('Starting scheduled employee sync for all businesses');
      
      // Find all businesses with Staffluent connection
      const businesses = await this.businessModel.find({
        'externalIds.staffluentId': { $exists: true, $ne: null }
      });
      
      let totalSynced = 0;
      for (const business of businesses) {
        try {
          const count = await this.syncEmployeesFromStaffluent(business.id);
          totalSynced += count;
        } catch (error) {
          this.logger.error(`Error syncing employees for business ${business.id}: ${error.message}`);
          // Continue with next business even if one fails
        }
      }
      
      this.logger.log(`Completed employee sync, updated ${totalSynced} employees across ${businesses.length} businesses`);
    } catch (error) {
      this.logger.error(`Error in scheduled employee sync: ${error.message}`, error.stack);
    }
  }
}