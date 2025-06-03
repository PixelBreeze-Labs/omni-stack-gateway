// src/services/route-analytics.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business } from '../schemas/business.schema';

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
    efficiencyTrend: number; // percentage change
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

/**
 * TODO: FUTURE IMPROVEMENTS FOR ROUTE ANALYTICS
 * 
 * Current Implementation: Basic analytics with mock data and simple calculations
 * 
 * Planned Enhancements:
 * - Integration with real-time GPS tracking data for accurate metrics
 * - Machine learning models for predictive analytics and forecasting
 * - Advanced data visualization and dashboard integration
 * - Integration with business intelligence tools (Power BI, Tableau)
 * - Customer satisfaction correlation with route performance
 * - Weather impact analysis on route efficiency
 * - Competitive benchmarking against industry standards
 * - Carbon footprint and environmental impact tracking
 * - Integration with financial systems for accurate cost calculations
 * - Automated report generation and scheduling
 * - Real-time alerting for performance anomalies
 * - Integration with fleet management systems
 * - Advanced statistical analysis and trend identification
 * - ROI calculations for route optimization investments
 * - Integration with customer feedback and rating systems
 */

@Injectable()
export class RouteAnalyticsService {
  private readonly logger = new Logger(RouteAnalyticsService.name);

  constructor(
    @InjectModel(Business.name) private businessModel: Model<Business>,
  ) {}

  // ============================================================================
  // REPORT GENERATION
  // ============================================================================

  /**
   * Generate comprehensive route report
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
      
      // Generate report data
      const reportId = `report-${Date.now()}`;
      const metrics = await this.calculateReportMetrics(business, dateRange);
      const teamPerformance = await this.calculateTeamPerformance(business, dateRange);
      const trends = await this.calculateTrends(business, dateRange);
      const recommendations = this.generateRecommendations(metrics, teamPerformance);

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
   * Get performance metrics
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

      const dateRange = {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      };

      // Get teams for analysis
      const teams = business.teams || [];
      
      // Calculate metrics (mock implementation with realistic data)
      const totalRoutes = teams.length * Math.floor(days / 7) * 5; // ~5 routes per team per week
      const completedRoutes = Math.floor(totalRoutes * 0.92); // 92% completion rate

      const metrics: PerformanceMetrics = {
        overview: {
          totalRoutes: completedRoutes,
          avgEfficiency: 87,
          totalDistanceSaved: Math.floor(completedRoutes * 12.5), // 12.5km saved per route
          totalTimeSaved: Math.floor(completedRoutes * 45), // 45min saved per route
          totalCostSaved: Math.floor(completedRoutes * 28.5) // $28.50 saved per route
        },
        timeMetrics: {
          avgRouteTime: 185, // minutes
          avgTaskTime: 42, // minutes
          onTimePercentage: 89,
          delayReasons: {
            'Traffic': 35,
            'Customer Availability': 25,
            'Equipment Issues': 20,
            'Weather': 15,
            'Other': 5
          }
        },
        efficiencyMetrics: {
          routeOptimizationScore: 87,
          fuelEfficiency: 91,
          taskCompletionRate: 94,
          customerSatisfaction: 88
        },
        teamMetrics: teams.map((team: any, index: number) => ({
          teamId: team.id,
          teamName: team.name,
          performance: 75 + Math.floor(Math.random() * 20), // 75-95%
          tasksCompleted: Math.floor((days / 7) * 15 + Math.random() * 10), // ~15 tasks per week
          avgRating: 4.2 + Math.random() * 0.6 // 4.2-4.8 rating
        }))
      };

      return metrics;

    } catch (error) {
      this.logger.error(`Error getting performance metrics: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Calculate cost savings
   */
  async calculateCostSavings(
    businessId: string,
    comparisonPeriod: string = '30d'
  ): Promise<CostSavings> {
    try {
      const business = await this.validateBusiness(businessId);

      const days = parseInt(comparisonPeriod.replace('d', '')) || 30;
      const teams = business.teams || [];
      const avgRoutesPerTeam = Math.floor(days / 7) * 5; // 5 routes per week
      const totalRoutes = teams.length * avgRoutesPerTeam;

      // Mock cost calculations with realistic numbers
      const currentPeriod = {
        totalCost: totalRoutes * 85, // $85 per route
        fuelCost: totalRoutes * 35, // $35 fuel per route
        timeCost: totalRoutes * 40, // $40 time cost per route
        maintenanceCost: totalRoutes * 10 // $10 maintenance per route
      };

      // Previous period (without optimization) - higher costs
      const previousPeriod = {
        totalCost: totalRoutes * 115, // $115 per route (35% higher)
        fuelCost: totalRoutes * 50, // $50 fuel per route
        timeCost: totalRoutes * 55, // $55 time cost per route
        maintenanceCost: totalRoutes * 10 // Same maintenance
      };

      const savings = {
        totalSavings: previousPeriod.totalCost - currentPeriod.totalCost,
        fuelSavings: previousPeriod.fuelCost - currentPeriod.fuelCost,
        timeSavings: previousPeriod.timeCost - currentPeriod.timeCost,
        maintenanceSavings: previousPeriod.maintenanceCost - currentPeriod.maintenanceCost,
        percentageSaved: Math.round(((previousPeriod.totalCost - currentPeriod.totalCost) / previousPeriod.totalCost) * 100)
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
          routeOptimization: Math.round(savings.totalSavings * 0.4), // 40% from route optimization
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
   * Get efficiency trends
   */
  async getEfficiencyTrends(
    businessId: string,
    timeframe: string = '90d'
  ): Promise<EfficiencyTrends> {
    try {
      const business = await this.validateBusiness(businessId);

      const days = parseInt(timeframe.replace('d', '')) || 90;
      const dataPoints = [];

      // Generate trend data points
      for (let i = 0; i < Math.min(days, 30); i++) { // Max 30 data points
        const date = new Date();
        date.setDate(date.getDate() - (days - 1 - i * Math.floor(days / 30)));
        
        // Simulate improving efficiency over time with some variance
        const baseEfficiency = 75;
        const improvement = (i / 30) * 15; // 15% improvement over time
        const variance = (Math.random() - 0.5) * 10; // ±5% variance
        const efficiency = Math.max(60, Math.min(95, baseEfficiency + improvement + variance));

        dataPoints.push({
          date: date.toISOString().split('T')[0],
          efficiency: Math.round(efficiency),
          routeCount: Math.floor(5 + Math.random() * 10), // 5-15 routes per period
          avgTime: Math.round(180 + Math.random() * 60), // 180-240 minutes
          costs: Math.round(2000 + Math.random() * 1000) // $2000-3000
        });
      }

      // Calculate trends
      const firstHalf = dataPoints.slice(0, Math.floor(dataPoints.length / 2));
      const secondHalf = dataPoints.slice(Math.floor(dataPoints.length / 2));

      const avgEfficiencyFirst = firstHalf.reduce((sum, dp) => sum + dp.efficiency, 0) / firstHalf.length;
      const avgEfficiencySecond = secondHalf.reduce((sum, dp) => sum + dp.efficiency, 0) / secondHalf.length;
      
      const avgCostsFirst = firstHalf.reduce((sum, dp) => sum + dp.costs, 0) / firstHalf.length;
      const avgCostsSecond = secondHalf.reduce((sum, dp) => sum + dp.costs, 0) / secondHalf.length;

      const avgRoutesFirst = firstHalf.reduce((sum, dp) => sum + dp.routeCount, 0) / firstHalf.length;
      const avgRoutesSecond = secondHalf.reduce((sum, dp) => sum + dp.routeCount, 0) / secondHalf.length;

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
            expectedEfficiency: Math.round(avgEfficiencySecond + (avgEfficiencySecond - avgEfficiencyFirst)),
            expectedCosts: Math.round(avgCostsSecond + (avgCostsSecond - avgCostsFirst)),
            confidence: 75 + Math.floor(Math.random() * 20) // 75-95% confidence
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
   * Export analytics data
   */
  async exportAnalytics(
    businessId: string,
    format: 'csv' | 'json' | 'pdf' = 'csv',
    timeframe: string = '30d'
  ): Promise<{ success: boolean; data: any; message: string }> {
    try {
      const business = await this.validateBusiness(businessId);

      // Get all analytics data
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
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Validate business exists
   */
  private async validateBusiness(businessId: string): Promise<any> {
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    return business;
  }

  /**
   * Calculate date range based on report type
   */
  private calculateDateRange(
    reportType: string,
    startDate?: string,
    endDate?: string
  ): { startDate: string; endDate: string } {
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

  /**
   * Calculate report metrics
   */
  private async calculateReportMetrics(business: any, dateRange: any): Promise<any> {
    const teams = business.teams || [];
    const days = Math.ceil((new Date(dateRange.endDate).getTime() - new Date(dateRange.startDate).getTime()) / (1000 * 60 * 60 * 24));
    
    return {
      totalRoutes: teams.length * Math.floor(days / 7) * 5,
      completedRoutes: Math.floor(teams.length * Math.floor(days / 7) * 5 * 0.92),
      totalTasks: teams.length * Math.floor(days / 7) * 15,
      completedTasks: Math.floor(teams.length * Math.floor(days / 7) * 15 * 0.94),
      totalDistance: teams.length * Math.floor(days / 7) * 120, // km
      totalTime: teams.length * Math.floor(days / 7) * 8 * 60, // minutes
      fuelCost: teams.length * Math.floor(days / 7) * 175, // dollars
      efficiency: 87
    };
  }

  /**
   * Calculate team performance
   */
  private async calculateTeamPerformance(business: any, dateRange: any): Promise<any[]> {
    const teams = business.teams || [];
    
    return teams.map((team: any) => ({
      teamId: team.id,
      teamName: team.name,
      routesCompleted: Math.floor(Math.random() * 20) + 10,
      tasksCompleted: Math.floor(Math.random() * 60) + 30,
      avgCompletionTime: Math.floor(Math.random() * 60) + 120, // 120-180 minutes
      efficiency: Math.floor(Math.random() * 20) + 75, // 75-95%
      rating: 4.0 + Math.random() * 1.0 // 4.0-5.0
    }));
  }

  /**
   * Calculate trends
   */
  private async calculateTrends(business: any, dateRange: any): Promise<any> {
    return {
      efficiencyTrend: Math.floor(Math.random() * 20) - 5, // -5% to +15%
      timeTrend: Math.floor(Math.random() * 10) - 10, // -10% to 0%
      costTrend: Math.floor(Math.random() * 10) - 15 // -15% to -5%
    };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(metrics: any, teamPerformance: any[]): string[] {
    const recommendations = [];

    if (metrics.efficiency < 80) {
      recommendations.push('Consider route optimization to improve overall efficiency');
    }

    const lowPerformingTeams = teamPerformance.filter(team => team.efficiency < 75);
    if (lowPerformingTeams.length > 0) {
      recommendations.push(`Provide additional training for ${lowPerformingTeams.length} underperforming teams`);
    }

    if (metrics.totalDistance / metrics.totalRoutes > 150) {
      recommendations.push('Routes are longer than optimal - review service area assignments');
    }

    recommendations.push('Schedule regular vehicle maintenance to improve fuel efficiency');
    recommendations.push('Consider implementing real-time traffic updates for better routing');

    return recommendations.slice(0, 5); // Return top 5 recommendations
  }

  /**
   * Store report in business metadata
   */
  private async storeReport(business: any, report: RouteReport): Promise<void> {
    if (!business.metadata) business.metadata = {};
    if (!business.metadata.routeReports) business.metadata.routeReports = [];

    business.metadata.routeReports.push(report);

    // Keep only last 20 reports
    if (business.metadata.routeReports.length > 20) {
      business.metadata.routeReports = business.metadata.routeReports.slice(-20);
    }

    business.markModified('metadata');
    await business.save();
  }

  /**
   * Format data for CSV export
   */
  private formatForCSV(metrics: any, savings: any, trends: any): any[] {
    return [
      {
        metric: 'Total Routes',
        value: metrics.overview.totalRoutes,
        category: 'Overview'
      },
      {
        metric: 'Average Efficiency',
        value: `${metrics.overview.avgEfficiency}%`,
        category: 'Overview'
      },
      {
        metric: 'Total Cost Saved',
        value: `$${savings.periodComparison.savings.totalSavings}`,
        category: 'Savings'
      },
      {
        metric: 'Fuel Savings',
        value: `$${savings.periodComparison.savings.fuelSavings}`,
        category: 'Savings'
      }
    ];
  }

  /**
   * Format data for PDF export
   */
  private formatForPDF(metrics: any, savings: any, trends: any): any {
    return {
      title: 'Route Analytics Report',
      generatedAt: new Date().toISOString(),
      sections: [
        {
          title: 'Performance Overview',
          data: metrics.overview
        },
        {
          title: 'Cost Savings',
          data: savings.periodComparison.savings
        },
        {
          title: 'Efficiency Trends',
          data: {
            trend: trends.trends.efficiency,
            forecast: trends.forecasts.nextMonth
          }
        }
      ]
    };
  }
}