// src/controllers/route-analytics.controller.ts
import { 
    Controller, 
    Get, 
    Post,
    Param, 
    Query, 
    Headers, 
    UnauthorizedException, 
    NotFoundException, 
    Logger, 
    InternalServerErrorException,
    BadRequestException,
    Body
  } from '@nestjs/common';
  import { 
    ApiTags, 
    ApiOperation, 
    ApiHeader, 
    ApiParam, 
    ApiResponse, 
    ApiQuery,
    ApiBody
  } from '@nestjs/swagger';
  import { RouteAnalyticsService } from '../services/route-analytics.service';
  import { BusinessService } from '../services/business.service';
  
  @ApiTags('Route Analytics & Reporting')
  @Controller('business/route-analytics')
  @ApiHeader({ 
    name: 'business-x-api-key', 
    required: true, 
    description: 'Business API key for authentication' 
  })
  export class RouteAnalyticsController {
    private readonly logger = new Logger(RouteAnalyticsController.name);
  
    constructor(
      private readonly routeAnalyticsService: RouteAnalyticsService,
      private readonly businessService: BusinessService
    ) {}
  
    // ============================================================================
    // REPORT GENERATION ENDPOINTS
    // ============================================================================
  
    @Post('reports/generate')
    @ApiOperation({ 
      summary: 'Generate route analytics report',
      description: 'Generate comprehensive route analytics report for specified time period'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiBody({
      description: 'Report generation parameters',
      schema: {
        type: 'object',
        properties: {
          reportType: { 
            type: 'string', 
            enum: ['daily', 'weekly', 'monthly', 'custom'],
            example: 'weekly',
            description: 'Type of report to generate'
          },
          startDate: { 
            type: 'string', 
            format: 'date',
            example: '2024-01-01',
            description: 'Start date for custom reports (YYYY-MM-DD)'
          },
          endDate: { 
            type: 'string', 
            format: 'date',
            example: '2024-01-31',
            description: 'End date for custom reports (YYYY-MM-DD)'
          }
        },
        required: ['reportType']
      }
    })
    @ApiResponse({ 
      status: 201, 
      description: 'Route analytics report generated successfully'
    })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid report parameters' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async generateRouteReport(
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Body() reportData: {
        reportType: 'daily' | 'weekly' | 'monthly' | 'custom';
        startDate?: string;
        endDate?: string;
      }
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!reportData.reportType) {
          throw new BadRequestException('Report type is required');
        }
  
        const validReportTypes = ['daily', 'weekly', 'monthly', 'custom'];
        if (!validReportTypes.includes(reportData.reportType)) {
          throw new BadRequestException('Invalid report type. Must be: ' + validReportTypes.join(', '));
        }
  
        // Validate custom date range
        if (reportData.reportType === 'custom') {
          if (!reportData.startDate || !reportData.endDate) {
            throw new BadRequestException('Start date and end date are required for custom reports');
          }
  
          const startDate = new Date(reportData.startDate);
          const endDate = new Date(reportData.endDate);
  
          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
          }
  
          if (startDate >= endDate) {
            throw new BadRequestException('Start date must be before end date');
          }
  
          // Limit custom range to 1 year
          const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds
          if (endDate.getTime() - startDate.getTime() > maxRange) {
            throw new BadRequestException('Custom date range cannot exceed 1 year');
          }
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const report = await this.routeAnalyticsService.generateRouteReport(
          businessId,
          reportData.reportType,
          reportData.startDate,
          reportData.endDate
        );
  
        return {
          success: true,
          message: `${reportData.reportType.charAt(0).toUpperCase() + reportData.reportType.slice(1)} report generated successfully`,
          report
        };
  
      } catch (error) {
        this.logger.error(`Error generating route analytics report: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to generate route analytics report');
      }
    }
  
    // ============================================================================
    // PERFORMANCE METRICS ENDPOINTS
    // ============================================================================
  
    @Get('performance')
    @ApiOperation({ 
      summary: 'Get performance metrics',
      description: 'Retrieve comprehensive route performance metrics for specified timeframe'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ 
      name: 'timeframe', 
      required: false, 
      description: 'Timeframe for metrics (7d, 30d, 60d, 90d)',
      enum: ['7d', '30d', '60d', '90d']
    })
    @ApiResponse({ 
      status: 200, 
      description: 'Performance metrics retrieved successfully'
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getPerformanceMetrics(
      @Query('businessId') businessId: string,
      @Query('timeframe') timeframe: string = '30d',
      @Headers('business-x-api-key') apiKey?: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        const validTimeframes = ['7d', '30d', '60d', '90d'];
        if (!validTimeframes.includes(timeframe)) {
          throw new BadRequestException('Invalid timeframe. Must be: ' + validTimeframes.join(', '));
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const metrics = await this.routeAnalyticsService.getPerformanceMetrics(businessId, timeframe);
  
        return {
          success: true,
          timeframe,
          metrics
        };
  
      } catch (error) {
        this.logger.error(`Error getting performance metrics: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to retrieve performance metrics');
      }
    }
  
    @Get('cost-savings')
    @ApiOperation({ 
      summary: 'Calculate cost savings',
      description: 'Calculate cost savings achieved through route optimization'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ 
      name: 'comparisonPeriod', 
      required: false, 
      description: 'Period for cost comparison (30d, 60d, 90d)',
      enum: ['30d', '60d', '90d']
    })
    @ApiResponse({ 
      status: 200, 
      description: 'Cost savings calculated successfully'
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async calculateCostSavings(
      @Query('businessId') businessId: string,
      @Query('comparisonPeriod') comparisonPeriod: string = '30d',
      @Headers('business-x-api-key') apiKey?: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        const validPeriods = ['30d', '60d', '90d'];
        if (!validPeriods.includes(comparisonPeriod)) {
          throw new BadRequestException('Invalid comparison period. Must be: ' + validPeriods.join(', '));
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const costSavings = await this.routeAnalyticsService.calculateCostSavings(businessId, comparisonPeriod);
  
        return {
          success: true,
          comparisonPeriod,
          costSavings
        };
  
      } catch (error) {
        this.logger.error(`Error calculating cost savings: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to calculate cost savings');
      }
    }
  
    @Get('efficiency-trends')
    @ApiOperation({ 
      summary: 'Get efficiency trends',
      description: 'Retrieve efficiency trends and forecasting data'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ 
      name: 'timeframe', 
      required: false, 
      description: 'Timeframe for trend analysis (30d, 60d, 90d, 180d)',
      enum: ['30d', '60d', '90d', '180d']
    })
    @ApiResponse({ 
      status: 200, 
      description: 'Efficiency trends retrieved successfully'
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getEfficiencyTrends(
      @Query('businessId') businessId: string,
      @Query('timeframe') timeframe: string = '90d',
      @Headers('business-x-api-key') apiKey?: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        const validTimeframes = ['30d', '60d', '90d', '180d'];
        if (!validTimeframes.includes(timeframe)) {
          throw new BadRequestException('Invalid timeframe. Must be: ' + validTimeframes.join(', '));
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const trends = await this.routeAnalyticsService.getEfficiencyTrends(businessId, timeframe);
  
        return {
          success: true,
          trends
        };
  
      } catch (error) {
        this.logger.error(`Error getting efficiency trends: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to retrieve efficiency trends');
      }
    }
  
    // ============================================================================
    // EXPORT ENDPOINTS
    // ============================================================================
  
    @Get('export')
    @ApiOperation({ 
      summary: 'Export analytics data',
      description: 'Export route analytics data in various formats'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ 
      name: 'format', 
      required: false, 
      description: 'Export format',
      enum: ['csv', 'json', 'pdf']
    })
    @ApiQuery({ 
      name: 'timeframe', 
      required: false, 
      description: 'Timeframe for export data (7d, 30d, 60d, 90d)',
      enum: ['7d', '30d', '60d', '90d']
    })
    @ApiResponse({ 
      status: 200, 
      description: 'Analytics data exported successfully'
    })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid export parameters' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async exportAnalytics(
      @Query('businessId') businessId: string,
      @Query('format') format: 'csv' | 'json' | 'pdf' = 'csv',
      @Query('timeframe') timeframe: string = '30d',
      @Headers('business-x-api-key') apiKey?: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        const validFormats = ['csv', 'json', 'pdf'];
        if (!validFormats.includes(format)) {
          throw new BadRequestException('Invalid export format. Must be: ' + validFormats.join(', '));
        }
  
        const validTimeframes = ['7d', '30d', '60d', '90d'];
        if (!validTimeframes.includes(timeframe)) {
          throw new BadRequestException('Invalid timeframe. Must be: ' + validTimeframes.join(', '));
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const exportResult = await this.routeAnalyticsService.exportAnalytics(businessId, format, timeframe);
  
        return {
          ...exportResult,
          format,
          timeframe,
          exportedAt: new Date().toISOString()
        };
  
      } catch (error) {
        this.logger.error(`Error exporting analytics data: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to export analytics data');
      }
    }
  
    // ============================================================================
    // DASHBOARD SUMMARY ENDPOINTS
    // ============================================================================
  
    @Get('dashboard')
    @ApiOperation({ 
      summary: 'Get analytics dashboard summary',
      description: 'Get condensed analytics data for dashboard display'
    })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ 
      status: 200, 
      description: 'Dashboard summary retrieved successfully'
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getDashboardSummary(
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey?: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        // Get condensed data for dashboard
        const [metrics, costSavings, trends] = await Promise.all([
          this.routeAnalyticsService.getPerformanceMetrics(businessId, '7d'),
          this.routeAnalyticsService.calculateCostSavings(businessId, '30d'),
          this.routeAnalyticsService.getEfficiencyTrends(businessId, '30d')
        ]);
  
        const dashboardSummary = {
          overview: {
            totalRoutes: metrics.overview.totalRoutes,
            avgEfficiency: metrics.overview.avgEfficiency,
            costSaved: costSavings.periodComparison.savings.totalSavings,
            efficiencyTrend: trends.trends.efficiency
          },
          quickStats: {
            onTimePercentage: metrics.timeMetrics.onTimePercentage,
            customerSatisfaction: metrics.efficiencyMetrics.customerSatisfaction,
            fuelEfficiency: metrics.efficiencyMetrics.fuelEfficiency,
            taskCompletionRate: metrics.efficiencyMetrics.taskCompletionRate
          },
          topPerformingTeams: metrics.teamMetrics
            .sort((a, b) => b.performance - a.performance)
            .slice(0, 5)
            .map(team => ({
              name: team.teamName,
              performance: team.performance,
              tasksCompleted: team.tasksCompleted
            })),
          alerts: this.generateDashboardAlerts(metrics, costSavings, trends)
        };
  
        return {
          success: true,
          dashboardSummary,
          lastUpdated: new Date().toISOString()
        };
  
      } catch (error) {
        this.logger.error(`Error getting dashboard summary: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to retrieve dashboard summary');
      }
    }
  
    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================
  
    /**
     * Validate business API key
     */
    private async validateBusinessApiKey(businessId: string, apiKey: string) {
      if (!apiKey) {
        throw new UnauthorizedException('Business API key missing');
      }
      
      const business = await this.businessService.findByIdAndApiKey(businessId, apiKey);
      if (!business) {
        throw new UnauthorizedException('Invalid API key for this business');
      }
      
      return business;
    }
  
    /**
     * Generate dashboard alerts
     */
    private generateDashboardAlerts(metrics: any, costSavings: any, trends: any): any[] {
      const alerts = [];
  
      if (metrics.overview.avgEfficiency < 75) {
        alerts.push({
          type: 'warning',
          title: 'Low Route Efficiency',
          message: `Current efficiency is ${metrics.overview.avgEfficiency}% - below target of 75%`,
          action: 'Review route optimization settings'
        });
      }
  
      if (metrics.timeMetrics.onTimePercentage < 85) {
        alerts.push({
          type: 'warning',
          title: 'On-Time Performance Issue',
          message: `Only ${metrics.timeMetrics.onTimePercentage}% of routes completed on time`,
          action: 'Analyze delay patterns and adjust schedules'
        });
      }
  
      if (trends.trends.efficiency === 'declining') {
        alerts.push({
          type: 'error',
          title: 'Declining Efficiency Trend',
          message: 'Route efficiency has been declining over the past month',
          action: 'Investigate root causes and implement corrective measures'
        });
      }
  
      if (costSavings.periodComparison.savings.percentageSaved > 20) {
        alerts.push({
          type: 'success',
          title: 'Excellent Cost Savings',
          message: `Achieved ${costSavings.periodComparison.savings.percentageSaved}% cost reduction`,
          action: 'Continue current optimization strategies'
        });
      }
  
      return alerts.slice(0, 3); // Return top 3 alerts
    }
  }