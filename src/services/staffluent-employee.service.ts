// src/services/staffluent-employee.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { 
  StaffProfile, 
  SkillLevel, 
  SkillSource, 
  SkillData, 
  WorkExperience, 
  ExperienceType 
} from '../schemas/staff-profile.schema';
import { Business, BusinessIndustry, BusinessSubCategory } from '../schemas/business.schema';
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

      logs.push(`Found business: ${business.name}, Industry: ${business.industry || 'Not Set'}, VenueBoost ID: ${business.externalIds.venueBoostId}`);

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
          
          // Calculate experience metrics
          const experienceMetrics = this.calculateExperienceMetrics(phpEmployee);
          logs.push(`Experience metrics - Tenure: ${experienceMetrics.currentTenureMonths} months, Industry: ${experienceMetrics.industryExperienceMonths} months`);
          
          // Map skills from PHP to MongoDB format with business context
          const skills = await this.mapSkillsFromPhp(phpEmployee.skills || [], phpEmployee, business);
          logs.push(`Mapped ${Object.keys(skills).length} skills for employee`);
          
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
            // Update existing staff profile with enhanced data
            await staffProfile.updateOne({
              name: phpEmployee.name,
              email: phpEmployee.email,
              role: phpEmployee.role?.name || 'staff',
              department: phpEmployee.department?.name,
              hireDate: phpEmployee.hire_date ? new Date(phpEmployee.hire_date) : staffProfile.hireDate,
              skills,
              currentTenureMonths: experienceMetrics.currentTenureMonths,
              totalWorkExperienceMonths: experienceMetrics.totalWorkExperienceMonths,
              industryExperienceMonths: experienceMetrics.industryExperienceMonths,
              userId: user?._id,
              businessId,
              performanceMetrics: {
                ...(staffProfile.performanceMetrics || {}),
                tasksCompleted: phpEmployee.stats?.completed_tasks || 0,
                tasksOnTime: phpEmployee.stats?.tasks_on_time || 0,
                averageTaskRating: phpEmployee.performance || 0,
                lastPerformanceReview: new Date()
              },
              metadata: {
                ...staffProfile.metadata,
                lastSyncedAt: new Date(),
                status: phpEmployee.status,
                custom_role: phpEmployee.custom_role,
                phpEmployeeId: phpEmployee.id,
                syncSource: 'php_staffluent'
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
                externalIds = phpEmployee.external_ids;
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
            // Create new staff profile with enhanced data
            staffProfile = await this.staffProfileModel.create({
              name: phpEmployee.name,
              email: phpEmployee.email,
              role: phpEmployee.role?.name || 'staff',
              department: phpEmployee.department?.name,
              hireDate: phpEmployee.hire_date ? new Date(phpEmployee.hire_date) : new Date(),
              skills,
              currentTenureMonths: experienceMetrics.currentTenureMonths,
              totalWorkExperienceMonths: experienceMetrics.totalWorkExperienceMonths,
              industryExperienceMonths: experienceMetrics.industryExperienceMonths,
              workExperience: this.createWorkExperienceFromPhp(phpEmployee,business),
              certifications: [],
              specializations: [],
              currentWorkload: 0,
              taskCompletionRate: phpEmployee.stats?.completed_tasks || 0,
              averageRating: phpEmployee.performance || 0,
              performanceMetrics: {
                tasksCompleted: phpEmployee.stats?.completed_tasks || 0,
                tasksOnTime: phpEmployee.stats?.tasks_on_time || 0,
                averageTaskRating: phpEmployee.performance || 0,
                customerFeedbackScore: 0,
                peerRatingAverage: 0,
                improvementAreas: [],
                strengths: [],
                lastPerformanceReview: new Date()
              },
              userId: user?._id,
              businessId,
              externalIds: {
                venueBoostId: String(phpEmployee.id)
              },
              preferences: {
                skillSharingOptIn: true,
                receiveSkillRecommendations: true,
                allowPeerReviews: true,
                allowSelfAssessment: true,
                notifyOnSkillDecay: true,
                preferredLearningStyle: 'visual'
              },
              metadata: {
                status: phpEmployee.status,
                custom_role: phpEmployee.custom_role,
                lastSyncedAt: new Date(),
                phpEmployeeId: phpEmployee.id,
                syncSource: 'php_staffluent',
                createdViaSync: true
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
   * Calculate experience metrics from PHP employee data
   */
  private calculateExperienceMetrics(phpEmployee: any): {
    currentTenureMonths: number;
    totalWorkExperienceMonths: number;
    industryExperienceMonths: number;
  } {
    const hireDate = phpEmployee.hire_date ? new Date(phpEmployee.hire_date) : new Date();
    const now = new Date();
    
    // Calculate current tenure in months
    const currentTenureMonths = Math.max(0, Math.floor((now.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
    
    // For now, use tenure as total experience (can be enhanced with actual work history)
    const totalWorkExperienceMonths = currentTenureMonths;
    
    // Assume industry experience equals current tenure (can be enhanced with industry-specific logic)
    const industryExperienceMonths = currentTenureMonths;
    
    return {
      currentTenureMonths,
      totalWorkExperienceMonths,
      industryExperienceMonths
    };
  }

  /**
   * Create work experience entry from PHP employee data
   */
  private createWorkExperienceFromPhp(phpEmployee: any, business: Business): WorkExperience[] {
    if (!phpEmployee.hire_date) return [];
    
    const hireDate = new Date(phpEmployee.hire_date);
    const now = new Date();
    const durationMonths = Math.floor((now.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
    
    return [{
      companyName: business.name,
      position: phpEmployee.role?.name || 'Staff',
      industry: business.industry,
      startDate: hireDate,
      durationMonths,
      type: ExperienceType.FULL_TIME,
      responsibilities: [],
      skillsGained: [],
      verified: true
    }];
  }
  
  /**
   * Enhanced skill mapping from PHP format to MongoDB SkillData format
   */
  private async mapSkillsFromPhp(
    phpSkills: any[], 
    phpEmployee: any, 
    business: Business
  ): Promise<Record<string, SkillData>> {
    const skills: Record<string, SkillData> = {};
    
    // Handle explicit skills from PHP (if they exist)
    if (phpSkills && Array.isArray(phpSkills)) {
      for (const skill of phpSkills) {
        skills[skill.name] = {
          level: this.mapPhpSkillLevelToMongoLevel(skill.level),
          yearsExperience: skill.years_experience || 0,
          monthsExperience: (skill.years_experience || 0) * 12,
          lastUsed: skill.last_used ? new Date(skill.last_used) : new Date(),
          source: SkillSource.MANUAL,
          confidence: 85, // High confidence for explicit skills
          verified: false,
          performanceRating: phpEmployee.performance || 0,
          notes: 'Imported from PHP system'
        };
      }
    }
    
    // Fallback: Infer skills from role, department, and business context
    if (Object.keys(skills).length === 0) {
      const inferredSkills = await this.inferSkillsFromBusinessContext(phpEmployee, business);
      Object.assign(skills, inferredSkills);
    }
    
    return skills;
  }

  /**
   * Enhanced skill inference based on business context, role, and department
   */
  private async inferSkillsFromBusinessContext(
    phpEmployee: any, 
    business: Business
  ): Promise<Record<string, SkillData>> {
    const skills: Record<string, SkillData> = {};
    const roleName = phpEmployee.role?.name?.toLowerCase() || '';
    const departmentName = phpEmployee.department?.name?.toLowerCase() || '';
    const businessIndustry = business.industry || BusinessIndustry.OTHER;
    const businessSubCategory = business.subCategory || BusinessSubCategory.OTHER;
    
    // Calculate experience-based adjustments
    const experienceMetrics = this.calculateExperienceMetrics(phpEmployee);
    const experienceMultiplier = this.calculateExperienceMultiplier(experienceMetrics.currentTenureMonths);
    const performanceMultiplier = this.calculatePerformanceMultiplier(phpEmployee.performance || 0);
    
    // Base skill level calculation
    const baseLevel = this.calculateBaseSkillLevel(experienceMultiplier, performanceMultiplier);
    const baseExperience = Math.max(1, Math.floor(experienceMetrics.currentTenureMonths / 12));
    
    // Role-based skill inference
    const roleSkills = this.getRoleBasedSkills(roleName, baseLevel, baseExperience);
    Object.assign(skills, roleSkills);
    
    // Industry-specific skill inference
    const industrySkills = this.getIndustryBasedSkills(businessIndustry, businessSubCategory, departmentName, baseLevel, baseExperience);
    Object.assign(skills, industrySkills);
    
    // Department-specific skill inference (FIXED: pass business object, add await)
    if (departmentName) {
      const departmentSkills = await this.getDepartmentBasedSkills(departmentName, business, baseLevel, baseExperience);
      Object.assign(skills, departmentSkills);
    }
    
    // Add soft skills based on role level
    const softSkills = this.getSoftSkills(roleName, baseLevel, baseExperience);
    Object.assign(skills, softSkills);
    
    return skills;
  }

  /**
   * Calculate experience multiplier (0.5 to 2.0)
   */
  private calculateExperienceMultiplier(tenureInMonths: number): number {
    if (tenureInMonths < 3) return 0.5;      // New employee
    if (tenureInMonths < 12) return 0.8;     // Less than 1 year
    if (tenureInMonths < 24) return 1.0;     // 1-2 years
    if (tenureInMonths < 60) return 1.3;     // 2-5 years
    return 1.5;                              // 5+ years
  }

  /**
   * Calculate performance multiplier (0.7 to 1.3)
   */
  private calculatePerformanceMultiplier(performance: number): number {
    if (performance === 0) return 1.0;       // No performance data
    if (performance < 30) return 0.7;        // Low performance
    if (performance < 70) return 1.0;        // Average performance
    return 1.2;                              // High performance
  }

  /**
   * Calculate base skill level from multipliers
   */
  private calculateBaseSkillLevel(experienceMultiplier: number, performanceMultiplier: number): SkillLevel {
    const combined = experienceMultiplier * performanceMultiplier;
    
    if (combined >= 1.5) return SkillLevel.ADVANCED;
    if (combined >= 1.0) return SkillLevel.INTERMEDIATE;
    return SkillLevel.NOVICE;
  }

  /**
   * Get role-based skills
   */
  private getRoleBasedSkills(roleName: string, baseLevel: SkillLevel, baseExperience: number): Record<string, SkillData> {
    const skills: Record<string, SkillData> = {};

    switch (roleName) {
      case 'owner':
      case 'manager':
        skills['Leadership'] = this.createSkillData(SkillLevel.ADVANCED, baseExperience + 1, SkillSource.INFERRED);
        skills['Team Management'] = this.createSkillData(SkillLevel.ADVANCED, baseExperience + 1, SkillSource.INFERRED);
        skills['Decision Making'] = this.createSkillData(SkillLevel.ADVANCED, baseExperience + 1, SkillSource.INFERRED);
        skills['Strategic Planning'] = this.createSkillData(SkillLevel.INTERMEDIATE, baseExperience, SkillSource.INFERRED);
        skills['Financial Management'] = this.createSkillData(SkillLevel.INTERMEDIATE, baseExperience, SkillSource.INFERRED);
        break;
        
      case 'team leader':
      case 'operations manager':
        skills['Team Coordination'] = this.createSkillData(SkillLevel.INTERMEDIATE, baseExperience, SkillSource.INFERRED);
        skills['Problem Solving'] = this.createSkillData(SkillLevel.INTERMEDIATE, baseExperience, SkillSource.INFERRED);
        skills['Process Optimization'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        skills['Quality Control'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        break;
        
      case 'staff':
      default:
        skills['Task Execution'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        skills['Communication'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        skills['Time Management'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        break;
    }

    return skills;
  }

  /**
   * Get industry-based skills
   */
  private getIndustryBasedSkills(
    industry: BusinessIndustry, 
    subCategory: BusinessSubCategory, 
    department: string, 
    baseLevel: SkillLevel, 
    baseExperience: number
  ): Record<string, SkillData> {
    const skills: Record<string, SkillData> = {};

    switch (industry) {
      case BusinessIndustry.RESTAURANT:
        skills['Food Safety'] = this.createSkillData(SkillLevel.INTERMEDIATE, baseExperience, SkillSource.INFERRED);
        skills['Customer Service'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        skills['Menu Knowledge'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        
        // Sub-category specific skills
        if (subCategory === BusinessSubCategory.FINE_DINING) {
          skills['Wine Knowledge'] = this.createSkillData(SkillLevel.INTERMEDIATE, baseExperience, SkillSource.INFERRED);
          skills['Fine Dining Service'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        } else if (subCategory === BusinessSubCategory.FAST_FOOD) {
          skills['Speed of Service'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
          skills['Order Accuracy'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        }
        break;
        
      case BusinessIndustry.HOTEL:
        skills['Hospitality'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        skills['Guest Relations'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        skills['Reservation Systems'] = this.createSkillData(SkillLevel.NOVICE, Math.max(1, baseExperience - 1), SkillSource.INFERRED);
        break;
        
      case BusinessIndustry.RETAIL:
        skills['Sales Techniques'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        skills['Product Knowledge'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        skills['Inventory Management'] = this.createSkillData(SkillLevel.NOVICE, Math.max(1, baseExperience - 1), SkillSource.INFERRED);
        break;
        
      default:
        skills['Customer Relations'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        break;
    }

    return skills;
  }

  /**
   * Get department-based skills
   */
  private getLegacyDepartmentBasedSkills(
    department: string, 
    industry: BusinessIndustry, 
    baseLevel: SkillLevel, 
    baseExperience: number
  ): Record<string, SkillData> {
    const skills: Record<string, SkillData> = {};

    switch (department) {
      case 'kitchen':
      case 'culinary':
        skills['Food Preparation'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        skills['Kitchen Equipment'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        skills['Portion Control'] = this.createSkillData(SkillLevel.NOVICE, Math.max(1, baseExperience - 1), SkillSource.INFERRED);
        break;
        
      case 'service':
      case 'front of house':
        skills['Table Service'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        skills['POS Systems'] = this.createSkillData(SkillLevel.NOVICE, Math.max(1, baseExperience - 1), SkillSource.INFERRED);
        skills['Upselling'] = this.createSkillData(SkillLevel.NOVICE, Math.max(1, baseExperience - 1), SkillSource.INFERRED);
        break;
        
      case 'bar':
      case 'beverage':
        skills['Bartending'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        skills['Drink Preparation'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        skills['Inventory Control'] = this.createSkillData(SkillLevel.NOVICE, Math.max(1, baseExperience - 1), SkillSource.INFERRED);
        break;
        
      case 'cleaning':
      case 'maintenance':
        skills['Facility Maintenance'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        skills['Equipment Care'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        skills['Safety Protocols'] = this.createSkillData(SkillLevel.INTERMEDIATE, baseExperience, SkillSource.INFERRED);
        break;
        
      default:
        // General department skills based on industry
        if (industry === BusinessIndustry.RESTAURANT) {
          skills['Hospitality'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
        }
        break;
    }

    return skills;
  }

  /**
 * Get department-based skills using business configuration
 */
private async getDepartmentBasedSkills(
  departmentName: string, 
  business: Business,
  baseLevel: SkillLevel, 
  baseExperience: number
): Promise<Record<string, SkillData>> {
  const skills: Record<string, SkillData> = {};

  try {
    // Find the department in business configuration
    const department = business.departments?.find(
      (dept: any) => dept.name.toLowerCase() === departmentName.toLowerCase()
    );

    if (department) {
      // Use department-specific skill requirements
      const dept = department as any;
      
      // Add required skills with higher proficiency
      if (dept.requiredSkills?.length > 0) {
        dept.requiredSkills.forEach((skillName: string) => {
          const weight = dept.skillWeights?.[skillName] || 5;
          const adjustedLevel = this.adjustSkillLevelByWeight(baseLevel, weight);
          const adjustedExperience = Math.max(baseExperience, weight >= 8 ? baseExperience + 1 : baseExperience);
          
          skills[skillName] = this.createSkillData(
            adjustedLevel, 
            adjustedExperience, 
            SkillSource.INFERRED,
            85 // High confidence for required skills
          );
        });
      }

      // Add optional skills with standard proficiency
      if (dept.optionalSkills?.length > 0) {
        dept.optionalSkills.forEach((skillName: string) => {
          if (!skills[skillName]) { // Don't override required skills
            const weight = dept.skillWeights?.[skillName] || 3;
            const adjustedLevel = this.adjustSkillLevelByWeight(baseLevel, weight);
            
            skills[skillName] = this.createSkillData(
              adjustedLevel, 
              Math.max(1, baseExperience - 1), 
              SkillSource.INFERRED,
              65 // Lower confidence for optional skills
            );
          }
        });
      }

      this.logger.log(`Applied department-specific skills for ${departmentName}: ${Object.keys(skills).length} skills`);
    } else {
      // Fallback to legacy department-based inference if no department config found
      this.logger.warn(`No department configuration found for ${departmentName}, using fallback inference`);
      return this.getLegacyDepartmentBasedSkills(departmentName, business.industry, baseLevel, baseExperience);
    }
  } catch (error) {
    this.logger.error(`Error getting department skills for ${departmentName}: ${error.message}`);
    // Fallback to legacy method on error
    return this.getLegacyDepartmentBasedSkills(departmentName, business.industry, baseLevel, baseExperience);
  }

  return skills;
}

// STEP 3: ADD these new helper methods
/**
 * Adjust skill level based on weight (1-10 scale)
 */
private adjustSkillLevelByWeight(baseLevel: SkillLevel, weight: number): SkillLevel {
  if (weight >= 8) {
    // High importance - upgrade skill level
    switch (baseLevel) {
      case SkillLevel.NOVICE: return SkillLevel.INTERMEDIATE;
      case SkillLevel.INTERMEDIATE: return SkillLevel.ADVANCED;
      case SkillLevel.ADVANCED: return SkillLevel.EXPERT;
      default: return SkillLevel.EXPERT;
    }
  } else if (weight <= 3) {
    // Low importance - downgrade skill level
    switch (baseLevel) {
      case SkillLevel.EXPERT: return SkillLevel.ADVANCED;
      case SkillLevel.ADVANCED: return SkillLevel.INTERMEDIATE;
      case SkillLevel.INTERMEDIATE: return SkillLevel.NOVICE;
      default: return SkillLevel.NOVICE;
    }
  }
  
  // Medium importance - keep base level
  return baseLevel;
}
  /**
   * Get soft skills based on role
   */
  private getSoftSkills(roleName: string, baseLevel: SkillLevel, baseExperience: number): Record<string, SkillData> {
    const skills: Record<string, SkillData> = {};

    // Universal soft skills
    skills['Communication'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
    skills['Teamwork'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
    skills['Adaptability'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);

    // Role-specific soft skills
    if (['owner', 'manager', 'team leader'].includes(roleName)) {
      skills['Conflict Resolution'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
      skills['Delegation'] = this.createSkillData(baseLevel, baseExperience, SkillSource.INFERRED);
    }

    return skills;
  }

  /**
   * Helper method to create SkillData objects
   */
  private createSkillData(
    level: SkillLevel, 
    yearsExperience: number, 
    source: SkillSource, 
    confidence: number = 70
  ): SkillData {
    return {
      level,
      yearsExperience: Math.max(0, yearsExperience),
      monthsExperience: Math.max(0, yearsExperience * 12),
      lastUsed: new Date(),
      source,
      confidence,
      verified: false,
      notes: 'Auto-inferred based on role and business context'
    };
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
    externalIdFailures?: number;
    logs: string[];
    summary?: any;
  }> {
    try {
      const syncResult = await this.syncEmployeesFromVenueBoost(businessId);
      return {
        success: true,
        message: `Successfully synced ${syncResult.totalSynced} employees. External ID updates: ${syncResult.summary.externalIdUpdates}, failures: ${syncResult.summary.externalIdFailures}`,
        syncedCount: syncResult.totalSynced,
        externalIdUpdates: syncResult.summary.externalIdUpdates,
        externalIdFailures: syncResult.summary.externalIdFailures,
        logs: syncResult.logs,
        summary: syncResult.summary
      };
    } catch (error) {
      this.logger.error(`Manual sync failed for business ${businessId}: ${error.message}`);
      
      // Handle both regular errors and our custom error objects with logs
      const logs = error.logs || [`ERROR: Manual sync failed for business ${businessId}: ${error.message}`];
      
      return {
        success: false,
        message: `Sync failed: ${error.message}`,
        logs: logs,
        syncedCount: 0,
        externalIdUpdates: 0,
        externalIdFailures: 0
      };
    }
  }
}