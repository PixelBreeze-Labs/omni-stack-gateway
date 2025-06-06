// src/services/route-analytics.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business } from '../schemas/business.schema';
import { FieldTask, FieldTaskStatus, FieldTaskPriority } from '../schemas/field-task.schema';
import { Route, RouteStatus } from '../schemas/route.schema';
import { RouteProgress } from '../schemas/route-progress.schema';

interface RouteReport {
  reportId: string;
  businessId: string;
  reportType: 'daily' | 'weekly' | 'monthly' | 'custom';
  dateRange: {
    startDate: string;
    endDate: string;
  };
  metrics: {
    totalRoutes: number;
    completedRoutes: number;
    totalTasks: number;
    completedTasks: number;
    totalDistance: number;
    totalTime: number;
    fuelCost: number;
    efficiency: number;
  };
  teamPerformance: Array<{
    teamId: string;
    teamName: string;
    routesCompleted: number;
    tasksCompleted: number;
    avgCompletionTime: number;
    efficiency: number;
    rating: number;
  }>;
  trends: {
    efficiencyTrend: number;
    timeTrend: number;
    costTrend: number;
  };
  recommendations: string[];
  generatedAt: string;
}

interface PerformanceMetrics {
  overview: {
    totalRoutes: number;
    avgEfficiency: number;
    totalDistanceSaved: number;
    totalTimeSaved: number;
    totalCostSaved: number;
  };
  timeMetrics: {
    avgRouteTime: number;
    avgTaskTime: number;
    onTimePercentage: number;
    delayReasons: Record<string, number>;
  };
  efficiencyMetrics: {
    routeOptimizationScore: number;
    fuelEfficiency: number;
    taskCompletionRate: number;
    customerSatisfaction: number;
  };
  teamMetrics: Array<{
    teamId: string;
    teamName: string;
    performance: number;
    tasksCompleted: number;
    avgRating: number;
  }>;
}

interface CostSavings {
  periodComparison: {
    current: {
      totalCost: number;
      fuelCost: number;
      timeCost: number;
      maintenanceCost: number;
    };
    previous: {
      totalCost: number;
      fuelCost: number;
      timeCost: number;
      maintenanceCost: number;
    };
    savings: {
      totalSavings: number;
      fuelSavings: number;
      timeSavings: number;
      maintenanceSavings: number;
      percentageSaved: number;
    };
  };
  projectedSavings: {
    monthly: number;
    yearly: number;
  };
  optimizationImpact: {
    routeOptimization: number;
    fuelOptimization: number;
    timeOptimization: number;
  };
}

interface EfficiencyTrends {
  timeframe: string;
  dataPoints: Array<{
    date: string;
    efficiency: number;
    routeCount: number;
    avgTime: number;
    costs: number;
  }>;
  trends: {
    efficiency: 'improving' | 'stable' | 'declining';
    routeCount: 'increasing' | 'stable' | 'decreasing';
    costs: 'increasing' | 'stable' | 'decreasing';
  };
  forecasts: {
    nextMonth: {
      expectedEfficiency: number;
      expectedCosts: number;
      confidence: number;
    };
  };
}

@Injectable()
export class RouteAnalyticsService {
  private readonly logger = new Logger(RouteAnalyticsService.name);

  constructor(
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(FieldTask.name) private fieldTaskModel: Model<FieldTask>,
    @InjectModel(Route.name) private routeModel: Model<Route>,
    @InjectModel(RouteProgress.name) private routeProgressModel: Model<RouteProgress>,
  ) {}

  // ============================================================================
  // IMPROVED REPORT GENERATION USING ROUTE AND ROUTEPROGRESS DATA
  // ============================================================================

  /**
   * Generate comprehensive route report using real Route and RouteProgress data
   */
  async generateRouteReport(
    businessId: string,
    reportType: 'daily' | 'weekly' | 'monthly' | 'custom',
    startDate?: string,
    endDate?: string
  ): Promise<RouteReport> {
    try {
      const business = await this.validateBusiness(businessId);

      // Calculate date range based on report type
      const dateRange = this.calculateDateRange(reportType, startDate, endDate);
      
      // Generate report data using real Route and RouteProgress data
      const reportId = `report-${Date.now()}`;
      const metrics = await this.calculateRealReportMetrics(business, dateRange);
      const teamPerformance = await this.calculateRealTeamPerformance(business, dateRange);
      const trends = await this.calculateRealTrends(business, dateRange);
      const recommendations = this.generateRealRecommendations(metrics, teamPerformance);

      const report: RouteReport = {
        reportId,
        businessId,
        reportType,
        dateRange,
        metrics,
        teamPerformance,
        trends,
        recommendations,
        generatedAt: new Date().toISOString()
      };

      // Store report in business metadata
      await this.storeReport(business, report);

      this.logger.log(`Generated ${reportType} route report for business ${businessId}`);

      return report;

    } catch (error) {
      this.logger.error(`Error generating route report: ${error.message}`, error.stack);
      throw error;
    }
  }

  
/**
 * FIXED: Get performance metrics with proper percentage formatting
 */
async getPerformanceMetrics(
    businessId: string,
    timeframe: string = '30d'
  ): Promise<PerformanceMetrics> {
    try {
      const business = await this.validateBusiness(businessId);
  
      // Calculate date range for timeframe
      const endDate = new Date();
      const startDate = new Date();
      const days = parseInt(timeframe.replace('d', '')) || 30;
      startDate.setDate(endDate.getDate() - days);
  
      // FIXED: Get real Route data from database (not just tasks)
      const routes = await this.routeModel.find({
        businessId,
        date: { $gte: startDate, $lte: endDate },
        isDeleted: false
      });
  
      // Get RouteProgress data for completed routes
      const routeProgressData = await this.routeProgressModel.find({
        businessId,
        routeDate: { $gte: startDate, $lte: endDate },
        isDeleted: false
      });
  
      // Get task data for additional metrics
      const tasks = await this.fieldTaskModel.find({
        businessId,
        scheduledDate: { $gte: startDate, $lte: endDate },
        isDeleted: false
      });
  
      const completedRoutes = routes.filter(r => r.status === RouteStatus.COMPLETED);
      const completedTasks = tasks.filter(t => t.status === FieldTaskStatus.COMPLETED);
  
      // Calculate real distance savings using Route data
      const totalDistanceSaved = completedRoutes.reduce((sum, route) => {
        if (route.estimatedDistance && route.actualDistance) {
          return sum + Math.max(0, route.estimatedDistance - route.actualDistance);
        }
        return sum + (route.estimatedDistance * 0.15 || 0); // Estimate 15% savings
      }, 0);
  
      // Calculate real time savings using RouteProgress data
      const totalTimeSaved = routeProgressData.reduce((sum, progress) => {
        if (progress.totalEstimatedDuration && progress.totalActualDuration) {
          return sum + Math.max(0, progress.totalEstimatedDuration - progress.totalActualDuration);
        }
        return sum + (progress.totalEstimatedDuration * 0.1 || 0); // Estimate 10% savings
      }, 0);
  
      // Calculate cost savings using actual route data
      const totalCostSaved = this.calculateCostSavingsFromRoutes(completedRoutes);
  
      const metrics: PerformanceMetrics = {
        overview: {
          totalRoutes: routes.length, // FIXED: Use actual routes count
          avgEfficiency: this.formatPercentage(this.calculateRouteEfficiency(routes, routeProgressData)),
          totalDistanceSaved: Math.round(totalDistanceSaved),
          totalTimeSaved: Math.round(totalTimeSaved),
          totalCostSaved: Math.round(totalCostSaved)
        },
        timeMetrics: {
          avgRouteTime: this.calculateAvgRouteTimeFromProgress(routeProgressData),
          avgTaskTime: this.calculateAvgTaskTime(completedTasks),
          onTimePercentage: this.formatPercentage(this.calculateOnTimePerformanceFromProgress(routeProgressData)),
          delayReasons: await this.calculateDelayReasonsFromProgress(routeProgressData)
        },
        efficiencyMetrics: {
          routeOptimizationScore: this.formatPercentage(this.calculateOptimizationScoreFromRoutes(routes)),
          fuelEfficiency: this.formatPercentage(this.calculateFuelEfficiencyFromRoutes(completedRoutes)), // FIXED: Format percentage
          taskCompletionRate: this.formatPercentage(this.calculateCompletionRateFromProgress(routeProgressData)),
          customerSatisfaction: this.formatPercentage(this.calculateCustomerSatisfaction(completedTasks))
        },
        teamMetrics: await this.calculateRealTeamMetrics(business, startDate, endDate)
      };
  
      return metrics;
  
    } catch (error) {
      this.logger.error(`Error getting performance metrics: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * IMPROVED: Calculate cost savings using actual Route data
   */
  async calculateCostSavings(
    businessId: string,
    comparisonPeriod: string = '30d'
  ): Promise<CostSavings> {
    try {
      const business = await this.validateBusiness(businessId);

      const days = parseInt(comparisonPeriod.replace('d', '')) || 30;
      
      // Current period
      const currentEndDate = new Date();
      const currentStartDate = new Date();
      currentStartDate.setDate(currentEndDate.getDate() - days);

      // Previous period (same duration, before current period)
      const previousEndDate = new Date(currentStartDate);
      const previousStartDate = new Date(previousEndDate);
      previousStartDate.setDate(previousEndDate.getDate() - days);

      // Get routes for both periods
      const currentRoutes = await this.routeModel.find({
        businessId,
        date: { $gte: currentStartDate, $lte: currentEndDate },
        status: RouteStatus.COMPLETED,
        isDeleted: false
      });

      const previousRoutes = await this.routeModel.find({
        businessId,
        date: { $gte: previousStartDate, $lte: previousEndDate },
        status: RouteStatus.COMPLETED,
        isDeleted: false
      });

      // Calculate real costs for each period using Route data
      const currentPeriod = this.calculatePeriodCostsFromRoutes(currentRoutes);
      const previousPeriod = this.calculatePeriodCostsFromRoutes(previousRoutes);

      // Calculate savings
      const savings = {
        totalSavings: Math.max(0, previousPeriod.totalCost - currentPeriod.totalCost),
        fuelSavings: Math.max(0, previousPeriod.fuelCost - currentPeriod.fuelCost),
        timeSavings: Math.max(0, previousPeriod.timeCost - currentPeriod.timeCost),
        maintenanceSavings: Math.max(0, previousPeriod.maintenanceCost - currentPeriod.maintenanceCost),
        percentageSaved: previousPeriod.totalCost > 0 ? 
          Math.round(((previousPeriod.totalCost - currentPeriod.totalCost) / previousPeriod.totalCost) * 100) : 0
      };

      const costSavings: CostSavings = {
        periodComparison: {
          current: currentPeriod,
          previous: previousPeriod,
          savings
        },
        projectedSavings: {
          monthly: Math.round(savings.totalSavings * (30 / days)),
          yearly: Math.round(savings.totalSavings * (365 / days))
        },
        optimizationImpact: {
          routeOptimization: Math.round(savings.totalSavings * 0.4),
          fuelOptimization: savings.fuelSavings,
          timeOptimization: savings.timeSavings
        }
      };

      return costSavings;

    } catch (error) {
      this.logger.error(`Error calculating cost savings: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * IMPROVED: Get efficiency trends using Route and RouteProgress historical data
   */
  async getEfficiencyTrends(
    businessId: string,
    timeframe: string = '90d'
  ): Promise<EfficiencyTrends> {
    try {
      const business = await this.validateBusiness(businessId);

      const days = parseInt(timeframe.replace('d', '')) || 90;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);

      // Get weekly aggregated data using Route and RouteProgress
      const weeklyData = await this.getWeeklyAggregatedDataFromRoutes(businessId, startDate, endDate);
      
      // Calculate trends
      const dataPoints = weeklyData.map(week => ({
        date: week.date,
        efficiency: week.efficiency,
        routeCount: week.routeCount,
        avgTime: week.avgTime,
        costs: week.costs
      }));

      // Analyze trends
      const firstHalf = dataPoints.slice(0, Math.floor(dataPoints.length / 2));
      const secondHalf = dataPoints.slice(Math.floor(dataPoints.length / 2));

      const avgEfficiencyFirst = firstHalf.reduce((sum, dp) => sum + dp.efficiency, 0) / firstHalf.length;
      const avgEfficiencySecond = secondHalf.reduce((sum, dp) => sum + dp.efficiency, 0) / secondHalf.length;
      
      const avgCostsFirst = firstHalf.reduce((sum, dp) => sum + dp.costs, 0) / firstHalf.length;
      const avgCostsSecond = secondHalf.reduce((sum, dp) => sum + dp.costs, 0) / secondHalf.length;

      const avgRoutesFirst = firstHalf.reduce((sum, dp) => sum + dp.routeCount, 0) / firstHalf.length;
      const avgRoutesSecond = secondHalf.reduce((sum, dp) => sum + dp.routeCount, 0) / secondHalf.length;

      // Calculate forecast based on trend
      const efficiencyTrend = avgEfficiencySecond - avgEfficiencyFirst;
      const costTrend = avgCostsSecond - avgCostsFirst;

      const trends: EfficiencyTrends = {
        timeframe,
        dataPoints,
        trends: {
          efficiency: avgEfficiencySecond > avgEfficiencyFirst * 1.05 ? 'improving' : 
                     avgEfficiencySecond < avgEfficiencyFirst * 0.95 ? 'declining' : 'stable',
          routeCount: avgRoutesSecond > avgRoutesFirst * 1.1 ? 'increasing' :
                      avgRoutesSecond < avgRoutesFirst * 0.9 ? 'decreasing' : 'stable',
          costs: avgCostsSecond > avgCostsFirst * 1.05 ? 'increasing' :
                 avgCostsSecond < avgCostsFirst * 0.95 ? 'decreasing' : 'stable'
        },
        forecasts: {
          nextMonth: {
            expectedEfficiency: Math.max(60, Math.min(95, avgEfficiencySecond + efficiencyTrend)),
            expectedCosts: Math.max(0, avgCostsSecond + costTrend),
            confidence: Math.min(95, 75 + (dataPoints.length * 2))
          }
        }
      };

      return trends;

    } catch (error) {
      this.logger.error(`Error getting efficiency trends: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Export analytics data (unchanged)
   */
  async exportAnalytics(
    businessId: string,
    format: 'csv' | 'json' | 'pdf' = 'csv',
    timeframe: string = '30d'
  ): Promise<{ success: boolean; data: any; message: string }> {
    try {
      const business = await this.validateBusiness(businessId);

      const performanceMetrics = await this.getPerformanceMetrics(businessId, timeframe);
      const costSavings = await this.calculateCostSavings(businessId, timeframe);
      const efficiencyTrends = await this.getEfficiencyTrends(businessId, timeframe);

      let exportData: any;

      switch (format) {
        case 'csv':
          exportData = this.formatForCSV(performanceMetrics, costSavings, efficiencyTrends);
          break;
        case 'json':
          exportData = {
            exportedAt: new Date().toISOString(),
            timeframe,
            businessId,
            performanceMetrics,
            costSavings,
            efficiencyTrends
          };
          break;
        case 'pdf':
          exportData = this.formatForPDF(performanceMetrics, costSavings, efficiencyTrends);
          break;
        default:
          throw new BadRequestException('Invalid export format');
      }

      this.logger.log(`Exported analytics data in ${format} format for business ${businessId}`);

      return {
        success: true,
        data: exportData,
        message: `Analytics data exported successfully in ${format.toUpperCase()} format`
      };

    } catch (error) {
      this.logger.error(`Error exporting analytics: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================================================
  // IMPROVED PRIVATE HELPER METHODS USING ROUTE AND ROUTEPROGRESS DATA
  // ============================================================================

  /**
 * FIXED: Calculate route efficiency with proper formatting
 */
private calculateRouteEfficiency(routes: any[], routeProgressData: any[]): number {
    if (routes.length === 0) return 0;
  
    // Use actual optimization scores from Route data
    const routesWithScores = routes.filter(r => r.optimizationScore);
    if (routesWithScores.length > 0) {
      const avgOptimizationScore = routesWithScores.reduce((sum, route) => sum + route.optimizationScore, 0) / routesWithScores.length;
      return this.formatPercentage(avgOptimizationScore);
    }
  
    // Fallback to RouteProgress performance calculation
    const progressWithPerformance = routeProgressData.filter(p => p.performance?.efficiency);
    if (progressWithPerformance.length > 0) {
      const avgEfficiency = progressWithPerformance.reduce((sum, progress) => sum + progress.performance.efficiency, 0) / progressWithPerformance.length;
      return this.formatPercentage(avgEfficiency);
    }
  
    return 0; // Default efficiency
  }

  /**
 * FIXED: Format percentage values properly
 */
private formatPercentage(value: number): number {
    return Math.round(value * 10) / 10; // Round to 1 decimal place
  }

  /**
   * IMPROVED: Calculate average route time using RouteProgress actual duration
   */
  private calculateAvgRouteTimeFromProgress(routeProgressData: any[]): number {
    if (routeProgressData.length === 0) return 0;

    const routesWithActualTime = routeProgressData.filter(p => p.totalActualDuration);
    if (routesWithActualTime.length > 0) {
      const totalTime = routesWithActualTime.reduce((sum, progress) => sum + progress.totalActualDuration, 0);
      return Math.round(totalTime / routesWithActualTime.length);
    }

    // Fallback to estimated duration
    const routesWithEstimatedTime = routeProgressData.filter(p => p.totalEstimatedDuration);
    if (routesWithEstimatedTime.length > 0) {
      const totalTime = routesWithEstimatedTime.reduce((sum, progress) => sum + progress.totalEstimatedDuration, 0);
      return Math.round(totalTime / routesWithEstimatedTime.length);
    }

    return 0;
  }

  /**
   * IMPROVED: Calculate on-time performance using RouteProgress data
   */
  private calculateOnTimePerformanceFromProgress(routeProgressData: any[]): number {
    if (routeProgressData.length === 0) return 100;

    const routesWithPerformance = routeProgressData.filter(p => p.performance?.onTimePerformance !== undefined);
    if (routesWithPerformance.length > 0) {
      const avgOnTime = routesWithPerformance.reduce((sum, progress) => sum + progress.performance.onTimePerformance, 0) / routesWithPerformance.length;
      return Math.round(avgOnTime);
    }

    // Fallback calculation
    const routesWithTiming = routeProgressData.filter(p => p.totalActualDuration && p.totalEstimatedDuration);
    if (routesWithTiming.length > 0) {
      const onTimeRoutes = routesWithTiming.filter(p => p.totalActualDuration <= p.totalEstimatedDuration * 1.1);
      return Math.round((onTimeRoutes.length / routesWithTiming.length) * 100);
    }

    return 100;
  }

  /**
   * IMPROVED: Calculate delay reasons from RouteProgress data
   */
  private async calculateDelayReasonsFromProgress(routeProgressData: any[]): Promise<Record<string, number>> {
    const delayReasons = {
      'Traffic': 0,
      'Customer Availability': 0,
      'Equipment Issues': 0,
      'Weather': 0,
      'Other': 0
    };

    routeProgressData.forEach(progress => {
      progress.tasks?.forEach(task => {
        task.delayReasons?.forEach(delayReason => {
          const reason = delayReason.reason || 'Other';
          if (delayReasons.hasOwnProperty(reason)) {
            delayReasons[reason] += delayReason.duration || 0;
          } else {
            delayReasons['Other'] += delayReason.duration || 0;
          }
        });
      });
    });

    return delayReasons;
  }

  /**
   * IMPROVED: Calculate optimization score from Route data
   */
  private calculateOptimizationScoreFromRoutes(routes: any[]): number {
    if (routes.length === 0) return 0;

    const routesWithScores = routes.filter(r => r.optimizationScore);
    if (routesWithScores.length > 0) {
      const avgScore = routesWithScores.reduce((sum, route) => sum + route.optimizationScore, 0) / routesWithScores.length;
      return Math.round(avgScore);
    }

    return 85; // Default score
  }

  /**
 * FIXED: Calculate fuel efficiency with proper formatting
 */
private calculateFuelEfficiencyFromRoutes(routes: any[]): number {
    const routesWithFuelData = routes.filter(r => r.estimatedFuelCost && r.actualFuelCost);
    if (routesWithFuelData.length === 0) return 85;
  
    const efficiencies = routesWithFuelData.map(route => {
      return Math.min(100, (route.estimatedFuelCost / route.actualFuelCost) * 100);
    });
  
    const avgEfficiency = efficiencies.reduce((sum, eff) => sum + eff, 0) / efficiencies.length;
    return this.formatPercentage(avgEfficiency);
  }
  

  /**
   * IMPROVED: Calculate completion rate from RouteProgress data
   */
  private calculateCompletionRateFromProgress(routeProgressData: any[]): number {
    if (routeProgressData.length === 0) return 0;

    const totalTasks = routeProgressData.reduce((sum, progress) => sum + (progress.tasks?.length || 0), 0);
    const completedTasks = routeProgressData.reduce((sum, progress) => sum + (progress.completedTasksCount || 0), 0);

    return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  }

  /**
   * IMPROVED: Calculate period costs using actual Route data
   */
  private calculatePeriodCostsFromRoutes(routes: any[]): any {
    const fuelCost = routes.reduce((sum, route) => sum + (route.actualFuelCost || route.estimatedFuelCost || 0), 0);
    const timeCost = routes.reduce((sum, route) => {
      const timeHours = (route.actualTotalTime || route.estimatedTotalTime || 0) / 60;
      return sum + (timeHours * 25); // $25 per hour
    }, 0);
    const maintenanceCost = routes.reduce((sum, route) => {
      const distance = route.actualDistance || route.estimatedDistance || 0;
      return sum + (distance * 0.05); // $0.05 per km
    }, 0);

    return {
      totalCost: fuelCost + timeCost + maintenanceCost,
      fuelCost,
      timeCost,
      maintenanceCost
    };
  }

  /**
   * IMPROVED: Calculate cost savings from Route optimization
   */
  private calculateCostSavingsFromRoutes(routes: any[]): number {
    return routes.reduce((savings, route) => {
      if (route.estimatedFuelCost && route.actualFuelCost) {
        savings += Math.max(0, route.estimatedFuelCost - route.actualFuelCost);
      }
      if (route.estimatedTotalTime && route.actualTotalTime) {
        const timeSavingsHours = Math.max(0, route.estimatedTotalTime - route.actualTotalTime) / 60;
        savings += timeSavingsHours * 25; // $25 per hour
      }
      return savings;
    }, 0);
  }

  /**
   * IMPROVED: Get weekly aggregated data using Route and RouteProgress
   */
  private async getWeeklyAggregatedDataFromRoutes(businessId: string, startDate: Date, endDate: Date): Promise<any[]> {
    const weeks = [];
    const current = new Date(startDate);
    
    while (current < endDate) {
      const weekStart = new Date(current);
      const weekEnd = new Date(current);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const weekRoutes = await this.routeModel.find({
        businessId,
        date: { $gte: weekStart, $lte: weekEnd },
        status: RouteStatus.COMPLETED,
        isDeleted: false
      });

      const weekProgress = await this.routeProgressModel.find({
        businessId,
        routeDate: { $gte: weekStart, $lte: weekEnd },
        isDeleted: false
      });

      const efficiency = this.calculateRouteEfficiency(weekRoutes, weekProgress);
      const routeCount = weekRoutes.length;
      const avgTime = this.calculateAvgRouteTimeFromProgress(weekProgress);
      const costs = this.calculatePeriodCostsFromRoutes(weekRoutes).totalCost;

      weeks.push({
        date: weekStart.toISOString().split('T')[0],
        efficiency,
        routeCount,
        avgTime,
        costs
      });

      current.setDate(current.getDate() + 7);
    }

    return weeks;
  }

  // ============================================================================
  // REMAINING HELPER METHODS (UNCHANGED)
  // ============================================================================

 /**
 * FIXED: Calculate real report metrics using Route collection data
 */
private async calculateRealReportMetrics(business: any, dateRange: any): Promise<any> {
    const startDate = new Date(dateRange.startDate);
    const endDate = new Date(dateRange.endDate);
    endDate.setHours(23, 59, 59, 999);
  
    // FIXED: Get actual Route documents, not just tasks
    const routes = await this.routeModel.find({
      businessId: business._id,
      date: { $gte: startDate, $lte: endDate },
      isDeleted: false
    });
  
    const routeProgress = await this.routeProgressModel.find({
      businessId: business._id,
      routeDate: { $gte: startDate, $lte: endDate },
      isDeleted: false
    });
  
    const completedRoutes = routes.filter(r => r.status === RouteStatus.COMPLETED);
    const totalTasks = routeProgress.reduce((sum, p) => sum + (p.tasks?.length || 0), 0);
    const completedTasks = routeProgress.reduce((sum, p) => sum + (p.completedTasksCount || 0), 0);
  
    const totalDistance = completedRoutes.reduce((sum, route) => sum + (route.actualDistance || route.estimatedDistance || 0), 0);
    const totalTime = routeProgress.reduce((sum, progress) => sum + (progress.totalActualDuration || progress.totalEstimatedDuration || 0), 0);
  
    // FIXED: Use actual routes count, not route progress
    return {
      totalRoutes: routes.length, // FIXED: Use routes.length instead of route progress
      completedRoutes: completedRoutes.length,
      totalTasks,
      completedTasks,
      totalDistance: Math.round(totalDistance),
      totalTime: Math.round(totalTime),
      fuelCost: this.calculatePeriodCostsFromRoutes(completedRoutes).fuelCost,
      efficiency: this.formatPercentage(this.calculateRouteEfficiency(routes, routeProgress)) // FIXED: Format percentage
    };
  }
  

  private async calculateRealTeamPerformance(business: any, dateRange: any): Promise<any[]> {
    const startDate = new Date(dateRange.startDate);
    const endDate = new Date(dateRange.endDate);
    endDate.setHours(23, 59, 59, 999);

    const teams = business.teams || [];
    const teamPerformance = [];

    for (const team of teams) {
      const teamRoutes = await this.routeModel.find({
        businessId: business._id,
        teamId: team.id,
        date: { $gte: startDate, $lte: endDate },
        isDeleted: false
      });

      const teamProgress = await this.routeProgressModel.find({
        businessId: business._id,
        teamId: team.id,
        routeDate: { $gte: startDate, $lte: endDate },
        isDeleted: false
      });

      const completedRoutes = teamRoutes.filter(r => r.status === RouteStatus.COMPLETED);
      
      // Calculate average completion time from RouteProgress
      const avgCompletionTime = teamProgress.length > 0 ? 
        teamProgress.reduce((sum, progress) => {
          return sum + (progress.totalActualDuration || progress.totalEstimatedDuration || 0);
        }, 0) / teamProgress.length : 0;

      // Calculate efficiency using Route optimization scores
      const efficiency = this.calculateRouteEfficiency(teamRoutes, teamProgress);

      // Calculate team rating from RouteProgress performance data
      const rating = this.calculateTeamRatingFromProgress(teamProgress);

      teamPerformance.push({
        teamId: team.id,
        teamName: team.name,
        routesCompleted: completedRoutes.length,
        tasksCompleted: teamProgress.reduce((sum, p) => sum + (p.completedTasksCount || 0), 0),
        avgCompletionTime: Math.round(avgCompletionTime),
        efficiency,
        rating
      });
    }

    return teamPerformance;
  }

  private async calculateRealTrends(business: any, dateRange: any): Promise<any> {
    const currentEndDate = new Date(dateRange.endDate);
    const currentStartDate = new Date(dateRange.startDate);
    
    // Previous period (same duration)
    const duration = currentEndDate.getTime() - currentStartDate.getTime();
    const previousEndDate = new Date(currentStartDate);
    const previousStartDate = new Date(previousEndDate.getTime() - duration);

    // Get routes for both periods
    const currentRoutes = await this.routeModel.find({
      businessId: business._id,
      date: { $gte: currentStartDate, $lte: currentEndDate },
      status: RouteStatus.COMPLETED,
      isDeleted: false
    });

    const previousRoutes = await this.routeModel.find({
      businessId: business._id,
      date: { $gte: previousStartDate, $lte: previousEndDate },
      status: RouteStatus.COMPLETED,
      isDeleted: false
    });

    // Get RouteProgress for both periods
    const currentProgress = await this.routeProgressModel.find({
      businessId: business._id,
      routeDate: { $gte: currentStartDate, $lte: currentEndDate },
      isDeleted: false
    });

    const previousProgress = await this.routeProgressModel.find({
      businessId: business._id,
      routeDate: { $gte: previousStartDate, $lte: previousEndDate },
      isDeleted: false
    });

    // Calculate metrics for both periods using Route and RouteProgress data
    const currentEfficiency = this.calculateRouteEfficiency(currentRoutes, currentProgress);
    const previousEfficiency = this.calculateRouteEfficiency(previousRoutes, previousProgress);

    const currentAvgTime = this.calculateAvgRouteTimeFromProgress(currentProgress);
    const previousAvgTime = this.calculateAvgRouteTimeFromProgress(previousProgress);

    const currentCosts = this.calculatePeriodCostsFromRoutes(currentRoutes).totalCost;
    const previousCosts = this.calculatePeriodCostsFromRoutes(previousRoutes).totalCost;

    return {
      efficiencyTrend: previousEfficiency > 0 ? 
        Math.round(((currentEfficiency - previousEfficiency) / previousEfficiency) * 100) : 0,
      timeTrend: previousAvgTime > 0 ? 
        Math.round(((currentAvgTime - previousAvgTime) / previousAvgTime) * 100) : 0,
      costTrend: previousCosts > 0 ? 
        Math.round(((currentCosts - previousCosts) / previousCosts) * 100) : 0
    };
  }

  private calculateAvgTaskTime(tasks: any[]): number {
    if (tasks.length === 0) return 0;

    const totalTime = tasks.reduce((sum, task) => {
      return sum + (task.actualPerformance?.actualDuration || task.estimatedDuration);
    }, 0);

    return Math.round(totalTime / tasks.length);
  }

  private calculateCustomerSatisfaction(tasks: any[]): number {
    const tasksWithRating = tasks.filter(t => t.clientSignoff?.satisfactionRating);
    if (tasksWithRating.length === 0) return 88;

    const avgRating = tasksWithRating.reduce((sum, task) => 
      sum + task.clientSignoff.satisfactionRating, 0) / tasksWithRating.length;
    
    return Math.round((avgRating / 5) * 100);
  }

  private async calculateRealTeamMetrics(business: any, startDate: Date, endDate: Date): Promise<any[]> {
    const teams = business.teams || [];
    const teamMetrics = [];

    for (const team of teams) {
      // Get RouteProgress data for this team
      const teamProgress = await this.routeProgressModel.find({
        businessId: business._id,
        teamId: team.id,
        routeDate: { $gte: startDate, $lte: endDate },
        isDeleted: false
      });

      // Get Route data for this team
      const teamRoutes = await this.routeModel.find({
        businessId: business._id,
        teamId: team.id,
        date: { $gte: startDate, $lte: endDate },
        status: RouteStatus.COMPLETED,
        isDeleted: false
      });

      teamMetrics.push({
        teamId: team.id,
        teamName: team.name,
        performance: this.calculateRouteEfficiency(teamRoutes, teamProgress),
        tasksCompleted: teamProgress.reduce((sum, p) => sum + (p.completedTasksCount || 0), 0),
        avgRating: this.calculateTeamRatingFromProgress(teamProgress)
      });
    }

    return teamMetrics;
  }

  private calculateTeamRatingFromProgress(progressData: any[]): number {
    const progressWithRating = progressData.filter(p => p.performance?.customerSatisfactionAvg);
    if (progressWithRating.length === 0) return 4.5;

    return progressWithRating.reduce((sum, progress) => 
      sum + progress.performance.customerSatisfactionAvg, 0) / progressWithRating.length;
  }

  private async validateBusiness(businessId: string): Promise<any> {
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    return business;
  }

  private calculateDateRange(reportType: string, startDate?: string, endDate?: string) {
    const end = endDate ? new Date(endDate) : new Date();
    let start = new Date();

    switch (reportType) {
      case 'daily':
        start.setDate(end.getDate() - 1);
        break;
      case 'weekly':
        start.setDate(end.getDate() - 7);
        break;
      case 'monthly':
        start.setMonth(end.getMonth() - 1);
        break;
      case 'custom':
        if (startDate) {
          start = new Date(startDate);
        } else {
          start.setDate(end.getDate() - 30);
        }
        break;
      default:
        start.setDate(end.getDate() - 30);
    }

    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    };
  }

  private generateRealRecommendations(metrics: any, teamPerformance: any[]): string[] {
    const recommendations = [];

    if (metrics.efficiency < 80) {
      recommendations.push('Route optimization needed - current efficiency below target');
    }

    const lowPerformingTeams = teamPerformance.filter(team => team.efficiency < 75);
    if (lowPerformingTeams.length > 0) {
      recommendations.push(`${lowPerformingTeams.length} teams need performance improvement`);
    }

    if (metrics.totalDistance / Math.max(1, metrics.completedRoutes) > 150) {
      recommendations.push('Routes are longer than optimal - review service area assignments');
    }

    const highTaskTeams = teamPerformance.filter(team => team.tasksCompleted > 20);
    if (highTaskTeams.length > 0) {
      recommendations.push('Consider redistributing workload for optimal performance');
    }

    recommendations.push('Continue monitoring performance metrics weekly');

    return recommendations.slice(0, 5);
  }

  private async storeReport(business: any, report: RouteReport): Promise<void> {
    if (!business.metadata) business.metadata = {};
    if (!business.metadata.routeReports) business.metadata.routeReports = [];

    business.metadata.routeReports.push(report);

    if (business.metadata.routeReports.length > 20) {
      business.metadata.routeReports = business.metadata.routeReports.slice(-20);
    }

    business.markModified('metadata');
    await business.save();
  }

  private formatForCSV(metrics: any, savings: any, trends: any): any[] {
    return [
      { metric: 'Total Routes', value: metrics.overview.totalRoutes, category: 'Overview' },
      { metric: 'Average Efficiency', value: `${metrics.overview.avgEfficiency}%`, category: 'Overview' },
      { metric: 'Total Cost Saved', value: `${savings.periodComparison.savings.totalSavings}`, category: 'Savings' },
      { metric: 'Fuel Savings', value: `${savings.periodComparison.savings.fuelSavings}`, category: 'Savings' },
      { metric: 'Completion Rate', value: `${metrics.efficiencyMetrics.taskCompletionRate}%`, category: 'Performance' }
    ];
  }

  private formatForPDF(metrics: any, savings: any, trends: any): any {
    return {
      title: 'Route Analytics Report',
      generatedAt: new Date().toISOString(),
      sections: [
        { title: 'Performance Overview', data: metrics.overview },
        { title: 'Cost Savings', data: savings.periodComparison.savings },
        { title: 'Efficiency Trends', data: { trend: trends.trends.efficiency, forecast: trends.forecasts.nextMonth } }
      ]
    };
  }
}