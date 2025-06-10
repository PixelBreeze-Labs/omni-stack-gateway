// src/controllers/service-area.controller.ts
import { 
  Controller, 
  Get, 
  Post,
  Put,
  Param, 
  Query, 
  Headers, 
  UnauthorizedException, 
  NotFoundException, 
  Logger, 
  InternalServerErrorException,
  BadRequestException,
  Body,
  Req
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
import { ServiceAreaService } from '../services/service-area.service';
import { BusinessService } from '../services/business.service';
import { FieldTaskService } from '../services/field-task.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FieldTask, FieldTaskStatus } from '../schemas/field-task.schema';
import { ConstructionSite } from '../schemas/construction-site.schema';

@ApiTags('Service Area Management')
@Controller('business/service-areas')
@ApiHeader({ 
  name: 'business-x-api-key', 
  required: true, 
  description: 'Business API key for authentication' 
})
export class ServiceAreaController {
  private readonly logger = new Logger(ServiceAreaController.name);

  constructor(
    private readonly serviceAreaService: ServiceAreaService,
    private readonly businessService: BusinessService,
    private readonly fieldTaskService: FieldTaskService,
    @InjectModel(FieldTask.name) private fieldTaskModel: Model<FieldTask>,
    @InjectModel(ConstructionSite.name) private constructionSiteModel: Model<ConstructionSite>,
  ) {}

  // ============================================================================
  // SERVICE AREA CRUD ENDPOINTS
  // ============================================================================

  @Get()
  @ApiOperation({ 
    summary: 'Get service areas',
    description: 'Retrieve service areas with optional filtering by status, region, or priority'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (active, inactive, maintenance, expanding)' })
  @ApiQuery({ name: 'region', required: false, description: 'Filter by region name' })
  @ApiQuery({ name: 'priority', required: false, description: 'Filter by priority (high, medium, low)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Service areas retrieved successfully'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async getServiceAreas(
    @Query('businessId') businessId: string,
    @Query('status') status?: string,
    @Query('region') region?: string,
    @Query('priority') priority?: string,
    @Headers('business-x-api-key') apiKey?: string,
    @Req() req?: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      const filters = {
        status,
        region,
        priority
      };

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const serviceAreas = await this.serviceAreaService.getServiceAreas(
        businessId, 
        filters,
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

      return {
        success: true,
        serviceAreas,
        total: serviceAreas.length
      };

    } catch (error) {
      this.logger.error(`Error getting service areas: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve service areas');
    }
  }

  @Post()
  @ApiOperation({ 
    summary: 'Create a new service area',
    description: 'Create a new service area with coverage information and manager details'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiBody({
    description: 'Service area creation data',
    schema: {
      type: 'object',
      properties: {
        name: { 
          type: 'string', 
          example: 'Downtown District',
          description: 'Service area name'
        },
        region: { 
          type: 'string', 
          example: 'Central Region',
          description: 'Geographic region'
        },
        priority: { 
          type: 'string', 
          enum: ['high', 'medium', 'low'],
          example: 'high',
          description: 'Service area priority level'
        },
        coverage: {
          type: 'object',
          properties: {
            area: { 
              type: 'number', 
              example: 25.5,
              description: 'Coverage area in square kilometers'
            },
            population: { 
              type: 'number', 
              example: 50000,
              description: 'Population within the area'
            },
            boundaries: {
              type: 'object',
              properties: {
                coordinates: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      lat: { type: 'number' },
                      lng: { type: 'number' }
                    }
                  },
                  description: 'Array of boundary coordinates'
                }
              }
            }
          },
          required: ['area', 'population']
        },
        manager: {
          type: 'object',
          properties: {
            name: { 
              type: 'string', 
              example: 'John Smith',
              description: 'Area manager name'
            },
            email: { 
              type: 'string', 
              example: 'john.smith@company.com',
              description: 'Manager email address'
            },
            phone: { 
              type: 'string', 
              example: '+1-555-0123',
              description: 'Manager phone number'
            }
          },
          required: ['name', 'email', 'phone']
        },
        metadata: { 
          type: 'object', 
          description: 'Additional custom data'
        }
      },
      required: ['name', 'region', 'priority', 'coverage', 'manager']
    }
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Service area created successfully'
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid service area data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async createServiceArea(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Body() areaData: any,
    @Req() req: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const result = await this.serviceAreaService.createServiceArea({
        businessId,
        ...areaData
      },
      adminUserId, // ⬅️ FILL EXISTING userId parameter
      req // ⬅️ FILL EXISTING req parameter
      );

      return result;

    } catch (error) {
      this.logger.error(`Error creating service area: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create service area');
    }
  }

  @Put(':areaId')
  @ApiOperation({ 
    summary: 'Update a service area',
    description: 'Update an existing service area with new information'
  })
  @ApiParam({ name: 'areaId', description: 'Service Area ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiBody({
    description: 'Service area update data',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Service area name' },
        region: { type: 'string', description: 'Geographic region' },
        status: { 
          type: 'string', 
          enum: ['active', 'inactive', 'maintenance', 'expanding'],
          description: 'Service area status'
        },
        priority: { 
          type: 'string', 
          enum: ['high', 'medium', 'low'],
          description: 'Priority level'
        },
        coverage: {
          type: 'object',
          properties: {
            area: { type: 'number', description: 'Coverage area in km²' },
            population: { type: 'number', description: 'Population within area' },
            boundaries: {
              type: 'object',
              properties: {
                coordinates: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      lat: { type: 'number' },
                      lng: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        },
        manager: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Manager name' },
            email: { type: 'string', description: 'Manager email' },
            phone: { type: 'string', description: 'Manager phone' }
          }
        },
        metadata: { type: 'object', description: 'Additional custom data' }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Service area updated successfully'
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid update data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or service area not found' })
  async updateServiceArea(
    @Param('areaId') areaId: string,
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Body() updateData: any,
    @Req() req: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!areaId) {
        throw new BadRequestException('Area ID is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const result = await this.serviceAreaService.updateServiceArea(
        businessId, 
        areaId, 
        updateData,
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

      return result;

    } catch (error) {
      this.logger.error(`Error updating service area: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update service area');
    }
  }

  // ============================================================================
  // COVERAGE ANALYSIS ENDPOINTS
  // ============================================================================

  @Post('analyze')
  @ApiOperation({ 
    summary: 'Analyze coverage optimization',
    description: 'Perform AI-powered analysis of service area coverage and provide optimization recommendations'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Coverage analysis completed successfully'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async analyzeCoverage(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Req() req: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const result = await this.serviceAreaService.analyzeCoverage(
        businessId,
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

      return result;

    } catch (error) {
      this.logger.error(`Error analyzing coverage: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to analyze coverage');
    }
  }

  @Get('stats')
  @ApiOperation({ 
    summary: 'Get coverage statistics',
    description: 'Retrieve comprehensive coverage statistics and performance metrics'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Coverage statistics retrieved successfully'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async getCoverageStats(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Req() req: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const stats = await this.serviceAreaService.getCoverageStats(
        businessId,
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

      return {
        success: true,
        stats
      };

    } catch (error) {
      this.logger.error(`Error getting coverage statistics: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve coverage statistics');
    }
  }

  // ============================================================================
  // TEAM ASSIGNMENT ENDPOINTS
  // ============================================================================

  @Post(':areaId/assign-team')
  @ApiOperation({ 
    summary: 'Assign team to service area',
    description: 'Assign a team to a specific service area for coverage'
  })
  @ApiParam({ name: 'areaId', description: 'Service Area ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiBody({
    description: 'Team assignment data',
    schema: {
      type: 'object',
      properties: {
        teamId: { 
          type: 'string', 
          example: 'team-123',
          description: 'ID of the team to assign to this service area'
        }
      },
      required: ['teamId']
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Team assigned to service area successfully'
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid assignment data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business, service area, or team not found' })
  async assignTeamToArea(
    @Param('areaId') areaId: string,
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Body() assignmentData: {
      teamId: string;
    },
    @Req() req: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!areaId) {
        throw new BadRequestException('Area ID is required');
      }

      if (!assignmentData.teamId) {
        throw new BadRequestException('Team ID is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const result = await this.serviceAreaService.assignTeamToArea(
        businessId,
        areaId,
        assignmentData.teamId,
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

      return result;

    } catch (error) {
      this.logger.error(`Error assigning team to service area: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to assign team to service area');
    }
  }

  // ============================================================================
  // REPORTING AND ANALYTICS ENDPOINTS
  // ============================================================================

  @Get('performance')
  @ApiOperation({ 
    summary: 'Get service area performance metrics',
    description: 'Retrieve detailed performance metrics for all service areas'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiQuery({ name: 'region', required: false, description: 'Filter by specific region' })
  @ApiQuery({ name: 'timeframe', required: false, description: 'Time frame for metrics (7d, 30d, 90d)', enum: ['7d', '30d', '90d'] })
  @ApiResponse({ 
    status: 200, 
    description: 'Performance metrics retrieved successfully'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async getServiceAreaPerformance(
    @Query('businessId') businessId: string,
    @Query('region') region?: string,
    @Query('timeframe') timeframe?: string,
    @Headers('business-x-api-key') apiKey?: string,
    @Req() req?: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // Get service areas with filters
      const filters = { region };
      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const serviceAreas = await this.serviceAreaService.getServiceAreas(
        businessId, 
        filters,
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

      // Calculate real performance data with trends
      const performance = await Promise.all(
        serviceAreas.map(async (area) => {
          const trend = await this.calculateRealTrend(area.id, businessId, timeframe || '30d');
          const historicalMetrics = await this.getHistoricalMetrics(area.id, businessId, timeframe || '30d');
          
          return {
            areaId: area.id,
            name: area.name,
            region: area.region,
            status: area.status,
            priority: area.priority,
            metrics: area.metrics,
            coverage: area.coverage,
            teamsCount: area.teams_count,
            efficiency: this.calculateEfficiency(area.metrics),
            trend,
            historicalData: historicalMetrics
          };
        })
      );

      // Calculate regional summaries using real data
      const regions = [...new Set(serviceAreas.map(area => area.region))];
      const regionalSummary = regions.map(regionName => {
        const regionAreas = serviceAreas.filter(area => area.region === regionName);
        return {
          region: regionName,
          totalAreas: regionAreas.length,
          activeAreas: regionAreas.filter(area => area.status === 'active').length,
          totalCustomers: regionAreas.reduce((sum, area) => sum + area.metrics.active_customers, 0),
          totalRevenue: regionAreas.reduce((sum, area) => sum + area.metrics.monthly_revenue, 0),
          avgSatisfaction: regionAreas.length > 0 ? 
            Math.round(regionAreas.reduce((sum, area) => sum + area.metrics.satisfaction_score, 0) / regionAreas.length) : 0,
          avgResponseTime: regionAreas.length > 0 ?
            Math.round(regionAreas.reduce((sum, area) => sum + area.metrics.response_time, 0) / regionAreas.length) : 0
        };
      });

      return {
        success: true,
        timeframe: timeframe || '30d',
        performance,
        regionalSummary,
        summary: {
          totalAreas: serviceAreas.length,
          totalCustomers: serviceAreas.reduce((sum, area) => sum + area.metrics.active_customers, 0),
          totalRevenue: serviceAreas.reduce((sum, area) => sum + area.metrics.monthly_revenue, 0),
          avgEfficiency: performance.length > 0 ? 
            Math.round(performance.reduce((sum, area) => sum + area.efficiency, 0) / performance.length) : 0
        }
      };

    } catch (error) {
      this.logger.error(`Error getting service area performance: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve service area performance');
    }
  }

  @Get('recommendations')
  @ApiOperation({ 
    summary: 'Get optimization recommendations',
    description: 'Get AI-powered recommendations for service area optimization'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Optimization recommendations retrieved successfully'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async getOptimizationRecommendations(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Req() req: any
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // Trigger analysis to get fresh recommendations
      // 🎯 PASS TO EXISTING SERVICE PARAMETERS
      const analysisResult = await this.serviceAreaService.analyzeCoverage(
        businessId,
        adminUserId, // ⬅️ FILL EXISTING userId parameter
        req // ⬅️ FILL EXISTING req parameter
      );

      return {
        success: true,
        recommendations: analysisResult.analysis.recommendations,
        opportunities: analysisResult.analysis.opportunities,
        issues: analysisResult.analysis.issues,
        summary: analysisResult.analysis.summary,
        lastAnalyzed: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error(`Error getting optimization recommendations: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve optimization recommendations');
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS - REAL DATA CALCULATIONS
  // ============================================================================

  /**
   * Validate business API key and return business object
   */
  private async validateBusinessApiKey(businessId: string, apiKey: string) {
    if (!apiKey) {
      throw new UnauthorizedException('Business API key missing');
    }
    
    const business = await this.businessService.findByIdAndApiKey(businessId, apiKey);
    if (!business) {
      throw new UnauthorizedException('Invalid API key for this business');
    }

    // Ensure business has adminUserId
    if (!business.adminUserId) {
      this.logger.warn(`Business ${businessId} missing adminUserId - activities will not be tracked`);
    }
    
    return business; // ⬅️ RETURN BUSINESS (instead of void)
  }

  /**
   * Calculate efficiency score for a service area
   */
  private calculateEfficiency(metrics: any): number {
    // Calculate efficiency based on satisfaction, completion rate, and response time
    const satisfactionScore = (metrics.satisfaction_score / 100) * 40; // 40% weight
    const completionScore = (metrics.completion_rate / 100) * 35; // 35% weight
    const responseScore = Math.max(0, (60 - metrics.response_time) / 60) * 25; // 25% weight (lower time = higher score)
    
    return Math.round(satisfactionScore + completionScore + responseScore);
  }

  /**
   * Calculate real trend for a service area using historical data
   */
  private async calculateRealTrend(areaId: string, businessId: string, timeframe: string): Promise<string> {
    try {
      const days = parseInt(timeframe.replace('d', '')) || 30;
      const currentPeriodStart = new Date();
      currentPeriodStart.setDate(currentPeriodStart.getDate() - days);
      
      const previousPeriodStart = new Date();
      previousPeriodStart.setDate(previousPeriodStart.getDate() - (days * 2));
      const previousPeriodEnd = new Date();
      previousPeriodEnd.setDate(previousPeriodEnd.getDate() - days);

      // Get current period metrics
      const currentTasks = await this.fieldTaskModel.find({
        businessId,
        siteId: areaId,
        scheduledDate: { $gte: currentPeriodStart },
        isDeleted: false
      });

      // Get previous period metrics
      const previousTasks = await this.fieldTaskModel.find({
        businessId,
        siteId: areaId,
        scheduledDate: { $gte: previousPeriodStart, $lte: previousPeriodEnd },
        isDeleted: false
      });

      if (previousTasks.length === 0) {
        return 'stable'; // Not enough historical data
      }

      // Calculate completion rates
      const currentCompletionRate = currentTasks.length > 0 ? 
        (currentTasks.filter(t => t.status === FieldTaskStatus.COMPLETED).length / currentTasks.length) * 100 : 0;
      
      const previousCompletionRate = previousTasks.length > 0 ?
        (previousTasks.filter(t => t.status === FieldTaskStatus.COMPLETED).length / previousTasks.length) * 100 : 0;

      // Calculate satisfaction trends
      const currentCompletedTasks = currentTasks.filter(t => t.status === FieldTaskStatus.COMPLETED && t.clientSignoff?.satisfactionRating);
      const previousCompletedTasks = previousTasks.filter(t => t.status === FieldTaskStatus.COMPLETED && t.clientSignoff?.satisfactionRating);

      const currentSatisfaction = currentCompletedTasks.length > 0 ?
        currentCompletedTasks.reduce((sum, t) => sum + (t.clientSignoff?.satisfactionRating || 0), 0) / currentCompletedTasks.length : 0;
      
      const previousSatisfaction = previousCompletedTasks.length > 0 ?
        previousCompletedTasks.reduce((sum, t) => sum + (t.clientSignoff?.satisfactionRating || 0), 0) / previousCompletedTasks.length : 0;

      // Calculate response time trends
      const currentResponseTime = currentCompletedTasks.length > 0 ?
        currentCompletedTasks.reduce((sum, t) => sum + (t.actualPerformance?.actualDuration || 0), 0) / currentCompletedTasks.length : 0;
      
      const previousResponseTime = previousCompletedTasks.length > 0 ?
        previousCompletedTasks.reduce((sum, t) => sum + (t.actualPerformance?.actualDuration || 0), 0) / previousCompletedTasks.length : 0;

      // Determine trend based on multiple factors
      let improvementScore = 0;
      
      // Completion rate improvement (30% weight)
      if (currentCompletionRate > previousCompletionRate + 5) improvementScore += 3;
      else if (currentCompletionRate > previousCompletionRate) improvementScore += 1;
      else if (currentCompletionRate < previousCompletionRate - 5) improvementScore -= 3;
      else if (currentCompletionRate < previousCompletionRate) improvementScore -= 1;
      
      // Satisfaction improvement (40% weight)
      if (currentSatisfaction > previousSatisfaction + 0.3) improvementScore += 4;
      else if (currentSatisfaction > previousSatisfaction) improvementScore += 2;
      else if (currentSatisfaction < previousSatisfaction - 0.3) improvementScore -= 4;
      else if (currentSatisfaction < previousSatisfaction) improvementScore -= 2;
      
      // Response time improvement (30% weight) - lower is better
      if (currentResponseTime < previousResponseTime - 5) improvementScore += 3;
      else if (currentResponseTime < previousResponseTime) improvementScore += 1;
      else if (currentResponseTime > previousResponseTime + 5) improvementScore -= 3;
      else if (currentResponseTime > previousResponseTime) improvementScore -= 1;

      // Determine trend
      if (improvementScore >= 3) return 'improving';
      if (improvementScore <= -3) return 'declining';
      return 'stable';

    } catch (error) {
      this.logger.error(`Error calculating trend for area ${areaId}: ${error.message}`);
      return 'stable'; // Default fallback
    }
  }

  /**
   * Get historical metrics for a service area
   */
  private async getHistoricalMetrics(areaId: string, businessId: string, timeframe: string): Promise<any> {
    try {
      const days = parseInt(timeframe.replace('d', '')) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get tasks for the period
      const tasks = await this.fieldTaskModel.find({
        businessId,
        siteId: areaId,
        scheduledDate: { $gte: startDate },
        isDeleted: false
      });

      // Group by weeks to show trend data
      const weeklyData = [];
      const weeksCount = Math.ceil(days / 7);
      
      for (let i = 0; i < weeksCount; i++) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - ((i + 1) * 7));
        const weekEnd = new Date();
        weekEnd.setDate(weekEnd.getDate() - (i * 7));
        
        const weekTasks = tasks.filter(t => 
          t.scheduledDate >= weekStart && t.scheduledDate < weekEnd
        );
        
        const completedTasks = weekTasks.filter(t => t.status === FieldTaskStatus.COMPLETED);
        
        const weekMetrics = {
          week: `Week ${weeksCount - i}`,
          startDate: weekStart.toISOString().split('T')[0],
          totalTasks: weekTasks.length,
          completedTasks: completedTasks.length,
          completionRate: weekTasks.length > 0 ? Math.round((completedTasks.length / weekTasks.length) * 100) : 0,
          avgSatisfaction: completedTasks.length > 0 ? 
            Math.round((completedTasks.reduce((sum, t) => sum + (t.clientSignoff?.satisfactionRating || 0), 0) / completedTasks.length) * 20) : 0,
          avgResponseTime: completedTasks.length > 0 ?
            Math.round(completedTasks.reduce((sum, t) => sum + (t.actualPerformance?.actualDuration || 0), 0) / completedTasks.length) : 0
        };
        
        weeklyData.unshift(weekMetrics); // Add to beginning to maintain chronological order
      }

      return {
        weeklyTrends: weeklyData,
        summary: {
          totalTasks: tasks.length,
          totalCompleted: tasks.filter(t => t.status === FieldTaskStatus.COMPLETED).length,
          avgCompletionRate: weeklyData.length > 0 ? 
            Math.round(weeklyData.reduce((sum, w) => sum + w.completionRate, 0) / weeklyData.length) : 0,
          avgSatisfaction: weeklyData.length > 0 ?
            Math.round(weeklyData.reduce((sum, w) => sum + w.avgSatisfaction, 0) / weeklyData.length) : 0,
          avgResponseTime: weeklyData.length > 0 ?
            Math.round(weeklyData.reduce((sum, w) => sum + w.avgResponseTime, 0) / weeklyData.length) : 0
        }
      };

    } catch (error) {
      this.logger.error(`Error getting historical metrics for area ${areaId}: ${error.message}`);
      return {
        weeklyTrends: [],
        summary: {
          totalTasks: 0,
          totalCompleted: 0,
          avgCompletionRate: 0,
          avgSatisfaction: 0,
          avgResponseTime: 0
        }
      };
    }
  }
}