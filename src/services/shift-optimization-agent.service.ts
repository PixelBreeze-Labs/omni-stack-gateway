// src/services/shift-optimization-agent.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { StaffProfile } from '../schemas/staff-profile.schema';
import { TaskAssignment } from '../schemas/task-assignment.schema';
import { ShiftPattern } from '../schemas/shift-pattern.schema';
import { ShiftOptimizationReport } from '../schemas/shift-optimization-report.schema';
import { User } from '../schemas/user.schema';
import { Business } from '../schemas/business.schema';
import { AgentConfiguration } from '../schemas/agent-configuration.schema';
import { AgentPermissionService } from './agent-permission.service';
import { EmailService } from './email.service';
import { OptimizationStrategy } from '../enums/optimization.enum';
import { ForecastConfidence } from '../enums/optimization.enum';
import { CronJob } from 'cron';
import { 
  format, 
  addDays, 
  subDays, 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  differenceInDays,
  differenceInHours,
  isSameDay,
  parseISO 
} from 'date-fns';


// Define the confidence level for forecasts
export enum ForecastConfidence {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  VERY_HIGH = 'very_high'
}

@Injectable()
export class ShiftOptimizationAgentService {
  private readonly logger = new Logger(ShiftOptimizationAgentService.name);
  private businessCronJobs: Map<string, CronJob[]> = new Map();
  private readonly SYSTEM_USER_ID = '000000000000000000000000'; // System user ID for automated actions

  constructor(
    @InjectModel(StaffProfile.name) private staffProfileModel: Model<StaffProfile>,
    @InjectModel(TaskAssignment.name) private taskModel: Model<TaskAssignment>,
    @InjectModel(ShiftPattern.name) private shiftPatternModel: Model<ShiftPattern>,
    @InjectModel(ShiftOptimizationReport.name) private reportModel: Model<ShiftOptimizationReport>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(AgentConfiguration.name) private agentConfigModel: Model<AgentConfiguration>,
    private readonly agentPermissionService: AgentPermissionService,
    private readonly emailService: EmailService,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {
    // Initialize optimization for all businesses with agent enabled
    this.initializeShiftOptimization();
  }

  /**
   * Initialize shift optimization for all businesses
   */
  private async initializeShiftOptimization() {
    try {
      // Get all businesses with shift-optimization agent enabled
      const enabledBusinessIds = await this.agentConfigModel.find({
        agentType: 'shift-optimization',
        isEnabled: true
      }).distinct('businessId');
      
      for (const businessId of enabledBusinessIds) {
        await this.setupBusinessShiftOptimization(businessId);
      }
      
      this.logger.log(`Initialized shift optimization for ${enabledBusinessIds.length} businesses`);
    } catch (error) {
      this.logger.error('Failed to initialize shift optimization', error.stack);
    }
  }

  /**
   * Setup shift optimization for a specific business
   */
  private async setupBusinessShiftOptimization(businessId: string) {
    // Clear any existing jobs for this business
    this.clearBusinessJobs(businessId);
    
    // Get agent configuration
    const config = await this.agentConfigModel.findOne({
      businessId,
      agentType: 'shift-optimization'
    });
    
    if (!config || !config.isEnabled) {
      this.logger.warn(`Shift optimization agent not enabled for business ${businessId}`);
      return;
    }
    
    // Schedule weekly optimization job (default to Sunday at 1 AM)
    const weeklyOptimizationCron = config.weeklyOptimizationCron || '0 1 * * 0';
    
    const weeklyJobName = `shift-optimization-weekly-${businessId}`;
    const weeklyJob = new CronJob(weeklyOptimizationCron, () => {
      this.generateWeeklyOptimization(businessId);
    });
    
    this.schedulerRegistry.addCronJob(weeklyJobName, weeklyJob);
    weeklyJob.start();
    
    // Schedule daily forecast update job (default to midnight)
    const dailyForecastCron = config.dailyForecastCron || '0 0 * * *';
    
    const forecastJobName = `shift-forecast-${businessId}`;
    const forecastJob = new CronJob(dailyForecastCron, () => {
      this.updateWorkloadForecasts(businessId);
    });
    
    this.schedulerRegistry.addCronJob(forecastJobName, forecastJob);
    forecastJob.start();
    
    // Track jobs for this business
    this.businessCronJobs.set(businessId, [weeklyJob, forecastJob]);
    
    this.logger.log(`Setup shift optimization for business ${businessId}`);
  }

  /**
   * Clear existing cron jobs for a business
   */
  private clearBusinessJobs(businessId: string) {
    const existingJobs = this.businessCronJobs.get(businessId) || [];
    
    for (const job of existingJobs) {
      job.stop();
    }
    
    const weeklyJobName = `shift-optimization-weekly-${businessId}`;
    const forecastJobName = `shift-forecast-${businessId}`;
    
    try {
      this.schedulerRegistry.deleteCronJob(weeklyJobName);
      this.schedulerRegistry.deleteCronJob(forecastJobName);
    } catch (e) {
      // Jobs might not exist, which is fine
    }
    
    this.businessCronJobs.delete(businessId);
  }

  /**
   * Update business monitoring configuration
   */
  async updateBusinessOptimization(businessId: string) {
    return this.setupBusinessShiftOptimization(businessId);
  }

  /**
   * Generate weekly shift optimization recommendations
   */
  async generateWeeklyOptimization(businessId: string) {
    this.logger.log(`Generating weekly optimization for business ${businessId}`);
    
    try {
      // Check if agent is enabled for this business
      const hasAccess = await this.agentPermissionService.hasAgentAccess(
        businessId, 
        'shift-optimization'
      );
      
      if (!hasAccess) {
        this.logger.warn(`Shift optimization agent not enabled for business ${businessId}`);
        return;
      }
      
      // Get configuration
      const config = await this.agentConfigModel.findOne({
        businessId,
        agentType: 'shift-optimization'
      });
      
      // Get historical task data (last 8 weeks for strong patterns)
      const now = new Date();
      const startDate = subDays(now, 56); // 8 weeks
      
      const historicalTasks = await this.taskModel.find({
        businessId,
        createdAt: { $gte: startDate, $lte: now }
      });
      
      // Get all staff profiles for this business
      const staffProfiles = await this.staffProfileModel.find({
        businessId,
        isDeleted: false
      });
      
      // Get current shift patterns
      const currentShiftPatterns = await this.shiftPatternModel.find({
        businessId,
        isActive: true
      });
      
      // Generate optimization data
      const optimizationData = this.analyzeWorkloadPatterns(
        historicalTasks, 
        staffProfiles, 
        currentShiftPatterns
      );
      
      // Generate recommendations based on strategy
      const strategy = config.optimizationStrategy || OptimizationStrategy.WORKLOAD_BALANCED;
      const recommendations = this.generateRecommendations(
        optimizationData, 
        strategy, 
        currentShiftPatterns,
        staffProfiles
      );
      
      // Save optimization report
      const report = new this.reportModel({
        businessId,
        generatedDate: new Date(),
        strategy,
        reportType: 'weekly',
        historicalDataStartDate: startDate,
        historicalDataEndDate: now,
        taskCount: historicalTasks.length,
        staffCount: staffProfiles.length,
        workloadAnalysis: optimizationData,
        recommendations,
        status: 'generated'
      });
      
      await report.save();
      
      // Send notifications to managers about the new optimization report
      await this.sendOptimizationReportNotification(report, config);
      
      this.logger.log(`Generated weekly optimization report for business ${businessId}`);
      
      return report;
    } catch (error) {
      this.logger.error(`Error generating weekly optimization for business ${businessId}:`, error.stack);
    }
  }

  /**
   * Analyze workload patterns from historical data
   */
  private analyzeWorkloadPatterns(
    tasks: any[], 
    staffProfiles: any[], 
    currentShiftPatterns: any[]
  ) {
    // Initialize analysis structure
    const hourlyWorkloadByDOW = {
      0: Array(24).fill(0), // Sunday
      1: Array(24).fill(0), // Monday
      2: Array(24).fill(0), // Tuesday
      3: Array(24).fill(0), // Wednesday
      4: Array(24).fill(0), // Thursday
      5: Array(24).fill(0), // Friday
      6: Array(24).fill(0)  // Saturday
    };
    
    const staffUtilizationByDOW = {
      0: Array(24).fill([]), // Sunday
      1: Array(24).fill([]), // Monday
      2: Array(24).fill([]), // Tuesday
      3: Array(24).fill([]), // Wednesday
      4: Array(24).fill([]), // Thursday
      5: Array(24).fill([]), // Friday
      6: Array(24).fill([])  // Saturday
    };
    
    // Count tasks by hour and day of week
    for (const task of tasks) {
      const createdDate = new Date(task.createdAt);
      const dayOfWeek = createdDate.getDay();
      const hour = createdDate.getHours();
      
      // Increment task count for this time slot
      hourlyWorkloadByDOW[dayOfWeek][hour]++;
      
      // If task has assignee, track for staff utilization
      if (task.assigneeId) {
        const utilList = staffUtilizationByDOW[dayOfWeek][hour];
        if (Array.isArray(utilList)) {
          utilList.push(task.assigneeId);
        } else {
          // Initialize if not an array (happens due to JS reference behavior)
          staffUtilizationByDOW[dayOfWeek][hour] = [task.assigneeId];
        }
      }
    }
    
    // Process to get average workload and identify peaks
    const workloadSummary = {
      peakHours: [],
      lowActivityHours: [],
      averageByDayOfWeek: {},
      hourlyAverages: Array(24).fill(0),
      dailyAverages: Array(7).fill(0),
      staffUtilizationRate: {},
      peakTimes: {},
      recommendations: {}
    };
    
    // Calculate averages and identify peaks
    for (let day = 0; day < 7; day++) {
      const dailyTotal = hourlyWorkloadByDOW[day].reduce((sum, count) => sum + count, 0);
      workloadSummary.dailyAverages[day] = dailyTotal / 24;
      
      // Calculate hourly averages across all days
      for (let hour = 0; hour < 24; hour++) {
        workloadSummary.hourlyAverages[hour] += hourlyWorkloadByDOW[day][hour] / 7;
      }
      
      // Identify peak hours for this day (>150% of daily average)
      const peaksForDay = [];
      const lowsForDay = [];
      
      for (let hour = 0; hour < 24; hour++) {
        const count = hourlyWorkloadByDOW[day][hour];
        const avgForDay = workloadSummary.dailyAverages[day];
        
        if (avgForDay > 0) {
          if (count > avgForDay * 1.5) {
            peaksForDay.push({ hour, count });
          } else if (count < avgForDay * 0.5 && count > 0) {
            lowsForDay.push({ hour, count });
          }
        }
        
        // Calculate staff utilization
        const staffInHour = staffUtilizationByDOW[day][hour];
        if (Array.isArray(staffInHour) && staffInHour.length > 0) {
          const uniqueStaff = new Set(staffInHour);
          if (!workloadSummary.staffUtilizationRate[day]) {
            workloadSummary.staffUtilizationRate[day] = {};
          }
          workloadSummary.staffUtilizationRate[day][hour] = uniqueStaff.size / staffProfiles.length;
        }
      }
      
      workloadSummary.peakTimes[day] = peaksForDay;
      workloadSummary.recommendations[day] = {
        increasedStaffingHours: peaksForDay.map(p => p.hour),
        decreasedStaffingHours: lowsForDay.map(p => p.hour)
      };
    }
    
    // Identify overall peak hours
    const overallHourlyAvg = workloadSummary.hourlyAverages.reduce((sum, avg) => sum + avg, 0) / 24;
    workloadSummary.peakHours = workloadSummary.hourlyAverages
      .map((avg, hour) => ({ hour, avg }))
      .filter(h => h.avg > overallHourlyAvg * 1.3)
      .sort((a, b) => b.avg - a.avg);
    
    workloadSummary.lowActivityHours = workloadSummary.hourlyAverages
      .map((avg, hour) => ({ hour, avg }))
      .filter(h => h.avg < overallHourlyAvg * 0.7 && h.avg > 0)
      .sort((a, b) => a.avg - b.avg);
    
    return {
      hourlyWorkloadByDOW,
      staffUtilizationByDOW,
      workloadSummary
    };
  }

  /**
   * Generate shift recommendations based on workload analysis
   */
  private generateRecommendations(
    optimizationData: any,
    strategy: OptimizationStrategy,
    currentShiftPatterns: any[],
    staffProfiles: any[]
  ) {
    const { workloadSummary } = optimizationData;
    
    // Initialize recommendations structure
    const recommendations = {
      shiftAdjustments: [],
      staffingLevelChanges: [],
      forecastedNeeds: {},
      overallRecommendation: '',
      potentialSavings: null,
      potentialServiceImprovements: null
    };
    
    // Generate staffing level recommendations by day and time
    for (let day = 0; day < 7; day++) {
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
      const peakHours = workloadSummary.recommendations[day].increasedStaffingHours;
      const lowHours = workloadSummary.recommendations[day].decreasedStaffingHours;
      
      // Find applicable shift patterns for this day
      const shiftsForDay = currentShiftPatterns.filter(
        shift => shift.daysOfWeek.includes(day)
      );
      
      // Calculate current staffing by hour based on shifts
      const currentStaffingByHour = Array(24).fill(0);
      
      for (const shift of shiftsForDay) {
        const startHour = parseInt(shift.startTime.split(':')[0]);
        const endHour = parseInt(shift.endTime.split(':')[0]);
        
        // Handle shifts that span midnight
        if (endHour <= startHour) {
          // Fill from start to midnight
          for (let h = startHour; h < 24; h++) {
            currentStaffingByHour[h] += shift.staffCount;
          }
          // Fill from midnight to end
          for (let h = 0; h < endHour; h++) {
            currentStaffingByHour[h] += shift.staffCount;
          }
        } else {
          // Normal shift within same day
          for (let h = startHour; h < endHour; h++) {
            currentStaffingByHour[h] += shift.staffCount;
          }
        }
      }
      
      // Calculate optimal staffing based on strategy and workload
      const optimalStaffingByHour = this.calculateOptimalStaffing(
        optimizationData.hourlyWorkloadByDOW[day],
        strategy,
        staffProfiles.length
      );
      
      // Compare current vs optimal staffing
      for (let hour = 0; hour < 24; hour++) {
        const current = currentStaffingByHour[hour];
        const optimal = optimalStaffingByHour[hour];
        const difference = optimal - current;
        
        // Only recommend significant changes (>= 2 staff difference or >25% change)
        if (Math.abs(difference) >= 2 || (current > 0 && Math.abs(difference / current) > 0.25)) {
          const formattedHour = hour.toString().padStart(2, '0') + ':00';
          
          recommendations.staffingLevelChanges.push({
            day: dayName,
            hour: formattedHour,
            currentStaffing: current,
            recommendedStaffing: optimal,
            difference,
            reason: difference > 0 
              ? 'Historical workload indicates understaffing' 
              : 'Historical workload indicates overstaffing',
            confidenceLevel: this.calculateConfidenceLevel(
              optimizationData.hourlyWorkloadByDOW[day][hour],
              day
            )
          });
        }
      }
      
      // Generate shift adjustment recommendations
      // Look for consecutive hours with similar recommendations
      let currentSegment = null;
      
      for (let hour = 0; hour < 24; hour++) {
        const diff = optimalStaffingByHour[hour] - currentStaffingByHour[hour];
        
        // Start or continue a segment
        if (Math.abs(diff) >= 2) {
          if (!currentSegment || currentSegment.direction !== Math.sign(diff)) {
            // End previous segment if it exists
            if (currentSegment && currentSegment.endHour - currentSegment.startHour >= 2) {
              this.addShiftAdjustmentRecommendation(
                recommendations.shiftAdjustments,
                day,
                currentSegment,
                shiftsForDay
              );
            }
            
            // Start new segment
            currentSegment = {
              startHour: hour,
              endHour: hour + 1,
              direction: Math.sign(diff),
              magnitude: Math.abs(diff)
            };
          } else {
            // Continue current segment
            currentSegment.endHour = hour + 1;
            currentSegment.magnitude = Math.max(currentSegment.magnitude, Math.abs(diff));
          }
        } else if (currentSegment) {
          // End current segment
          if (currentSegment.endHour - currentSegment.startHour >= 2) {
            this.addShiftAdjustmentRecommendation(
              recommendations.shiftAdjustments,
              day,
              currentSegment,
              shiftsForDay
            );
          }
          currentSegment = null;
        }
      }
      
      // Handle segment that ends at last hour
      if (currentSegment && currentSegment.endHour - currentSegment.startHour >= 2) {
        this.addShiftAdjustmentRecommendation(
          recommendations.shiftAdjustments,
          day,
          currentSegment,
          shiftsForDay
        );
      }
    }
    
    // Calculate potential improvements based on recommendations
    let potentialHoursSaved = 0;
    let potentialServiceImprovement = 0;
    
    for (const change of recommendations.staffingLevelChanges) {
      if (change.difference < 0) {
        // Overstaffed hours that could be saved
        potentialHoursSaved += Math.abs(change.difference);
      } else {
        // Understaffed hours that could improve service
        potentialServiceImprovement += change.difference;
      }
    }
    
    // Calculate financial impact (assuming average hourly cost)
    const estimatedHourlyCost = 25; // Placeholder, should be configured per business
    recommendations.potentialSavings = {
      weeklyHours: potentialHoursSaved,
      weeklyCost: potentialHoursSaved * estimatedHourlyCost,
      monthlyCost: potentialHoursSaved * estimatedHourlyCost * 4
    };
    
    recommendations.potentialServiceImprovements = {
      additionalWeeklyStaffHours: potentialServiceImprovement,
      estimatedResponseTimeImprovement: this.calculateResponseTimeImprovement(potentialServiceImprovement),
      estimatedCustomerSatisfactionImprovement: this.calculateSatisfactionImprovement(potentialServiceImprovement)
    };
    
    // Generate overall recommendation summary
    recommendations.overallRecommendation = this.generateOverallRecommendation(
      recommendations.staffingLevelChanges,
      recommendations.shiftAdjustments,
      strategy
    );
    
    return recommendations;
  }

  /**
   * Add a shift adjustment recommendation
   */
  private addShiftAdjustmentRecommendation(
    adjustments: any[],
    day: number,
    segment: any,
    existingShifts: any[]
  ) {
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
    const formatHour = (hour) => hour.toString().padStart(2, '0') + ':00';
    
    // Determine if this overlaps with existing shifts
    const overlappingShifts = existingShifts.filter(shift => {
      const startHour = parseInt(shift.startTime.split(':')[0]);
      const endHour = parseInt(shift.endTime.split(':')[0]);
      
      // Handle shifts that span midnight
      if (endHour <= startHour) {
        return (segment.startHour >= startHour || segment.endHour <= endHour);
      } else {
        return (
          (segment.startHour >= startHour && segment.startHour < endHour) ||
          (segment.endHour > startHour && segment.endHour <= endHour) ||
          (segment.startHour <= startHour && segment.endHour >= endHour)
        );
      }
    });
    
    if (segment.direction > 0) {
      // Understaffed - need more staff
      if (overlappingShifts.length > 0) {
        // Recommend increasing staff for existing shifts
        adjustments.push({
          day: dayName,
          startTime: formatHour(segment.startHour),
          endTime: formatHour(segment.endHour),
          adjustmentType: 'increase_staff',
          staffChange: segment.magnitude,
          affectedShifts: overlappingShifts.map(s => ({
            id: s._id,
            name: s.name,
            currentStaff: s.staffCount
          })),
          reason: `Consistently understaffed during this period based on historical workload`
        });
      } else {
        // Recommend new shift
        adjustments.push({
          day: dayName,
          startTime: formatHour(segment.startHour),
          endTime: formatHour(segment.endHour),
          adjustmentType: 'new_shift',
          recommendedStaff: segment.magnitude,
          reason: `No coverage during high workload period`
        });
      }
    } else {
      // Overstaffed - need fewer staff
      if (overlappingShifts.length > 0) {
        // Recommend decreasing staff for existing shifts
        adjustments.push({
          day: dayName,
          startTime: formatHour(segment.startHour),
          endTime: formatHour(segment.endHour),
          adjustmentType: 'decrease_staff',
          staffChange: segment.magnitude,
          affectedShifts: overlappingShifts.map(s => ({
            id: s._id,
            name: s.name,
            currentStaff: s.staffCount
          })),
          reason: `Consistently overstaffed during this period based on historical workload`
        });
      }
      // We don't recommend removing shifts entirely, just reducing staff
    }
  }

  /**
   * Calculate optimal staffing levels based on workload and strategy
   */
  private calculateOptimalStaffing(
    hourlyWorkload: number[],
    strategy: OptimizationStrategy,
    totalStaffCount: number
  ): number[] {
    const optimalStaffing = Array(24).fill(0);
    
    // Calculate peak workload
    const peakWorkload = Math.max(...hourlyWorkload);
    
    // Calculate average tasks per staff at peak
    let tasksPerStaff = 0;
    
    switch (strategy) {
      case OptimizationStrategy.WORKLOAD_BALANCED:
        // 5-7 tasks per staff for balanced workload
        tasksPerStaff = 6;
        break;
      case OptimizationStrategy.COST_EFFICIENT:
        // 8-10 tasks per staff for cost efficiency
        tasksPerStaff = 9;
        break;
      case OptimizationStrategy.RESPONSE_TIME:
        // 3-5 tasks per staff for fast response
        tasksPerStaff = 4;
        break;
      case OptimizationStrategy.SKILL_OPTIMIZED:
        // 5-6 tasks per staff for skill optimization
        tasksPerStaff = 5.5;
        break;
      default:
        tasksPerStaff = 6;
    }
    
    // Calculate optimal staff for each hour
    for (let hour = 0; hour < 24; hour++) {
      // Calculate basic staffing based on tasks and strategy
      let staffNeeded = Math.ceil(hourlyWorkload[hour] / tasksPerStaff);
      
      // Ensure minimum staffing of 1 if there's any workload
      if (hourlyWorkload[hour] > 0 && staffNeeded === 0) {
        staffNeeded = 1;
      }
      
      // Apply strategy-specific adjustments
      switch (strategy) {
        case OptimizationStrategy.WORKLOAD_BALANCED:
          // No additional adjustments
          break;
        case OptimizationStrategy.COST_EFFICIENT:
          // Round down for cost efficiency, but maintain minimum of 1
          if (staffNeeded > 1) {
            staffNeeded = Math.floor(hourlyWorkload[hour] / tasksPerStaff);
          }
          break;
        case OptimizationStrategy.RESPONSE_TIME:
          // Add buffer staffing for faster response
          if (staffNeeded > 0) {
            staffNeeded += 1;
          }
          break;
        case OptimizationStrategy.SKILL_OPTIMIZED:
          // Adjust based on task complexity (would need additional data in real implementation)
          // For simulation, just add a small buffer
          if (staffNeeded > 0) {
            staffNeeded = Math.ceil(staffNeeded * 1.15);
          }
          break;
      }
      
      // Ensure we don't recommend more staff than available
      optimalStaffing[hour] = Math.min(staffNeeded, totalStaffCount);
    }
    
    return optimalStaffing;
  }

  /**
   * Calculate the confidence level for a recommendation
   */
  private calculateConfidenceLevel(
    hourlyWorkloadCount: number,
    dayOfWeek: number
  ): ForecastConfidence {
    // Higher count and more regular days (Mon-Fri) get higher confidence
    if (hourlyWorkloadCount > 30 && dayOfWeek >= 1 && dayOfWeek <= 5) {
      return ForecastConfidence.VERY_HIGH;
    } else if (hourlyWorkloadCount > 20 || (hourlyWorkloadCount > 15 && dayOfWeek >= 1 && dayOfWeek <= 5)) {
      return ForecastConfidence.HIGH;
    } else if (hourlyWorkloadCount > 10) {
      return ForecastConfidence.MEDIUM;
    } else {
      return ForecastConfidence.LOW;
    }
  }

  /**
   * Calculate estimated response time improvement
   */
  private calculateResponseTimeImprovement(additionalStaffHours: number): string {
    // This would be a more complex calculation in a real implementation
    // This is a simplified placeholder
    if (additionalStaffHours > 20) {
      return "30-40% faster response times during peak periods";
    } else if (additionalStaffHours > 10) {
      return "15-25% faster response times during peak periods";
    } else if (additionalStaffHours > 5) {
      return "5-15% faster response times during peak periods";
    } else {
      return "Minimal impact on response times";
    }
  }

  /**
   * Calculate estimated customer satisfaction improvement
   */
  private calculateSatisfactionImprovement(additionalStaffHours: number): string {
    // Simplified calculation - would be more complex in real implementation
    if (additionalStaffHours > 20) {
      return "Potential 20-25% increase in customer satisfaction scores";
    } else if (additionalStaffHours > 10) {
      return "Potential 10-15% increase in customer satisfaction scores";
    } else if (additionalStaffHours > 5) {
      return "Potential 5-10% increase in customer satisfaction scores";
    } else {
      return "Minimal impact on customer satisfaction scores";
    }
  }

  /**
   * Generate an overall recommendation summary
   */
  private generateOverallRecommendation(
    staffingChanges: any[],
    shiftAdjustments: any[],
    strategy: OptimizationStrategy
  ): string {
    const increaseCount = staffingChanges.filter(c => c.difference > 0).length;
    const decreaseCount = staffingChanges.filter(c => c.difference < 0).length;
    
    const newShifts = shiftAdjustments.filter(a => a.adjustmentType === 'new_shift').length;
    const increaseStaff = shiftAdjustments.filter(a => a.adjustmentType === 'increase_staff').length;
    const decreaseStaff = shiftAdjustments.filter(a => a.adjustmentType === 'decrease_staff').length;
    
    let summary = '';
    
    switch (strategy) {
      case OptimizationStrategy.WORKLOAD_BALANCED:
        summary = `Based on workload balancing analysis, we recommend ${increaseCount + decreaseCount} staffing adjustments across different time periods. `;
        break;
      case OptimizationStrategy.COST_EFFICIENT:
        summary = `Our cost efficiency analysis identified ${decreaseCount} opportunities to reduce staffing during low-demand periods, while maintaining service quality. `;
        break;
      case OptimizationStrategy.RESPONSE_TIME:
        summary = `To optimize response times, we recommend ${increaseCount} staffing increases during peak periods to ensure prompt service delivery. `;
        break;
      case OptimizationStrategy.SKILL_OPTIMIZED:
        summary = `For skill optimization, we recommend rebalancing staff schedules to ensure appropriate expertise is available when needed. `;
        break;
    }
    
    if (newShifts > 0) {
      summary += `We recommend creating ${newShifts} new shift${newShifts > 1 ? 's' : ''} to cover currently understaffed periods. `;
    }
    
    if (increaseStaff > 0) {
      summary += `${increaseStaff} existing shift${increaseStaff > 1 ? 's' : ''} should be increased to properly handle workload. `;
    }
    
    if (decreaseStaff > 0) {
      summary += `${decreaseStaff} shift${decreaseStaff > 1 ? 's' : ''} have excess capacity and could be reduced for better efficiency. `;
    }
    
    summary += `Implementing these recommendations could lead to more efficient resource utilization and improved service quality.`;
    
    return summary;
  }

  /**
   * Update workload forecasts for future planning
   */
  async updateWorkloadForecasts(businessId: string) {
    this.logger.log(`Updating workload forecasts for business ${businessId}`);
    
    try {
      // Check if agent is enabled for this business
      const hasAccess = await this.agentPermissionService.hasAgentAccess(
        businessId, 
        'shift-optimization'
      );
      
      if (!hasAccess) {
        this.logger.warn(`Shift optimization agent not enabled for business ${businessId}`);
        return;
      }
      
      // Get configuration
      const config = await this.agentConfigModel.findOne({
        businessId,
        agentType: 'shift-optimization'
      });
      
      // Get historical task data (last 90 days)
      const now = new Date();
      const startDate = subDays(now, 90);
      
      const historicalTasks = await this.taskModel.find({
        businessId,
        createdAt: { $gte: startDate, $lte: now }
      });
      
      // Generate forecasts for next 14 days
      const forecastDays = 14;
      const forecasts = this.generateWorkloadForecasts(
        historicalTasks,
        forecastDays
      );
      
      // Save forecast report
      const report = new this.reportModel({
        businessId,
        generatedDate: new Date(),
        reportType: 'forecast',
        forecastHorizon: forecastDays,
        historicalDataStartDate: startDate,
        historicalDataEndDate: now,
        taskCount: historicalTasks.length,
        forecastData: forecasts,
        status: 'generated'
      });
      
      await report.save();
      
      // Send notifications about the forecast if configured
      if (config.sendForecastNotifications) {
        await this.sendForecastNotification(report, config);
      }
      
      this.logger.log(`Updated workload forecasts for business ${businessId}`);
      
      return report;
    } catch (error) {
      this.logger.error(`Error updating workload forecasts for business ${businessId}:`, error.stack);
    }
  }

  /**
   * Generate workload forecasts based on historical data
   */
  private generateWorkloadForecasts(tasks: any[], forecastDays: number) {
    // Calculate tasks by day of week and hour
    const tasksByDayHour = {};
    
    // Initialize structure
    for (let day = 0; day < 7; day++) {
      tasksByDayHour[day] = {};
      for (let hour = 0; hour < 24; hour++) {
        tasksByDayHour[day][hour] = [];
      }
    }
    
    // Populate with historical data
    for (const task of tasks) {
      const date = new Date(task.createdAt);
      const day = date.getDay();
      const hour = date.getHours();
      
      tasksByDayHour[day][hour].push(task);
    }
    
    // Calculate averages
    const averageTasksByDayHour = {};
    const stdDevByDayHour = {};
    
    for (let day = 0; day < 7; day++) {
      averageTasksByDayHour[day] = {};
      stdDevByDayHour[day] = {};
      
      for (let hour = 0; hour < 24; hour++) {
        // Get count of tasks for this day-hour combination across all weeks
        const taskCounts = tasksByDayHour[day][hour].length;
        
        // Calculate number of instances of this day in the historical data
        // Assuming 90 days of data, roughly 12-13 occurrences of each day of week
        const dayCount = Math.floor(90 / 7);
        
        // Calculate average
        averageTasksByDayHour[day][hour] = taskCounts / dayCount;
        
        // For standard deviation, would need task counts per instance of day
        // This is simplified for the example
        stdDevByDayHour[day][hour] = Math.sqrt(averageTasksByDayHour[day][hour]);
      }
    }
    
    // Generate forecast for next N days
    const today = new Date();
    const forecasts = [];
    
    for (let i = 0; i < forecastDays; i++) {
      const forecastDate = addDays(today, i);
      const dayOfWeek = forecastDate.getDay();
      
      const dailyForecast = {
        date: format(forecastDate, 'yyyy-MM-dd'),
        dayOfWeek,
        dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek],
        totalTasks: 0,
        hourlyForecast: [],
        peakHours: [],
        staffingNeeds: {},
        confidenceLevel: this.getForecastConfidenceLevel(dayOfWeek, i)
      };
      
      // Generate hourly forecast
      for (let hour = 0; hour < 24; hour++) {
        const avgTasks = averageTasksByDayHour[dayOfWeek][hour];
        const stdDev = stdDevByDayHour[dayOfWeek][hour];
        
        // Add random variation within standard deviation
        // For a real implementation, would use more sophisticated time series analysis
        const randomFactor = 1 + ((Math.random() * 2 - 1) * 0.2);
        const forecastedTasks = Math.max(0, avgTasks * randomFactor);
        
        dailyForecast.hourlyForecast.push({
          hour,
          formattedHour: `${hour.toString().padStart(2, '0')}:00`,
          forecastedTasks: Math.round(forecastedTasks * 10) / 10, // Round to 1 decimal
          confidenceInterval: [
            Math.max(0, avgTasks - stdDev).toFixed(1),
            (avgTasks + stdDev).toFixed(1)
          ]
        });
        
        dailyForecast.totalTasks += forecastedTasks;
      }
      
      // Identify peak hours (>150% of daily average)
      const hourlyAvg = dailyForecast.totalTasks / 24;
      dailyForecast.peakHours = dailyForecast.hourlyForecast
        .filter(h => h.forecastedTasks > hourlyAvg * 1.5)
        .map(h => h.formattedHour)
        .sort();
      
      // Calculate staffing needs based on workload
      const strategies = Object.values(OptimizationStrategy);
      
      for (const strategy of strategies) {
        // Calculate staffing needs for this strategy
        const tasksPerStaff = strategy === OptimizationStrategy.COST_EFFICIENT ? 9 :
                              strategy === OptimizationStrategy.RESPONSE_TIME ? 4 :
                              strategy === OptimizationStrategy.SKILL_OPTIMIZED ? 5.5 : 6;
        
        dailyForecast.staffingNeeds[strategy] = dailyForecast.hourlyForecast.map(h => ({
          hour: h.formattedHour,
          recommendedStaff: Math.max(1, Math.ceil(h.forecastedTasks / tasksPerStaff))
        }));
      }
      
      forecasts.push(dailyForecast);
    }
    
    return forecasts;
  }

  /**
   * Get confidence level for forecast based on day and distance in future
   */
  private getForecastConfidenceLevel(dayOfWeek: number, daysInFuture: number): ForecastConfidence {
    // Closer days and regular weekdays have higher confidence
    if (daysInFuture < 3 && dayOfWeek >= 1 && dayOfWeek <= 5) {
      return ForecastConfidence.VERY_HIGH;
    } else if (daysInFuture < 7 && dayOfWeek >= 1 && dayOfWeek <= 5) {
      return ForecastConfidence.HIGH;
    } else if (daysInFuture < 10 || (dayOfWeek >= 1 && dayOfWeek <= 5)) {
      return ForecastConfidence.MEDIUM;
    } else {
      return ForecastConfidence.LOW;
    }
  }

  /**
   * Send notification about optimization report
   */
  private async sendOptimizationReportNotification(report: any, config: any) {
    try {
      // Get managers to notify
      const managerIds = config.managerUserIds || [];
      
      if (managerIds.length === 0) {
        this.logger.warn('No managers configured for optimization report notifications');
        return;
      }
      
      const managers = await this.userModel.find({
        _id: { $in: managerIds }
      });
      
      for (const manager of managers) {
        await this.sendOptimizationEmail(report, manager);
      }
    } catch (error) {
      this.logger.error(`Error sending optimization report notification: ${error.message}`);
    }
  }

  /**
   * Send notification about forecast report
   */
  private async sendForecastNotification(report: any, config: any) {
    try {
      // Get managers to notify
      const managerIds = config.managerUserIds || [];
      
      if (managerIds.length === 0) {
        this.logger.warn('No managers configured for forecast notifications');
        return;
      }
      
      const managers = await this.userModel.find({
        _id: { $in: managerIds }
      });
      
      for (const manager of managers) {
        await this.sendForecastEmail(report, manager);
      }
    } catch (error) {
      this.logger.error(`Error sending forecast notification: ${error.message}`);
    }
  }

  /**
   * Send optimization report email
   */
  private async sendOptimizationEmail(report: any, manager: any) {
    const business = await this.businessModel.findById(report.businessId);
    
    // Format key recommendations
    const topChanges = report.recommendations.staffingLevelChanges
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
      .slice(0, 5);
    
    const changesList = topChanges.map(change => 
      `- ${change.day} at ${change.hour}: ${change.difference > 0 ? 'Increase' : 'Decrease'} staffing from ${
        change.currentStaffing} to ${change.recommendedStaffing} staff members`
    ).join('\n');
    
    const templateData = {
      managerName: `${manager.name} ${manager.surname}`,
      businessName: business.name,
      reportDate: format(report.generatedDate, 'MMMM d, yyyy'),
      reportType: report.reportType,
      strategy: report.strategy,
      overallRecommendation: report.recommendations.overallRecommendation,
      topChanges: changesList,
      potentialSavings: report.recommendations.potentialSavings 
        ? `${report.recommendations.potentialSavings.weeklyHours} hours/week (approx. $${
            report.recommendations.potentialSavings.monthlyCost.toFixed(2)}/month)` 
        : 'Not applicable',
      reportUrl: `${process.env.APP_URL}/shift-optimization/reports/${report._id}`
    };
    
    await this.emailService.sendTemplateEmail(
      'Staffluent Optimization Agent',
      process.env.EMAIL_FROM,
      manager.email,
      `Shift Optimization Report for ${business.name}`,
      'templates/shift-optimization/optimization-report.html',
      templateData
    );
  }

  /**
   * Send forecast report email
   */
  private async sendForecastEmail(report: any, manager: any) {
    const business = await this.businessModel.findById(report.businessId);
    
    // Format peak days for email
    const peakDays = report.forecastData
      .slice(0, 7) // Focus on next 7 days
      .filter(day => day.totalTasks > 0)
      .sort((a, b) => b.totalTasks - a.totalTasks)
      .slice(0, 3); // Top 3 busiest days
    
    const peakDaysList = peakDays.map(day => 
      `- ${day.dayName}, ${day.date}: Expected ${Math.round(day.totalTasks)} tasks (Peak hours: ${
        day.peakHours.length > 0 ? day.peakHours.join(', ') : 'None identified'})`
    ).join('\n');
    
    const templateData = {
      managerName: `${manager.name} ${manager.surname}`,
      businessName: business.name,
      reportDate: format(report.generatedDate, 'MMMM d, yyyy'),
      forecastDays: report.forecastHorizon,
      peakDays: peakDaysList,
      averageDailyTasks: Math.round(report.forecastData.reduce((sum, day) => sum + day.totalTasks, 0) / report.forecastData.length),
      reportUrl: `${process.env.APP_URL}/shift-optimization/forecasts/${report._id}`
    };
    
    await this.emailService.sendTemplateEmail(
      'Staffluent Optimization Agent',
      process.env.EMAIL_FROM,
      manager.email,
      `Workload Forecast for ${business.name}`,
      'templates/shift-optimization/forecast-report.html',
      templateData
    );
  }

  /**
   * Run forecast update manually
   */
  async runManualForecastUpdate(businessId: string): Promise<any> {
    return this.updateWorkloadForecasts(businessId);
  }

  /**
   * Run optimization analysis manually
   */
  async runManualOptimization(
    businessId: string, 
    strategy?: OptimizationStrategy
  ): Promise<any> {
    if (strategy) {
      // Update strategy in configuration
      await this.agentConfigModel.updateOne(
        { businessId, agentType: 'shift-optimization' },
        { $set: { optimizationStrategy: strategy } }
      );
    }
    
    return this.generateWeeklyOptimization(businessId);
  }

  /**
   * Get shift recommendations by day
   */
  async getShiftRecommendationsByDay(businessId: string, day: number): Promise<any> {
    // Get latest optimization report
    const latestReport = await this.reportModel.findOne({
      businessId,
      reportType: 'weekly',
      status: 'generated'
    }).sort({ generatedDate: -1 });
    
    if (!latestReport) {
      return { error: 'No optimization reports available' };
    }
    
    // Filter recommendations for the requested day
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
    
    const staffingChanges = latestReport.recommendations.staffingLevelChanges
      .filter(change => change.day === dayName);
    
    const shiftAdjustments = latestReport.recommendations.shiftAdjustments
      .filter(adjustment => adjustment.day === dayName);
    
    return {
      day: dayName,
      generatedDate: latestReport.generatedDate,
      strategy: latestReport.strategy,
      staffingChanges,
      shiftAdjustments
    };
  }

  /**
   * Get forecast for a specific date
   */
  async getForecastByDate(businessId: string, date: string): Promise<any> {
    // Get latest forecast report
    const latestForecast = await this.reportModel.findOne({
      businessId,
      reportType: 'forecast',
      status: 'generated'
    }).sort({ generatedDate: -1 });
    
    if (!latestForecast) {
      return { error: 'No forecast reports available' };
    }
    
    // Find forecast for the requested date
    const forecast = latestForecast.forecastData.find(f => f.date === date);
    
    if (!forecast) {
      return { error: 'No forecast available for the requested date' };
    }
    
    return {
      generatedDate: latestForecast.generatedDate,
      forecast
    };
  }

  /**
   * Get optimization summary
   */
  async getOptimizationSummary(businessId: string): Promise<any> {
    // Get latest optimization report
    const latestReport = await this.reportModel.findOne({
      businessId,
      reportType: 'weekly',
      status: 'generated'
    }).sort({ generatedDate: -1 });
    
    if (!latestReport) {
      return { status: 'no_data', message: 'No optimization reports available yet' };
    }
    
    // Simplified summary
    return {
      status: 'available',
      generatedDate: latestReport.generatedDate,
      strategy: latestReport.strategy,
      overallRecommendation: latestReport.recommendations.overallRecommendation,
      staffingChangeCount: latestReport.recommendations.staffingLevelChanges.length,
      shiftAdjustmentCount: latestReport.recommendations.shiftAdjustments.length,
      potentialSavings: latestReport.recommendations.potentialSavings,
      potentialServiceImprovements: latestReport.recommendations.potentialServiceImprovements,
      reportId: latestReport._id
    };
  }

  /**
   * Update business agent configuration
   */
  async updateBusinessConfiguration(
    businessId: string,
    config: Partial<AgentConfiguration>
  ): Promise<AgentConfiguration> {
    const existingConfig = await this.agentConfigModel.findOne({
      businessId,
      agentType: 'shift-optimization'
    });
    
    if (existingConfig) {
      // Update existing configuration
      Object.assign(existingConfig, config);
      const updatedConfig = await existingConfig.save();
      
      // Update scheduling if needed
      await this.updateBusinessOptimization(businessId);
      
      return updatedConfig;
    } else {
      // Create new configuration
      const newConfig = new this.agentConfigModel({
        businessId,
        agentType: 'shift-optimization',
        isEnabled: true,
        optimizationStrategy: OptimizationStrategy.WORKLOAD_BALANCED,
        weeklyOptimizationCron: '0 1 * * 0', // Sunday at 1 AM
        dailyForecastCron: '0 0 * * *', // Midnight daily
        sendOptimizationNotifications: true,
        sendForecastNotifications: true,
        managerUserIds: [],
        ...config
      });
      
      const savedConfig = await newConfig.save();
      
      // Setup scheduling
      await this.setupBusinessShiftOptimization(businessId);
      
      return savedConfig;
    }
  }

  /**
   * Get business agent configuration
   */
  async getBusinessConfiguration(
    businessId: string
  ): Promise<AgentConfiguration> {
    return this.agentConfigModel.findOne({
      businessId,
      agentType: 'shift-optimization'
    });
  }
}