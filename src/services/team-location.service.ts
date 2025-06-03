// src/services/team-location.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business } from '../schemas/business.schema';

interface UpdateTeamLocationRequest {
  businessId: string;
  teamId: string;
  location: {
    lat: number;
    lng: number;
    address?: string;
  };
  status?: 'active' | 'inactive' | 'break' | 'offline';
  currentTask?: string;
  batteryLevel?: number;
  connectivity?: 'online' | 'offline' | 'poor';
  metadata?: any;
}

interface TeamLocation {
  id: string;
  name: string;
  members: Array<{
    id: string;
    name: string;
    role: string;
    phone?: string;
  }>;
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  status: 'active' | 'inactive' | 'break' | 'offline';
  last_updated: string;
  current_task?: string;
  battery_level?: number;
  connectivity: 'online' | 'offline' | 'poor';
  project_name?: string;
  route_progress?: {
    currentTaskIndex: number;
    totalTasks: number;
    completedTasks: number;
    estimatedCompletion: string;
  };
}

interface LocationStats {
  total_teams: number;
  active_teams: number;
  offline_teams: number;
  teams_on_break: number;
  avg_response_time: number;
  coverage_areas: number;
}

interface RouteProgress {
  teamId: string;
  currentRoute?: {
    taskIds: string[];
    currentTaskIndex: number;
    completedTasks: number;
    estimatedCompletion: string;
  };
}

/**
 * TODO: FUTURE IMPROVEMENTS FOR TEAM LOCATION TRACKING
 * 
 * Current Implementation: Basic location tracking with business validation
 * 
 * Planned Enhancements:
 * - Real-time WebSocket integration for live location updates
 * - Geofencing capabilities for service area boundaries
 * - Location history tracking and route analytics
 * - Integration with mobile app GPS tracking
 * - Automatic status updates based on location movement
 * - Privacy controls and location sharing permissions
 * - Integration with mapping services for address resolution
 * - Battery optimization algorithms for mobile devices
 * - Offline location caching and sync when reconnected
 * - Integration with vehicle tracking systems
 * - Emergency location alerts and panic button functionality
 * - Location-based task assignment and proximity matching
 * - Integration with traffic and navigation services
 * - Compliance with location privacy regulations (GDPR, etc.)
 */

@Injectable()
export class TeamLocationService {
  private readonly logger = new Logger(TeamLocationService.name);

  constructor(
    @InjectModel(Business.name) private businessModel: Model<Business>,
  ) {}

  // ============================================================================
  // LOCATION TRACKING
  // ============================================================================

  /**
   * Update team location
   */
  async updateTeamLocation(request: UpdateTeamLocationRequest): Promise<{ success: boolean; message: string }> {
    try {
      const business = await this.validateBusiness(request.businessId);

      // Validate team exists
      const team = business.teams?.find((t: any) => t.id === request.teamId);
      if (!team) {
        throw new NotFoundException('Team not found');
      }

      // Validate coordinates
      this.validateCoordinates(request.location.lat, request.location.lng);

      // Initialize team locations if not exists
      if (!business.metadata) business.metadata = {};
      if (!business.metadata.teamLocations) business.metadata.teamLocations = [];

      // Find existing location record or create new one
      let locationRecord = business.metadata.teamLocations.find((loc: any) => loc.teamId === request.teamId);
      
      if (!locationRecord) {
        locationRecord = {
          teamId: request.teamId,
          teamName: team.name,
          location: request.location,
          status: request.status || 'active',
          connectivity: request.connectivity || 'online',
          last_updated: new Date().toISOString(),
          current_task: request.currentTask,
          battery_level: request.batteryLevel,
          metadata: request.metadata || {}
        };
        business.metadata.teamLocations.push(locationRecord);
      } else {
        // Update existing record
        locationRecord.location = request.location;
        if (request.status !== undefined) locationRecord.status = request.status;
        if (request.connectivity !== undefined) locationRecord.connectivity = request.connectivity;
        if (request.currentTask !== undefined) locationRecord.current_task = request.currentTask;
        if (request.batteryLevel !== undefined) locationRecord.battery_level = request.batteryLevel;
        if (request.metadata !== undefined) {
          locationRecord.metadata = { ...locationRecord.metadata, ...request.metadata };
        }
        locationRecord.last_updated = new Date().toISOString();
      }

      business.markModified('metadata');
      await business.save();

      this.logger.log(`Updated location for team ${request.teamId} in business ${request.businessId}`);

      return {
        success: true,
        message: `Location updated for team ${team.name}`
      };

    } catch (error) {
      this.logger.error(`Error updating team location: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get team locations with filters
   */
  async getTeamLocations(
    businessId: string,
    filters?: {
      status?: string;
      project?: string;
    }
  ): Promise<TeamLocation[]> {
    try {
      const business = await this.validateBusiness(businessId);

      const teamLocations: TeamLocation[] = [];
      const locationRecords = business.metadata?.teamLocations || [];

      // Build team locations from business teams and location data
      for (const team of business.teams || []) {
        const locationRecord = locationRecords.find((loc: any) => loc.teamId === team.id);
        
        if (!locationRecord) {
          // Team without location data - show as offline
          teamLocations.push({
            id: team.id,
            name: team.name,
            members: this.getTeamMembers(team),
            location: {
              lat: 0,
              lng: 0,
              address: 'Location not available'
            },
            status: 'offline',
            last_updated: new Date().toISOString(),
            connectivity: 'offline',
            project_name: team.metadata?.project_name
          });
        } else {
          teamLocations.push({
            id: team.id,
            name: team.name,
            members: this.getTeamMembers(team),
            location: {
              lat: locationRecord.location.lat,
              lng: locationRecord.location.lng,
              address: locationRecord.location.address || 'Address not available'
            },
            status: locationRecord.status || 'offline',
            last_updated: locationRecord.last_updated,
            current_task: locationRecord.current_task,
            battery_level: locationRecord.battery_level,
            connectivity: locationRecord.connectivity || 'offline',
            project_name: team.metadata?.project_name,
            route_progress: this.getRouteProgress(team.id, business)
          });
        }
      }

      // Apply filters
      let filteredLocations = teamLocations;
      
      if (filters?.status && filters.status !== 'all') {
        filteredLocations = filteredLocations.filter(loc => loc.status === filters.status);
      }
      
      if (filters?.project && filters.project !== 'all') {
        filteredLocations = filteredLocations.filter(loc => loc.project_name === filters.project);
      }

      // Sort by last updated (most recent first)
      filteredLocations.sort((a, b) => {
        return new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime();
      });

      return filteredLocations;

    } catch (error) {
      this.logger.error(`Error getting team locations: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get location statistics
   */
  async getLocationStats(businessId: string): Promise<LocationStats> {
    try {
      const business = await this.validateBusiness(businessId);
      const teamLocations = await this.getTeamLocations(businessId);

      const stats: LocationStats = {
        total_teams: teamLocations.length,
        active_teams: teamLocations.filter(loc => loc.status === 'active').length,
        offline_teams: teamLocations.filter(loc => loc.status === 'offline').length,
        teams_on_break: teamLocations.filter(loc => loc.status === 'break').length,
        avg_response_time: 0, // TODO: Calculate from historical data
        coverage_areas: 0 // TODO: Calculate from service areas
      };

      // Calculate average response time (mock for now)
      const activeBatteryLevels = teamLocations
        .filter(loc => loc.battery_level !== undefined)
        .map(loc => loc.battery_level!);
      
      if (activeBatteryLevels.length > 0) {
        // Mock response time calculation based on battery levels and connectivity
        const avgBattery = activeBatteryLevels.reduce((sum, level) => sum + level, 0) / activeBatteryLevels.length;
        const onlineTeams = teamLocations.filter(loc => loc.connectivity === 'online').length;
        const connectivityRatio = onlineTeams / Math.max(teamLocations.length, 1);
        
        // Better connectivity and battery = faster response
        stats.avg_response_time = Math.round(30 - (avgBattery * 0.2) - (connectivityRatio * 10));
        stats.avg_response_time = Math.max(5, stats.avg_response_time); // Minimum 5 minutes
      } else {
        stats.avg_response_time = 25; // Default average
      }

      // Calculate coverage areas (mock for now)
      stats.coverage_areas = Math.ceil(teamLocations.filter(loc => loc.status === 'active').length * 1.5);

      return stats;

    } catch (error) {
      this.logger.error(`Error getting location stats: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Track route progress for a team
   */
  async trackRouteProgress(
    businessId: string,
    teamId: string,
    routeData: {
      taskIds: string[];
      currentTaskIndex: number;
      completedTasks: number;
    }
  ): Promise<{ success: boolean; message: string }> {
    try {
      const business = await this.validateBusiness(businessId);

      // Validate team exists
      const team = business.teams?.find((t: any) => t.id === teamId);
      if (!team) {
        throw new NotFoundException('Team not found');
      }

      // Initialize route progress tracking
      if (!business.metadata) business.metadata = {};
      if (!business.metadata.routeProgress) business.metadata.routeProgress = [];

      // Find existing progress or create new
      let progressRecord = business.metadata.routeProgress.find((prog: any) => prog.teamId === teamId);
      
      if (!progressRecord) {
        progressRecord = {
          teamId,
          currentRoute: {
            taskIds: routeData.taskIds,
            currentTaskIndex: routeData.currentTaskIndex,
            completedTasks: routeData.completedTasks,
            estimatedCompletion: this.calculateEstimatedCompletion(routeData),
            updatedAt: new Date().toISOString()
          }
        };
        business.metadata.routeProgress.push(progressRecord);
      } else {
        progressRecord.currentRoute = {
          taskIds: routeData.taskIds,
          currentTaskIndex: routeData.currentTaskIndex,
          completedTasks: routeData.completedTasks,
          estimatedCompletion: this.calculateEstimatedCompletion(routeData),
          updatedAt: new Date().toISOString()
        };
      }

      business.markModified('metadata');
      await business.save();

      this.logger.log(`Updated route progress for team ${teamId}: ${routeData.completedTasks}/${routeData.taskIds.length} tasks completed`);

      return {
        success: true,
        message: `Route progress updated for team ${team.name}`
      };

    } catch (error) {
      this.logger.error(`Error tracking route progress: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Export location data
   */
  async exportLocationData(businessId: string): Promise<{ success: boolean; data: any[]; message: string }> {
    try {
      const business = await this.validateBusiness(businessId);
      const teamLocations = await this.getTeamLocations(businessId);

      // Prepare export data
      const exportData = teamLocations.map(location => ({
        team_name: location.name,
        status: location.status,
        latitude: location.location.lat,
        longitude: location.location.lng,
        address: location.location.address,
        last_updated: location.last_updated,
        current_task: location.current_task || 'N/A',
        battery_level: location.battery_level || 'N/A',
        connectivity: location.connectivity,
        project_name: location.project_name || 'N/A',
        member_count: location.members.length,
        members: location.members.map(m => m.name).join(', ')
      }));

      this.logger.log(`Exported location data for ${exportData.length} teams from business ${businessId}`);

      return {
        success: true,
        data: exportData,
        message: `Exported data for ${exportData.length} teams`
      };

    } catch (error) {
      this.logger.error(`Error exporting location data: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get team availability
   */
  async getTeamAvailability(businessId: string, teamId?: string): Promise<any> {
    try {
      const business = await this.validateBusiness(businessId);
      const teamLocations = await this.getTeamLocations(businessId);

      if (teamId) {
        // Get specific team availability
        const teamLocation = teamLocations.find(loc => loc.id === teamId);
        if (!teamLocation) {
          throw new NotFoundException('Team not found');
        }

        return {
          teamId,
          teamName: teamLocation.name,
          available: teamLocation.status === 'active',
          status: teamLocation.status,
          location: teamLocation.location,
          lastUpdated: teamLocation.last_updated,
          routeProgress: teamLocation.route_progress
        };
      } else {
        // Get all teams availability
        return {
          teams: teamLocations.map(loc => ({
            teamId: loc.id,
            teamName: loc.name,
            available: loc.status === 'active',
            status: loc.status,
            lastUpdated: loc.last_updated,
            routeProgress: loc.route_progress
          })),
          summary: {
            totalTeams: teamLocations.length,
            availableTeams: teamLocations.filter(loc => loc.status === 'active').length,
            busyTeams: teamLocations.filter(loc => ['assigned', 'in_progress'].includes(loc.status)).length,
            offlineTeams: teamLocations.filter(loc => loc.status === 'offline').length
          }
        };
      }

    } catch (error) {
      this.logger.error(`Error getting team availability: ${error.message}`, error.stack);
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
   * Validate coordinates
   */
  private validateCoordinates(lat: number, lng: number): void {
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new BadRequestException('Latitude and longitude must be numbers');
    }

    if (lat < -90 || lat > 90) {
      throw new BadRequestException('Latitude must be between -90 and 90 degrees');
    }

    if (lng < -180 || lng > 180) {
      throw new BadRequestException('Longitude must be between -180 and 180 degrees');
    }
  }

  /**
   * Get team members from team data
   */
  private getTeamMembers(team: any): Array<{ id: string; name: string; role: string; phone?: string }> {
    // For now, return mock members - TODO: integrate with actual staff profiles
    const memberCount = Math.floor(Math.random() * 4) + 2; // 2-5 members
    const members = [];
    
    for (let i = 0; i < memberCount; i++) {
      members.push({
        id: `member-${team.id}-${i}`,
        name: `Team Member ${i + 1}`,
        role: i === 0 ? 'Lead' : 'Technician',
        phone: `+1-555-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`
      });
    }
    
    return members;
  }

  /**
   * Get route progress for a team
   */
  private getRouteProgress(teamId: string, business: any): any {
    const routeProgress = business.metadata?.routeProgress?.find((prog: any) => prog.teamId === teamId);
    
    if (!routeProgress?.currentRoute) {
      return undefined;
    }

    return {
      currentTaskIndex: routeProgress.currentRoute.currentTaskIndex,
      totalTasks: routeProgress.currentRoute.taskIds.length,
      completedTasks: routeProgress.currentRoute.completedTasks,
      estimatedCompletion: routeProgress.currentRoute.estimatedCompletion
    };
  }

  /**
   * Calculate estimated completion time
   */
  private calculateEstimatedCompletion(routeData: any): string {
    const remainingTasks = routeData.taskIds.length - routeData.completedTasks;
    const avgTaskTime = 45; // 45 minutes per task
    const remainingMinutes = remainingTasks * avgTaskTime;
    
    const completionTime = new Date();
    completionTime.setMinutes(completionTime.getMinutes() + remainingMinutes);
    
    return completionTime.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    });
  }
}