// src/services/service-area.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business } from '../schemas/business.schema';

interface CreateServiceAreaRequest {
  businessId: string;
  name: string;
  region: string;
  priority: 'high' | 'medium' | 'low';
  coverage: {
    area: number; // in km²
    population: number;
    boundaries?: {
      coordinates: Array<{ lat: number; lng: number }>;
    };
  };
  manager: {
    name: string;
    email: string;
    phone: string;
  };
  metadata?: any;
}

interface UpdateServiceAreaRequest {
  name?: string;
  region?: string;
  status?: 'active' | 'inactive' | 'maintenance' | 'expanding';
  priority?: 'high' | 'medium' | 'low';
  coverage?: {
    area?: number;
    population?: number;
    boundaries?: {
      coordinates: Array<{ lat: number; lng: number }>;
    };
  };
  manager?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  metadata?: any;
}

interface ServiceArea {
  id: string;
  name: string;
  region: string;
  status: 'active' | 'inactive' | 'maintenance' | 'expanding';
  priority: 'high' | 'medium' | 'low';
  coverage: {
    area: number;
    population: number;
    coverage_percentage: number;
    boundaries?: any;
  };
  metrics: {
    active_customers: number;
    monthly_revenue: number;
    response_time: number;
    satisfaction_score: number;
    completion_rate: number;
  };
  manager: {
    name: string;
    email: string;
    phone: string;
  };
  teams_count: number;
  assignedTeams: string[];
  created_at: string;
  updated_at: string;
}

interface CoverageStats {
  total_areas: number;
  active_areas: number;
  total_coverage: number; // km²
  total_population: number;
  avg_response_time: number;
  avg_satisfaction: number;
  monthly_revenue: number;
  growth_rate: number;
}

/**
 * TODO: FUTURE IMPROVEMENTS FOR SERVICE AREA MANAGEMENT
 * 
 * Current Implementation: Basic service area CRUD with coverage tracking
 * 
 * Planned Enhancements:
 * - GIS integration for advanced geographic analysis
 * - Automated boundary detection based on postal codes/regions
 * - Real-time coverage heat maps and analytics
 * - Integration with mapping services for accurate area calculations
 * - Customer density analysis and demand forecasting
 * - Competitive analysis and market penetration metrics
 * - Dynamic area expansion recommendations based on performance
 * - Integration with demographic and economic data sources
 * - Multi-level service area hierarchies (regions, districts, zones)
 * - Performance benchmarking across similar areas
 * - Integration with business intelligence and reporting tools
 * - Automated alerts for coverage gaps and opportunities
 * - Integration with routing optimization for area-specific constraints
 * - Seasonal demand analysis and capacity planning
 */

@Injectable()
export class ServiceAreaService {
  private readonly logger = new Logger(ServiceAreaService.name);

  constructor(
    @InjectModel(Business.name) private businessModel: Model<Business>,
  ) {}

  // ============================================================================
  // SERVICE AREA CRUD OPERATIONS
  // ============================================================================

  /**
   * Get service areas with filters
   */
  async getServiceAreas(
    businessId: string,
    filters?: {
      status?: string;
      region?: string;
      priority?: string;
    }
  ): Promise<ServiceArea[]> {
    try {
      const business = await this.validateBusiness(businessId);

      let serviceAreas = business.metadata?.serviceAreas || [];

      // Apply filters
      if (filters?.status && filters.status !== 'all') {
        serviceAreas = serviceAreas.filter((area: any) => area.status === filters.status);
      }
      
      if (filters?.region && filters.region !== 'all') {
        serviceAreas = serviceAreas.filter((area: any) => area.region === filters.region);
      }
      
      if (filters?.priority && filters.priority !== 'all') {
        serviceAreas = serviceAreas.filter((area: any) => area.priority === filters.priority);
      }

      // Enrich with calculated metrics
      const enrichedAreas = serviceAreas.map((area: any) => {
        const assignedTeams = this.getAssignedTeams(area.id, business);
        const metrics = this.calculateAreaMetrics(area, business);
        
        return {
          ...area,
          metrics,
          teams_count: assignedTeams.length,
          assignedTeams: assignedTeams.map(t => t.id),
          coverage: {
            ...area.coverage,
            coverage_percentage: this.calculateCoveragePercentage(area, business)
          }
        };
      });

      // Sort by priority and name
      enrichedAreas.sort((a: any, b: any) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.name.localeCompare(b.name);
      });

      return enrichedAreas;

    } catch (error) {
      this.logger.error(`Error getting service areas: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Create a new service area
   */
  async createServiceArea(request: CreateServiceAreaRequest): Promise<{ success: boolean; areaId: string; message: string }> {
    try {
      const business = await this.validateBusiness(request.businessId);
      
      // Validate required fields
      this.validateServiceAreaData(request);

      // Check if area name already exists
      const existingAreas = business.metadata?.serviceAreas || [];
      const nameExists = existingAreas.some((area: any) => 
        area.name.toLowerCase() === request.name.toLowerCase()
      );
      
      if (nameExists) {
        throw new BadRequestException('Service area with this name already exists');
      }

      // Generate area ID
      const areaId = new Date().getTime().toString();
      const now = new Date();

      // Create service area object
      const newArea = {
        id: areaId,
        name: request.name,
        region: request.region,
        status: 'active',
        priority: request.priority,
        coverage: {
          area: request.coverage.area,
          population: request.coverage.population,
          boundaries: request.coverage.boundaries
        },
        manager: request.manager,
        assignedTeams: [],
        metadata: request.metadata || {},
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      };

      // Store in business metadata
      if (!business.metadata) business.metadata = {};
      if (!business.metadata.serviceAreas) business.metadata.serviceAreas = [];
      
      business.metadata.serviceAreas.push(newArea);
      business.markModified('metadata');
      await business.save();

      this.logger.log(`Created service area ${areaId} for business ${request.businessId}`);

      return {
        success: true,
        areaId,
        message: `Service area '${request.name}' created successfully`
      };

    } catch (error) {
      this.logger.error(`Error creating service area: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update an existing service area
   */
  async updateServiceArea(
    businessId: string,
    areaId: string,
    updateData: UpdateServiceAreaRequest
  ): Promise<{ success: boolean; message: string }> {
    try {
      const business = await this.validateBusiness(businessId);

      // Find service area
      const areas = business.metadata?.serviceAreas || [];
      const areaIndex = areas.findIndex((area: any) => area.id === areaId);

      if (areaIndex === -1) {
        throw new NotFoundException('Service area not found');
      }

      const area = areas[areaIndex];

      // Check name uniqueness if updating name
      if (updateData.name && updateData.name !== area.name) {
        const nameExists = areas.some((a: any, index: number) => 
          index !== areaIndex && a.name.toLowerCase() === updateData.name!.toLowerCase()
        );
        
        if (nameExists) {
          throw new BadRequestException('Service area with this name already exists');
        }
      }

      // Update area fields
      if (updateData.name !== undefined) area.name = updateData.name;
      if (updateData.region !== undefined) area.region = updateData.region;
      if (updateData.status !== undefined) area.status = updateData.status;
      if (updateData.priority !== undefined) area.priority = updateData.priority;
      
      if (updateData.coverage) {
        area.coverage = { ...area.coverage, ...updateData.coverage };
      }
      
      if (updateData.manager) {
        area.manager = { ...area.manager, ...updateData.manager };
      }
      
      if (updateData.metadata) {
        area.metadata = { ...area.metadata, ...updateData.metadata };
      }

      area.updated_at = new Date().toISOString();

      business.markModified('metadata');
      await business.save();

      this.logger.log(`Updated service area ${areaId} for business ${businessId}`);

      return {
        success: true,
        message: 'Service area updated successfully'
      };

    } catch (error) {
      this.logger.error(`Error updating service area: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Analyze coverage for optimization
   */
  async analyzeCoverage(businessId: string): Promise<{ success: boolean; analysis: any; message: string }> {
    try {
      const business = await this.validateBusiness(businessId);
      const serviceAreas = business.metadata?.serviceAreas || [];
      
      if (serviceAreas.length === 0) {
        return {
          success: true,
          analysis: { recommendations: ['Create service areas to begin coverage analysis'] },
          message: 'No service areas found for analysis'
        };
      }

      // Perform coverage analysis
      const analysis = this.performCoverageAnalysis(serviceAreas, business);

      // Store analysis results
      if (!business.metadata.coverageAnalysis) business.metadata.coverageAnalysis = {};
      business.metadata.coverageAnalysis = {
        ...analysis,
        analyzedAt: new Date().toISOString()
      };

      business.markModified('metadata');
      await business.save();

      this.logger.log(`Completed coverage analysis for business ${businessId}`);

      return {
        success: true,
        analysis,
        message: `Coverage analysis completed for ${serviceAreas.length} service areas`
      };

    } catch (error) {
      this.logger.error(`Error analyzing coverage: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get coverage statistics
   */
  async getCoverageStats(businessId: string): Promise<CoverageStats> {
    try {
      const business = await this.validateBusiness(businessId);
      const serviceAreas = business.metadata?.serviceAreas || [];

      const stats: CoverageStats = {
        total_areas: serviceAreas.length,
        active_areas: serviceAreas.filter((area: any) => area.status === 'active').length,
        total_coverage: serviceAreas.reduce((sum: number, area: any) => sum + (area.coverage.area || 0), 0),
        total_population: serviceAreas.reduce((sum: number, area: any) => sum + (area.coverage.population || 0), 0),
        avg_response_time: 0,
        avg_satisfaction: 0,
        monthly_revenue: 0,
        growth_rate: 0
      };

      // Calculate averages if we have areas
      if (stats.active_areas > 0) {
        const activeAreas = serviceAreas.filter((area: any) => area.status === 'active');
        
        // Calculate average response time (mock calculation)
        const responseTimes = activeAreas.map((area: any) => this.calculateResponseTime(area, business));
        stats.avg_response_time = Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length);
        
        // Calculate average satisfaction (mock calculation)
        const satisfactionScores = activeAreas.map((area: any) => this.calculateSatisfactionScore(area, business));
        stats.avg_satisfaction = Math.round(satisfactionScores.reduce((sum, score) => sum + score, 0) / satisfactionScores.length);
        
        // Calculate total monthly revenue (mock calculation)
        stats.monthly_revenue = activeAreas.reduce((sum: number, area: any) => {
          return sum + this.calculateMonthlyRevenue(area, business);
        }, 0);
        
        // Calculate growth rate (mock calculation)
        stats.growth_rate = Math.round((stats.active_areas / stats.total_areas) * 15 - 5); // -5% to +10% range
      }

      return stats;

    } catch (error) {
      this.logger.error(`Error getting coverage stats: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Assign team to service area
   */
  async assignTeamToArea(
    businessId: string,
    areaId: string,
    teamId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const business = await this.validateBusiness(businessId);

      // Validate team exists
      const team = business.teams?.find((t: any) => t.id === teamId);
      if (!team) {
        throw new NotFoundException('Team not found');
      }

      // Find service area
      const areas = business.metadata?.serviceAreas || [];
      const area = areas.find((a: any) => a.id === areaId);

      if (!area) {
        throw new NotFoundException('Service area not found');
      }

      // Check if team is already assigned
      if (!area.assignedTeams) area.assignedTeams = [];
      
      if (area.assignedTeams.includes(teamId)) {
        return {
          success: true,
          message: `Team ${team.name} is already assigned to ${area.name}`
        };
      }

      // Assign team to area
      area.assignedTeams.push(teamId);
      area.updated_at = new Date().toISOString();

      business.markModified('metadata');
      await business.save();

      this.logger.log(`Assigned team ${teamId} to service area ${areaId} for business ${businessId}`);

      return {
        success: true,
        message: `Team ${team.name} assigned to ${area.name} successfully`
      };

    } catch (error) {
      this.logger.error(`Error assigning team to area: ${error.message}`, error.stack);
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
   * Validate service area data
   */
  private validateServiceAreaData(data: CreateServiceAreaRequest): void {
    if (!data.name?.trim()) {
      throw new BadRequestException('Service area name is required');
    }

    if (!data.region?.trim()) {
      throw new BadRequestException('Region is required');
    }

    if (!data.priority) {
      throw new BadRequestException('Priority is required');
    }

    if (!data.coverage?.area || data.coverage.area <= 0) {
      throw new BadRequestException('Valid coverage area is required');
    }

    if (!data.coverage?.population || data.coverage.population <= 0) {
      throw new BadRequestException('Valid population is required');
    }

    if (!data.manager?.name?.trim()) {
      throw new BadRequestException('Manager name is required');
    }

    if (!data.manager?.email?.trim()) {
      throw new BadRequestException('Manager email is required');
    }

    if (!data.manager?.phone?.trim()) {
      throw new BadRequestException('Manager phone is required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.manager.email)) {
      throw new BadRequestException('Valid manager email is required');
    }
  }

  /**
   * Get teams assigned to a service area
   */
  private getAssignedTeams(areaId: string, business: any): any[] {
    const area = business.metadata?.serviceAreas?.find((a: any) => a.id === areaId);
    if (!area?.assignedTeams) return [];

    return (business.teams || []).filter((team: any) => 
      area.assignedTeams.includes(team.id)
    );
  }

  /**
   * Calculate area metrics
   */
  private calculateAreaMetrics(area: any, business: any): any {
    // Mock calculations - TODO: integrate with real data
    const baseCustomers = Math.floor(area.coverage.population * 0.15); // 15% penetration
    const teamCount = this.getAssignedTeams(area.id, business).length;
    
    return {
      active_customers: baseCustomers + (teamCount * 50),
      monthly_revenue: (baseCustomers + (teamCount * 50)) * 85, // $85 per customer
      response_time: Math.max(15, 45 - (teamCount * 5)), // Better with more teams
      satisfaction_score: Math.min(95, 70 + (teamCount * 8)), // Better with more teams
      completion_rate: Math.min(98, 85 + (teamCount * 3)) // Better with more teams
    };
  }

  /**
   * Calculate coverage percentage
   */
  private calculateCoveragePercentage(area: any, business: any): number {
    const teamCount = this.getAssignedTeams(area.id, business).length;
    const populationDensity = area.coverage.population / area.coverage.area;
    
    // Mock calculation based on teams and population density
    let coverage = Math.min(95, 40 + (teamCount * 15)); // Base 40%, +15% per team
    
    // Adjust for population density
    if (populationDensity > 1000) coverage = Math.max(coverage - 10, 20); // High density is harder
    if (populationDensity < 100) coverage = Math.min(coverage + 10, 95); // Low density is easier
    
    return coverage;
  }

  /**
   * Calculate response time for area
   */
  private calculateResponseTime(area: any, business: any): number {
    const teamCount = this.getAssignedTeams(area.id, business).length;
    const areaDensity = area.coverage.population / area.coverage.area;
    
    let responseTime = 30; // Base 30 minutes
    responseTime -= teamCount * 3; // -3 min per team
    responseTime += areaDensity > 500 ? 10 : 0; // +10 min for dense areas
    
    return Math.max(10, Math.min(60, responseTime)); // 10-60 minute range
  }

  /**
   * Calculate satisfaction score for area
   */
  private calculateSatisfactionScore(area: any, business: any): number {
    const teamCount = this.getAssignedTeams(area.id, business).length;
    const responseTime = this.calculateResponseTime(area, business);
    
    let satisfaction = 75; // Base 75%
    satisfaction += teamCount * 5; // +5% per team
    satisfaction -= Math.max(0, (responseTime - 20) * 2); // -2% per minute over 20
    
    return Math.max(50, Math.min(95, satisfaction)); // 50-95% range
  }

  /**
   * Calculate monthly revenue for area
   */
  private calculateMonthlyRevenue(area: any, business: any): number {
    const metrics = this.calculateAreaMetrics(area, business);
    return metrics.monthly_revenue;
  }

  /**
   * Perform coverage analysis
   */
  private performCoverageAnalysis(serviceAreas: any[], business: any): any {
    const recommendations = [];
    const opportunities = [];
    const issues = [];

    for (const area of serviceAreas) {
      const teamCount = this.getAssignedTeams(area.id, business).length;
      const coveragePercentage = this.calculateCoveragePercentage(area, business);
      const satisfactionScore = this.calculateSatisfactionScore(area, business);

      // Analyze each area
      if (teamCount === 0) {
        issues.push(`${area.name}: No teams assigned`);
        recommendations.push(`Assign at least one team to ${area.name}`);
      }

      if (coveragePercentage < 60) {
        opportunities.push(`${area.name}: Low coverage (${coveragePercentage}%)`);
        recommendations.push(`Increase team count in ${area.name} to improve coverage`);
      }

      if (satisfactionScore < 75) {
        issues.push(`${area.name}: Low satisfaction (${satisfactionScore}%)`);
        recommendations.push(`Review service quality in ${area.name}`);
      }

      if (area.priority === 'high' && teamCount < 2) {
        recommendations.push(`${area.name}: High priority area needs more teams (current: ${teamCount})`);
      }
    }

    // Overall analysis
    const totalTeams = business.teams?.length || 0;
    const assignedTeams = new Set();
    serviceAreas.forEach(area => {
      (area.assignedTeams || []).forEach((teamId: string) => assignedTeams.add(teamId));
    });

    if (assignedTeams.size < totalTeams) {
      const unassignedCount = totalTeams - assignedTeams.size;
      recommendations.push(`${unassignedCount} teams are not assigned to any service area`);
    }

    return {
      recommendations: recommendations.slice(0, 10), // Top 10 recommendations
      opportunities: opportunities.slice(0, 5), // Top 5 opportunities
      issues: issues.slice(0, 5), // Top 5 issues
      summary: {
        totalAreas: serviceAreas.length,
        activeAreas: serviceAreas.filter(a => a.status === 'active').length,
        avgCoverage: Math.round(serviceAreas.reduce((sum, area) => {
          return sum + this.calculateCoveragePercentage(area, business);
        }, 0) / serviceAreas.length),
        totalAssignedTeams: assignedTeams.size
      }
    };
  }
}