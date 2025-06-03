// src/services/team-location.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business } from '../schemas/business.schema';
import { TeamLocation, TeamLocationStatus, ConnectivityStatus } from '../schemas/team-location.schema';
import { RouteProgress, RouteStatus } from '../schemas/route-progress.schema';
import { TeamAvailability, AvailabilityStatus } from '../schemas/team-availability.schema';
import { FieldTask, FieldTaskStatus } from '../schemas/field-task.schema';

interface UpdateTeamLocationRequest {
  businessId: string;
  teamId: string;
  location: {
    lat: number;
    lng: number;
    address?: string;
    accuracy?: number;
    altitude?: number;
    speed?: number;
    heading?: number;
  };
  status?: TeamLocationStatus;
  currentTaskId?: string;
  batteryLevel?: number;
  connectivity?: ConnectivityStatus;
  deviceId?: string;
  appVersion?: string;
  metadata?: any;
}

interface TeamLocationResponse {
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
    accuracy?: number;
    speed?: number;
    heading?: number;
  };
  status: TeamLocationStatus;
  last_updated: string;
  current_task?: string;
  battery_level?: number;
  connectivity: ConnectivityStatus;
  project_name?: string;
  route_progress?: {
    currentTaskIndex: number;
    totalTasks: number;
    completedTasks: number;
    estimatedCompletion: string;
  };
  workingHours?: any;
  deviceInfo?: {
    deviceId?: string;
    appVersion?: string;
  };
}

interface LocationStats {
  total_teams: number;
  active_teams: number;
  offline_teams: number;
  teams_on_break: number;
  avg_response_time: number;
  coverage_areas: number;
  location_accuracy_avg: number;
  last_update_time: string;
}

@Injectable()
export class TeamLocationService {
  private readonly logger = new Logger(TeamLocationService.name);

  constructor(
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(TeamLocation.name) private teamLocationModel: Model<TeamLocation>,
    @InjectModel(RouteProgress.name) private routeProgressModel: Model<RouteProgress>,
    @InjectModel(TeamAvailability.name) private teamAvailabilityModel: Model<TeamAvailability>,
    @InjectModel(FieldTask.name) private fieldTaskModel: Model<FieldTask>,
  ) {}

  // ============================================================================
  // REAL LOCATION TRACKING USING YOUR SCHEMAS
  // ============================================================================

  /**
   * Update team location using real TeamLocation schema
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

      // Find existing location record or create new one
      let teamLocation = await this.teamLocationModel.findOne({
        businessId: request.businessId,
        teamId: request.teamId,
        isDeleted: false
      });

      if (!teamLocation) {
        // Create new team location record
        teamLocation = new this.teamLocationModel({
          businessId: request.businessId,
          teamId: request.teamId,
          teamName: team.name,
          location: {
            latitude: request.location.lat,
            longitude: request.location.lng,
            address: request.location.address,
            accuracy: request.location.accuracy,
            altitude: request.location.altitude,
            speed: request.location.speed,
            heading: request.location.heading
          },
          status: request.status || TeamLocationStatus.ACTIVE,
          connectivity: request.connectivity || ConnectivityStatus.ONLINE,
          currentTaskId: request.currentTaskId,
          batteryLevel: request.batteryLevel,
          deviceId: request.deviceId,
          appVersion: request.appVersion,
          lastLocationUpdate: new Date(),
          locationHistory: [],
          metadata: request.metadata || {},
          createdBy: business.adminUserId
        });
      } else {
        // Add to location history before updating
        teamLocation.locationHistory.push({
          timestamp: new Date(),
          latitude: request.location.lat,
          longitude: request.location.lng,
          accuracy: request.location.accuracy
        });

        // Keep only last 50 location history entries
        if (teamLocation.locationHistory.length > 50) {
          teamLocation.locationHistory = teamLocation.locationHistory.slice(-50);
        }

        // Update existing record
        teamLocation.location = {
          latitude: request.location.lat,
          longitude: request.location.lng,
          address: request.location.address || teamLocation.location.address,
          accuracy: request.location.accuracy,
          altitude: request.location.altitude,
          speed: request.location.speed,
          heading: request.location.heading
        };

        // Update status if provided and different
        if (request.status !== undefined && request.status !== teamLocation.status) {
          teamLocation.status = request.status;
          teamLocation.statusChangedAt = new Date();
        }

        if (request.connectivity !== undefined) teamLocation.connectivity = request.connectivity;
        if (request.currentTaskId !== undefined) teamLocation.currentTaskId = request.currentTaskId;
        if (request.batteryLevel !== undefined) teamLocation.batteryLevel = request.batteryLevel;
        if (request.deviceId !== undefined) teamLocation.deviceId = request.deviceId;
        if (request.appVersion !== undefined) teamLocation.appVersion = request.appVersion;
        if (request.metadata !== undefined) {
          teamLocation.metadata = { ...teamLocation.metadata, ...request.metadata };
        }

        teamLocation.lastLocationUpdate = new Date();
        teamLocation.updatedBy = business.adminUserId;
      }

      await teamLocation.save();

      // Also update team availability if status changed
      if (request.status) {
        await this.updateTeamAvailability(request.businessId, request.teamId, request.status);
      }

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
   * Get team locations with filters using real database queries
   */
  async getTeamLocations(
    businessId: string,
    filters?: {
      status?: string;
      project?: string;
      lastUpdatedSince?: string;
    }
  ): Promise<TeamLocationResponse[]> {
    try {
      const business = await this.validateBusiness(businessId);

      // Build query
      const query: any = {
        businessId,
        isDeleted: false
      };

      // Apply filters
      if (filters?.status && filters.status !== 'all') {
        query.status = filters.status;
      }

      if (filters?.lastUpdatedSince) {
        query.lastLocationUpdate = { $gte: new Date(filters.lastUpdatedSince) };
      }

      // Get real team locations from database
      const teamLocations = await this.teamLocationModel.find(query).sort({ lastLocationUpdate: -1 });

      // Build response with business team data
      const teamLocationResponses: TeamLocationResponse[] = [];

      for (const team of business.teams || []) {
        const locationRecord = teamLocations.find(loc => loc.teamId === team.id);
        
        if (!locationRecord) {
          // Team without location data - show as offline
          teamLocationResponses.push({
            id: team.id,
            name: team.name,
            members: this.getTeamMembers(team),
            location: {
              lat: 0,
              lng: 0,
              address: 'Location not available'
            },
            status: TeamLocationStatus.OFFLINE,
            last_updated: new Date().toISOString(),
            connectivity: ConnectivityStatus.OFFLINE,
            project_name: team.metadata?.project_name
          });
        } else {
          const routeProgress = await this.getRouteProgress(team.id, businessId);
          
          teamLocationResponses.push({
            id: team.id,
            name: team.name,
            members: this.getTeamMembers(team),
            location: {
              lat: locationRecord.location.latitude,
              lng: locationRecord.location.longitude,
              address: locationRecord.location.address || 'Address not available',
              accuracy: locationRecord.location.accuracy,
              speed: locationRecord.location.speed,
              heading: locationRecord.location.heading
            },
            status: locationRecord.status,
            last_updated: locationRecord.lastLocationUpdate.toISOString(),
            current_task: locationRecord.currentTaskId,
            battery_level: locationRecord.batteryLevel,
            connectivity: locationRecord.connectivity,
            project_name: team.metadata?.project_name,
            route_progress: routeProgress,
            workingHours: locationRecord.workingHours,
            deviceInfo: {
              deviceId: locationRecord.deviceId,
              appVersion: locationRecord.appVersion
            }
          });
        }
      }

      // Apply project filter if specified
      let filteredLocations = teamLocationResponses;
      if (filters?.project && filters.project !== 'all') {
        filteredLocations = filteredLocations.filter(loc => loc.project_name === filters.project);
      }

      return filteredLocations;

    } catch (error) {
      this.logger.error(`Error getting team locations: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get location statistics using real data
   */
  async getLocationStats(businessId: string): Promise<LocationStats> {
    try {
      const business = await this.validateBusiness(businessId);

      // Get real team locations
      const teamLocations = await this.teamLocationModel.find({
        businessId,
        isDeleted: false
      });

      const totalTeams = business.teams?.length || 0;
      const recentThreshold = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

      // Calculate real statistics
      const activeTeams = teamLocations.filter(loc => 
        loc.status === TeamLocationStatus.ACTIVE && 
        loc.lastLocationUpdate > recentThreshold
      ).length;

      const offlineTeams = totalTeams - teamLocations.filter(loc => 
        loc.lastLocationUpdate > recentThreshold
      ).length;

      const teamsOnBreak = teamLocations.filter(loc => 
        loc.status === TeamLocationStatus.BREAK
      ).length;

      // Calculate average location accuracy
      const accuracyReadings = teamLocations
        .filter(loc => loc.location.accuracy !== undefined)
        .map(loc => loc.location.accuracy!);
      
      const avgAccuracy = accuracyReadings.length > 0 ? 
        accuracyReadings.reduce((sum, acc) => sum + acc, 0) / accuracyReadings.length : 0;

      // Calculate average response time from recent field tasks
      const avgResponseTime = await this.calculateRealResponseTime(businessId);

      // Calculate coverage areas from service areas
      const coverageAreas = await this.calculateCoverageAreas(businessId);

      const stats: LocationStats = {
        total_teams: totalTeams,
        active_teams: activeTeams,
        offline_teams: offlineTeams,
        teams_on_break: teamsOnBreak,
        avg_response_time: avgResponseTime,
        coverage_areas: coverageAreas,
        location_accuracy_avg: Math.round(avgAccuracy),
        last_update_time: teamLocations.length > 0 ? 
          Math.max(...teamLocations.map(loc => loc.lastLocationUpdate.getTime())).toString() :
          new Date().toISOString()
      };

      return stats;

    } catch (error) {
      this.logger.error(`Error getting location stats: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Track route progress using real RouteProgress schema
   */
  async trackRouteProgress(
    businessId: string,
    teamId: string,
    routeData: {
      taskIds: string[];
      currentTaskIndex: number;
      completedTasks: number;
      routeDate?: Date;
    }
  ): Promise<{ success: boolean; message: string }> {
    try {
      const business = await this.validateBusiness(businessId);

      // Validate team exists
      const team = business.teams?.find((t: any) => t.id === teamId);
      if (!team) {
        throw new NotFoundException('Team not found');
      }

      const routeDate = routeData.routeDate || new Date();
      const startOfDay = new Date(routeDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(routeDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Find existing route progress or create new
      let routeProgress = await this.routeProgressModel.findOne({
        businessId,
        teamId,
        routeDate: { $gte: startOfDay, $lte: endOfDay },
        isDeleted: false
      });

      if (!routeProgress) {
        // Get task details for creating comprehensive route progress
        const tasks = await this.fieldTaskModel.find({
          _id: { $in: routeData.taskIds },
          businessId,
          isDeleted: false
        });

        // Create new route progress
        routeProgress = new this.routeProgressModel({
          businessId,
          teamId,
          teamName: team.name,
          routeDate: startOfDay,
          tasks: routeData.taskIds.map((taskId, index) => {
            const task = tasks.find(t => t._id.toString() === taskId);
            return {
              taskId,
              scheduledOrder: index,
              status: index < routeData.completedTasks ? 'completed' : 
                     index === routeData.currentTaskIndex ? 'in_progress' : 'pending',
              location: task ? {
                latitude: task.location.latitude,
                longitude: task.location.longitude,
                address: task.location.address
              } : { latitude: 0, longitude: 0 },
              estimatedDuration: task?.estimatedDuration || 60,
              estimatedStartTime: this.calculateEstimatedStartTime(startOfDay, index),
              estimatedEndTime: this.calculateEstimatedEndTime(startOfDay, index, task?.estimatedDuration || 60)
            };
          }),
          routeStatus: routeData.completedTasks === routeData.taskIds.length ? 
                      RouteStatus.COMPLETED : RouteStatus.IN_PROGRESS,
          currentTaskIndex: routeData.currentTaskIndex,
          completedTasksCount: routeData.completedTasks,
          estimatedCompletionTime: this.calculateEstimatedCompletion(routeData),
          totalEstimatedDuration: tasks.reduce((sum, task) => sum + task.estimatedDuration, 0),
          progressUpdates: [{
            timestamp: new Date(),
            location: { latitude: 0, longitude: 0 }, // Would be filled with actual location
            status: `${routeData.completedTasks}/${routeData.taskIds.length} tasks completed`
          }],
          createdBy: business.adminUserId
        });
      } else {
        // Update existing route progress
        routeProgress.currentTaskIndex = routeData.currentTaskIndex;
        routeProgress.completedTasksCount = routeData.completedTasks;
        routeProgress.routeStatus = routeData.completedTasks === routeData.taskIds.length ? 
                                   RouteStatus.COMPLETED : RouteStatus.IN_PROGRESS;
        routeProgress.estimatedCompletionTime = this.calculateEstimatedCompletion(routeData);

        // Update individual task statuses
        routeProgress.tasks.forEach((task, index) => {
          if (index < routeData.completedTasks) {
            task.status = 'completed';
            if (!task.actualEndTime) task.actualEndTime = new Date();
          } else if (index === routeData.currentTaskIndex) {
            task.status = 'in_progress';
            if (!task.actualStartTime) task.actualStartTime = new Date();
          } else {
            task.status = 'pending';
          }
        });

        // Add progress update
        routeProgress.progressUpdates.push({
          timestamp: new Date(),
          location: { latitude: 0, longitude: 0 }, // Would be filled with actual location
          status: `${routeData.completedTasks}/${routeData.taskIds.length} tasks completed`
        });

        routeProgress.updatedBy = business.adminUserId;
      }

      await routeProgress.save();

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
   * Get team availability using real data
   */
  async getTeamAvailability(businessId: string, teamId?: string): Promise<any> {
    try {
      const business = await this.validateBusiness(businessId);

      if (teamId) {
        // Get specific team availability
        const teamLocation = await this.teamLocationModel.findOne({
          businessId,
          teamId,
          isDeleted: false
        });

        const teamAvailability = await this.teamAvailabilityModel.findOne({
          businessId,
          teamId,
          isDeleted: false
        });

        const team = business.teams?.find((t: any) => t.id === teamId);
        if (!team) {
          throw new NotFoundException('Team not found');
        }

        return {
          teamId,
          teamName: team.name,
          available: teamLocation?.status === TeamLocationStatus.ACTIVE,
          status: teamLocation?.status || TeamLocationStatus.OFFLINE,
          location: teamLocation?.location || null,
          lastUpdated: teamLocation?.lastLocationUpdate?.toISOString() || new Date().toISOString(),
          routeProgress: await this.getRouteProgress(teamId, businessId),
          workingHours: teamAvailability?.workingHours,
          unavailablePeriods: teamAvailability?.unavailablePeriods || [],
          skills: teamAvailability?.skills || []
        };
      } else {
        // Get all teams availability
        const teamLocations = await this.teamLocationModel.find({
          businessId,
          isDeleted: false
        });

        const teamAvailabilities = await this.teamAvailabilityModel.find({
          businessId,
          isDeleted: false
        });

        const teams = (business.teams || []).map((team: any) => {
          const location = teamLocations.find(loc => loc.teamId === team.id);
          const availability = teamAvailabilities.find(avail => avail.teamId === team.id);

          return {
            teamId: team.id,
            teamName: team.name,
            available: location?.status === TeamLocationStatus.ACTIVE,
            status: location?.status || TeamLocationStatus.OFFLINE,
            lastUpdated: location?.lastLocationUpdate?.toISOString() || new Date().toISOString(),
            workingHours: availability?.workingHours,
            currentTaskId: location?.currentTaskId,
            batteryLevel: location?.batteryLevel,
            connectivity: location?.connectivity
          };
        });

        return {
          teams,
          summary: {
            totalTeams: teams.length,
            availableTeams: teams.filter(t => t.available).length,
            busyTeams: teams.filter(t => t.status === TeamLocationStatus.ACTIVE && t.currentTaskId).length,
            offlineTeams: teams.filter(t => t.status === TeamLocationStatus.OFFLINE).length
          }
        };
      }

    } catch (error) {
      this.logger.error(`Error getting team availability: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Export location data using real database data
   */
  async exportLocationData(businessId: string): Promise<{ success: boolean; data: any[]; message: string }> {
    try {
      const business = await this.validateBusiness(businessId);
      const teamLocations = await this.getTeamLocations(businessId);

      // Prepare export data with comprehensive information
      const exportData = teamLocations.map(location => ({
        team_id: location.id,
        team_name: location.name,
        status: location.status,
        latitude: location.location.lat,
        longitude: location.location.lng,
        address: location.location.address,
        accuracy: location.location.accuracy || 'N/A',
        speed: location.location.speed || 'N/A',
        heading: location.location.heading || 'N/A',
        last_updated: location.last_updated,
        current_task: location.current_task || 'N/A',
        battery_level: location.battery_level || 'N/A',
        connectivity: location.connectivity,
        project_name: location.project_name || 'N/A',
        member_count: location.members.length,
        members: location.members.map(m => m.name).join(', '),
        device_id: location.deviceInfo?.deviceId || 'N/A',
        app_version: location.deviceInfo?.appVersion || 'N/A',
        route_progress: location.route_progress ? 
          `${location.route_progress.completedTasks}/${location.route_progress.totalTasks}` : 'N/A'
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
    // Use actual team members if available
    if (team.members && Array.isArray(team.members)) {
      return team.members.map((member: any, index: number) => ({
        id: member.id || `member-${team.id}-${index}`,
        name: member.name || `Team Member ${index + 1}`,
        role: member.role || (index === 0 ? 'Lead' : 'Technician'),
        phone: member.phone
      }));
    }

    // if no members are available, return empty array
    return [];
  }

  /**
   * Get route progress for a team using real data
   */
  private async getRouteProgress(teamId: string, businessId: string): Promise<any> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const routeProgress = await this.routeProgressModel.findOne({
      businessId,
      teamId,
      routeDate: { $gte: today, $lt: tomorrow },
      isDeleted: false
    });

    if (!routeProgress) {
      return undefined;
    }

    return {
      currentTaskIndex: routeProgress.currentTaskIndex,
      totalTasks: routeProgress.tasks.length,
      completedTasks: routeProgress.completedTasksCount,
      estimatedCompletion: routeProgress.estimatedCompletionTime?.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      }) || 'Unknown'
    };
  }

  /**
   * Update team availability status
   */
  private async updateTeamAvailability(businessId: string, teamId: string, locationStatus: TeamLocationStatus): Promise<void> {
    try {
      let availabilityStatus: AvailabilityStatus;
      
      switch (locationStatus) {
        case TeamLocationStatus.ACTIVE:
          availabilityStatus = AvailabilityStatus.AVAILABLE;
          break;
        case TeamLocationStatus.BREAK:
          availabilityStatus = AvailabilityStatus.BREAK;
          break;
        case TeamLocationStatus.OFFLINE:
        case TeamLocationStatus.INACTIVE:
        default:
          availabilityStatus = AvailabilityStatus.OFFLINE;
          break;
      }

      await this.teamAvailabilityModel.findOneAndUpdate(
        { businessId, teamId, isDeleted: false },
        { 
          status: availabilityStatus,
          statusSince: new Date(),
          lastStatusUpdate: new Date()
        },
        { upsert: true }
      );
    } catch (error) {
      this.logger.warn(`Failed to update team availability for team ${teamId}: ${error.message}`);
    }
  }

  /**
   * Calculate real response time from field tasks
   */
  private async calculateRealResponseTime(businessId: string): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const completedTasks = await this.fieldTaskModel.find({
      businessId,
      status: FieldTaskStatus.COMPLETED,
      completedAt: { $gte: thirtyDaysAgo },
      isDeleted: false
    }).limit(50);

    if (completedTasks.length === 0) return 25; // Default

    const responseTimes = completedTasks.map(task => 
      task.actualPerformance?.responseTime || 25
    );

    return Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length);
  }

  /**
   * Calculate coverage areas from active teams and service areas
   */
  private async calculateCoverageAreas(businessId: string): Promise<number> {
    const activeTeams = await this.teamLocationModel.countDocuments({
      businessId,
      status: TeamLocationStatus.ACTIVE,
      isDeleted: false
    });

    // Estimate coverage areas based on active teams
    return Math.ceil(activeTeams * 1.5);
  }

  /**
   * Calculate estimated start time for a task in route
   */
  private calculateEstimatedStartTime(routeStart: Date, taskIndex: number): Date {
    const startTime = new Date(routeStart);
    startTime.setHours(8, 0, 0, 0); // Start at 8 AM
    startTime.setMinutes(startTime.getMinutes() + (taskIndex * 60)); // 1 hour per task
    return startTime;
  }

  /**
   * Calculate estimated end time for a task
   */
  private calculateEstimatedEndTime(routeStart: Date, taskIndex: number, duration: number): Date {
    const endTime = this.calculateEstimatedStartTime(routeStart, taskIndex);
    endTime.setMinutes(endTime.getMinutes() + duration);
    return endTime;
  }

  /**
   * Calculate estimated completion time
   */
  private calculateEstimatedCompletion(routeData: any): Date {
    const remainingTasks = routeData.taskIds.length - routeData.completedTasks;
    const avgTaskTime = 60; // 60 minutes per task
    const remainingMinutes = remainingTasks * avgTaskTime;
    
    const completionTime = new Date();
    completionTime.setMinutes(completionTime.getMinutes() + remainingMinutes);
    
    return completionTime;
  }
}