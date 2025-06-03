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
  import { ServiceAreaService } from '../services/service-area.service';
  import { BusinessService } from '../services/business.service';
  
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
      private readonly businessService: BusinessService
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
      @Headers('business-x-api-key') apiKey?: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const filters = {
          status,
          region,
          priority
        };
  
        const serviceAreas = await this.serviceAreaService.getServiceAreas(businessId, filters);
  
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
      @Body() areaData: any
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const result = await this.serviceAreaService.createServiceArea({
          businessId,
          ...areaData
        });
  
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
      @Body() updateData: any
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!areaId) {
          throw new BadRequestException('Area ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const result = await this.serviceAreaService.updateServiceArea(businessId, areaId, updateData);
  
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
      @Headers('business-x-api-key') apiKey: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const result = await this.serviceAreaService.analyzeCoverage(businessId);
  
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
      @Headers('business-x-api-key') apiKey: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const stats = await this.serviceAreaService.getCoverageStats(businessId);
  
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
      }
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
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const result = await this.serviceAreaService.assignTeamToArea(
          businessId,
          areaId,
          assignmentData.teamId
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
      @Headers('business-x-api-key') apiKey?: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        // Get service areas with filters
        const filters = { region };
        const serviceAreas = await this.serviceAreaService.getServiceAreas(businessId, filters);
  
        // Format performance data
        const performance = serviceAreas.map(area => ({
          areaId: area.id,
          name: area.name,
          region: area.region,
          status: area.status,
          priority: area.priority,
          metrics: area.metrics,
          coverage: area.coverage,
          teamsCount: area.teams_count,
          efficiency: this.calculateEfficiency(area.metrics),
          trend: this.calculateTrend(area, timeframe || '30d')
        }));
  
        // Calculate regional summaries
        const regions = [...new Set(serviceAreas.map(area => area.region))];
        const regionalSummary = regions.map(regionName => {
          const regionAreas = serviceAreas.filter(area => area.region === regionName);
          return {
            region: regionName,
            totalAreas: regionAreas.length,
            activeAreas: regionAreas.filter(area => area.status === 'active').length,
            totalCustomers: regionAreas.reduce((sum, area) => sum + area.metrics.active_customers, 0),
            totalRevenue: regionAreas.reduce((sum, area) => sum + area.metrics.monthly_revenue, 0),
            avgSatisfaction: Math.round(regionAreas.reduce((sum, area) => sum + area.metrics.satisfaction_score, 0) / regionAreas.length),
            avgResponseTime: Math.round(regionAreas.reduce((sum, area) => sum + area.metrics.response_time, 0) / regionAreas.length)
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
            avgEfficiency: Math.round(performance.reduce((sum, area) => sum + area.efficiency, 0) / performance.length)
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
      @Headers('business-x-api-key') apiKey: string
    ): Promise<any> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
  
        // Trigger analysis to get fresh recommendations
        const analysisResult = await this.serviceAreaService.analyzeCoverage(businessId);
  
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
     * Calculate trend for a service area (mock implementation)
     */
    private calculateTrend(area: any, timeframe: string): string {
      // Mock trend calculation - in real implementation, this would use historical data
      const efficiency = this.calculateEfficiency(area.metrics);
      
      if (efficiency >= 85) return 'improving';
      if (efficiency >= 70) return 'stable';
      return 'declining';
    }
  }