// src/services/team-location.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business } from '../schemas/business.schema';
import { TeamLocation, TeamLocationStatus, ConnectivityStatus } from '../schemas/team-location.schema';
import { RouteProgress, RouteStatus } from '../schemas/route-progress.schema';
import { TeamAvailability, AvailabilityStatus } from '../schemas/team-availability.schema';
import { FieldTask, FieldTaskStatus } from '../schemas/field-task.schema';

interface LocationHistoryEntry {
  id: string;
  timestamp: Date;
  latitude: number;
  longitude: number;
  address?: string;
  accuracy?: number;
  source: 'gps' | 'manual' | 'address';
  notes?: string;
  isManualUpdate: boolean;
  batteryLevel?: number;
  speed?: number;
  heading?: number;
}

export interface TeamAvailabilityResponse {
    teamId: string;
    teamName: string;
    availability: {
      today: {
        status: 'available' | 'busy' | 'offline' | 'unavailable';
        workingHours: {
          start: string;
          end: string;
        };
        scheduledTasks: number;
        completedTasks: number;
        currentCapacity: number;
        maxCapacity: number;
      };
      week: Array<{
        date: string;
        dayOfWeek: string;
        status: 'available' | 'busy' | 'offline' | 'scheduled';
        scheduledHours: number;
        tasks: number;
      }>;
      upcomingSchedule: Array<{
        date: string;
        time: string;
        task: string;
        location: string;
        duration: number;
      }>;
    };
    performance: {
      efficiency: number;
      completionRate: number;
      averageResponseTime: number;
      rating: number;
    };
    lastUpdated: string;
    emergencyContact?: {
      name: string;
      phone: string;
      relationship: string;
    };
  }
  
  export interface AllTeamsAvailabilityResponse {
    teams: TeamAvailabilityResponse[];
    summary: {
      totalTeams: number;
      availableTeams: number;
      busyTeams: number;
      offlineTeams: number;
      teamsWithEmergencyContact: number;
    };
  }
  

interface LocationHistoryResponse {
  history: LocationHistoryEntry[];
  total: number;
  teamId: string;
  teamName: string;
}

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
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  vehicle_info?: {
    type: string;
    license_plate: string;
    fuel_level?: number;
    model?: string;
    year?: number;
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
  // REAL LOCATION TRACKING USING YOUR SCHEMAS WITH PHP ID SUPPORT
  // ============================================================================

  /**
   * Update team location using real TeamLocation schema with PHP ID handling and debug info
   */
  async updateTeamLocation(request: UpdateTeamLocationRequest): Promise<{ success: boolean; message: string; debug?: any }> {
    const debugInfo: any = {
      requestTeamId: request.teamId,
      businessId: request.businessId,
      coordinates: { lat: request.location.lat, lng: request.location.lng },
      timestamp: new Date().toISOString()
    };

    try {
      // Step 1: Validate business
      debugInfo.step1_validateBusiness = 'starting';
      const business = await this.validateBusiness(request.businessId);
      debugInfo.step1_validateBusiness = 'completed';
      debugInfo.businessFound = !!business;
      debugInfo.businessName = business?.name;
      debugInfo.teamsCount = business?.teams?.length || 0;

      // Step 2: Find team by PHP ID first, then by MongoDB ID as fallback
      debugInfo.step2_findTeam = 'starting';
      let team = business.teams?.find((t: any) => t.metadata?.phpId === request.teamId);
      debugInfo.foundByPhpId = !!team;
      
      if (!team) {
        team = business.teams?.find((t: any) => t.id === request.teamId);
        debugInfo.foundByMongoId = !!team;
      }
      
      if (!team) {
        debugInfo.availableTeams = business.teams?.map((t: any) => ({
          id: t.id,
          phpId: t.metadata?.phpId,
          name: t.name
        })) || [];
        debugInfo.step2_findTeam = 'failed - team not found';
        throw new NotFoundException('Team not found');
      }

      debugInfo.step2_findTeam = 'completed';
      debugInfo.teamFound = {
        id: team.id,
        phpId: team.metadata?.phpId,
        name: team.name
      };

      // Step 3: Validate coordinates
      debugInfo.step3_validateCoordinates = 'starting';
      this.validateCoordinates(request.location.lat, request.location.lng);
      debugInfo.step3_validateCoordinates = 'completed';
      debugInfo.coordinatesValid = true;

      // Step 4: Use PHP ID for storage if available, otherwise use the provided teamId
      const storageTeamId = team.metadata?.phpId || request.teamId;
      debugInfo.step4_determineStorageId = 'completed';
      debugInfo.storageTeamId = storageTeamId;

      // Step 5: Find existing location record
      debugInfo.step5_findExistingLocation = 'starting';
      const existingQuery = {
        businessId: request.businessId,
        teamId: storageTeamId,
        isDeleted: false
      };
      debugInfo.existingQuery = existingQuery;

      let teamLocation = await this.teamLocationModel.findOne(existingQuery);
      debugInfo.step5_findExistingLocation = 'completed';
      debugInfo.existingLocationFound = !!teamLocation;
      debugInfo.existingLocationId = teamLocation?._id?.toString();

      if (!teamLocation) {
        debugInfo.step6_createNewLocation = 'starting';
        debugInfo.action = 'creating_new';
        
        // Create new team location record
        const newLocationData = {
          businessId: request.businessId,
          teamId: storageTeamId,
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
        };
        
        debugInfo.newLocationData = {
          ...newLocationData,
          createdBy: newLocationData.createdBy?.toString()
        };
        
        teamLocation = new this.teamLocationModel(newLocationData);
        debugInfo.step6_createNewLocation = 'model_created';
      } else {
        debugInfo.step6_updateExistingLocation = 'starting';
        debugInfo.action = 'updating_existing';
        debugInfo.existingLocation = {
          id: teamLocation._id?.toString(),
          teamId: teamLocation.teamId,
          lastUpdate: teamLocation.lastLocationUpdate,
          currentStatus: teamLocation.status
        };

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
        debugInfo.step6_updateExistingLocation = 'fields_updated';
      }

      // Step 7: Save the team location
      debugInfo.step7_saveLocation = 'starting';
      const savedLocation = await teamLocation.save();
      debugInfo.step7_saveLocation = 'completed';
      debugInfo.saveSuccessful = true;
      debugInfo.savedLocationId = savedLocation._id?.toString();
      debugInfo.savedLocation = {
        teamId: savedLocation.teamId,
        teamName: savedLocation.teamName,
        latitude: savedLocation.location.latitude,
        longitude: savedLocation.location.longitude,
        status: savedLocation.status,
        lastUpdate: savedLocation.lastLocationUpdate
      };

      // Step 8: Update team availability if status changed
      if (request.status) {
        debugInfo.step8_updateAvailability = 'starting';
        await this.updateTeamAvailability(request.businessId, storageTeamId, request.status);
        debugInfo.step8_updateAvailability = 'completed';
        debugInfo.availabilityUpdated = true;
      } else {
        debugInfo.step8_updateAvailability = 'skipped - no status provided';
      }

      debugInfo.completedSuccessfully = true;
      debugInfo.endTimestamp = new Date().toISOString();

      this.logger.log(`Updated location for team ${request.teamId} (storage: ${storageTeamId}) in business ${request.businessId}`);

      return {
        success: true,
        message: `Location updated for team ${team.name}`,
        debug: debugInfo
      };

    } catch (error) {
      debugInfo.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
        timestamp: new Date().toISOString()
      };
      
      debugInfo.completedSuccessfully = false;
      debugInfo.errorTimestamp = new Date().toISOString();
      
      this.logger.error(`Error updating team location: ${error.message}`, error.stack);
      
      // Include debug info in error for easier troubleshooting
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        return {
          success: false,
          message: `${error.message}`,
          debug: debugInfo
        };
      }
      
      throw error;
    }
}

  /**
   * Get team locations with filters using real database queries with PHP ID support
   * UPDATED: Now includes emergency contact information
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
        // Check location records using both PHP ID and MongoDB ID
        const locationRecord = teamLocations.find(loc => 
          loc.teamId === team.metadata?.phpId || loc.teamId === team.id
        );
        
        if (!locationRecord) {
          // Team without location data - show as offline
          teamLocationResponses.push({
            id: team.metadata?.phpId || team.id,
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
            project_name: team.metadata?.project_name,
            route_progress: team.routeProgress,
            // UPDATED: Include emergency contact from team data
            emergencyContact: team.emergencyContact ? {
              name: team.emergencyContact.name,
              phone: team.emergencyContact.phone,
              relationship: team.emergencyContact.relationship
            } : undefined,
            // NEW: Include vehicle info from team data
            vehicle_info: team.vehicleInfo ? {
              type: team.vehicleInfo.type,
              license_plate: team.vehicleInfo.licensePlate,
              fuel_level: team.vehicleInfo.currentFuelLevel,
              model: team.vehicleInfo.model,
              year: team.vehicleInfo.year
            } : undefined
          });
        } else {
          const routeProgress = await this.getRouteProgress(team.metadata?.phpId || team.id, businessId);
          
          teamLocationResponses.push({
            id: team.metadata?.phpId || team.id,
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
            },
            // UPDATED: Include emergency contact from team data
            emergencyContact: team.emergencyContact ? {
              name: team.emergencyContact.name,
              phone: team.emergencyContact.phone,
              relationship: team.emergencyContact.relationship
            } : undefined,
            // NEW: Include vehicle info from team data
            vehicle_info: team.vehicleInfo ? {
              type: team.vehicleInfo.type,
              license_plate: team.vehicleInfo.licensePlate,
              fuel_level: team.vehicleInfo.currentFuelLevel,
              model: team.vehicleInfo.model,
              year: team.vehicleInfo.year
            } : undefined
          });
        }
      }

      // Apply project filter if specified
      let filteredLocations = teamLocationResponses;
      if (filters?.project && filters.project !== 'all') {
        filteredLocations = filteredLocations.filter(loc => loc.project_name === filters.project);
      }

      this.logger.log(`Retrieved ${filteredLocations.length} team locations with emergency contact info for business ${businessId}`);

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
      const recentThreshold = new Date(Date.now() - 60 * 60 * 8 * 1000); // 8 hour ago

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
   * Track route progress using real RouteProgress schema with PHP ID support
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

      // Find team by PHP ID first, then by MongoDB ID as fallback
      let team = business.teams?.find((t: any) => t.metadata?.phpId === teamId);
      if (!team) {
        team = business.teams?.find((t: any) => t.id === teamId);
      }
      if (!team) {
        throw new NotFoundException('Team not found');
      }

      // Use PHP ID for storage if available, otherwise use the provided teamId
      const storageTeamId = team.metadata?.phpId || teamId;

      const routeDate = routeData.routeDate || new Date();
      const startOfDay = new Date(routeDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(routeDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Find existing route progress or create new
      let routeProgress = await this.routeProgressModel.findOne({
        businessId,
        teamId: storageTeamId,
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
          teamId: storageTeamId,
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

      this.logger.log(`Updated route progress for team ${teamId} (storage: ${storageTeamId}): ${routeData.completedTasks}/${routeData.taskIds.length} tasks completed`);

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
 * ENHANCED: Get comprehensive team availability with detailed analytics
 * Returns structured data matching frontend expectations
 */
async getTeamAvailability(businessId: string, teamId?: string): Promise<any> {
    try {
      const business = await this.validateBusiness(businessId);
  
      if (teamId) {
        // Find team by PHP ID first, then by MongoDB ID as fallback
        let team = business.teams?.find((t: any) => t.metadata?.phpId === teamId);
        if (!team) {
          team = business.teams?.find((t: any) => t.id === teamId);
        }
        if (!team) {
          throw new NotFoundException('Team not found');
        }
  
        const storageTeamId = team.metadata?.phpId || teamId;
  
        // Get team location and availability records
        const teamLocation = await this.teamLocationModel.findOne({
          businessId,
          teamId: storageTeamId,
          isDeleted: false
        });
  
        const teamAvailability = await this.teamAvailabilityModel.findOne({
          businessId,
          teamId: storageTeamId,
          isDeleted: false
        });
  
        // Calculate comprehensive availability data
        const availabilityData = await this.calculateTeamAvailabilityDetails(
          businessId, 
          storageTeamId, 
          team, 
          teamLocation, 
          teamAvailability
        );
  
        return availabilityData;
  
      } else {
        // Get all teams availability summary
        const teamLocations = await this.teamLocationModel.find({
          businessId,
          isDeleted: false
        });
  
        const teamAvailabilities = await this.teamAvailabilityModel.find({
          businessId,
          isDeleted: false
        });
  
        const teams = await Promise.all((business.teams || []).map(async (team: any) => {
          const location = teamLocations.find(loc => 
            loc.teamId === team.metadata?.phpId || loc.teamId === team.id
          );
          const availability = teamAvailabilities.find(avail => 
            avail.teamId === team.metadata?.phpId || avail.teamId === team.id
          );
  
          const storageTeamId = team.metadata?.phpId || team.id;
          const basicAvailability = await this.calculateTeamAvailabilityDetails(
            businessId, 
            storageTeamId, 
            team, 
            location, 
            availability
          );
  
          return {
            teamId: team.metadata?.phpId || team.id,
            teamName: team.name,
            available: location?.status === TeamLocationStatus.ACTIVE,
            status: location?.status || TeamLocationStatus.OFFLINE,
            location: location?.location || null,
            lastUpdated: location?.lastLocationUpdate?.toISOString() || new Date().toISOString(),
            availability: basicAvailability.availability,
            performance: basicAvailability.performance,
            emergencyContact: team.emergencyContact
          };
        }));
  
        return {
          teams,
          summary: {
            totalTeams: teams.length,
            availableTeams: teams.filter(t => t.availability.today.status === 'available').length,
            busyTeams: teams.filter(t => t.availability.today.status === 'busy').length,
            offlineTeams: teams.filter(t => t.availability.today.status === 'offline').length,
            teamsWithEmergencyContact: teams.filter(t => t.emergencyContact?.phone).length
          }
        };
      }
  
    } catch (error) {
      this.logger.error(`Error getting team availability: ${error.message}`, error.stack);
      throw error;
    }
  }


  /**
 * FIXED: Calculate comprehensive team availability details with proper team parameter passing
 */
private async calculateTeamAvailabilityDetails(
    businessId: string,
    teamId: string,
    team: any,
    teamLocation: any,
    teamAvailability: any
  ): Promise<any> {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
  
    // FIXED: Pass team object to calculation methods
    const todayData = await this.calculateTodayAvailability(businessId, teamId, teamLocation, today, team);
    
    // FIXED: Pass team object to calculation methods
    const weekData = await this.calculateWeekAvailability(businessId, teamId, today, team);
    
    // Get upcoming schedule with flexible team ID matching
    const upcomingSchedule = await this.getUpcomingSchedule(businessId, teamId, now, team);
    
    // NEW: Check for tasks beyond current week
    const futureTasksInfo = await this.getFutureTasksIndicator(businessId, teamId, today, team);
    
    // Calculate performance metrics with flexible team ID matching
    const performance = await this.calculatePerformanceMetrics(businessId, teamId, team);
  
    return {
      teamId,
      teamName: team.name,
      availability: {
        today: todayData,
        week: weekData,
        upcomingSchedule,
        futureWork: futureTasksInfo  // NEW: Future tasks indicator
      },
      performance,
      lastUpdated: teamLocation?.lastLocationUpdate?.toISOString() || now.toISOString(),
      emergencyContact: team.emergencyContact ? {
        name: team.emergencyContact.name,
        phone: team.emergencyContact.phone,
        relationship: team.emergencyContact.relationship
      } : undefined
    };
  }
  
  /**
 * FIXED: Calculate today's availability details with proper 3-ID format handling
 * Team objects have 3 possible IDs:
 * - team._id: MongoDB ObjectId (e.g., "6839a523ebf4dc20600760cc")  
 * - team.id: Generated ID (e.g., "1748608291431")
 * - team.metadata.phpId: Original PHP system ID (e.g., "19")
 */

  private async calculateTodayAvailability(
    businessId: string,
    teamId: string,
    teamLocation: any,
    today: Date,
    team: any
): Promise<any> {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Setup flexible team ID matching for ALL 3 possible formats
    const phpId = team.metadata?.phpId;           // "19"
    const generatedId = team.id;                  // "1748608291431" 
    const mongoObjectId = team._id?.toString();   // ObjectId as string
    
    // Build query to check ALL possible team ID formats
    const teamIdQuery = [];
    if (phpId) teamIdQuery.push(phpId);
    if (generatedId && !teamIdQuery.includes(generatedId)) teamIdQuery.push(generatedId);
    if (mongoObjectId && !teamIdQuery.includes(mongoObjectId)) teamIdQuery.push(mongoObjectId);
    if (teamId && !teamIdQuery.includes(teamId)) teamIdQuery.push(teamId);

    // Get today's tasks using flexible team ID matching
    const todayTasks = await this.fieldTaskModel.find({
        businessId,
        assignedTeamId: { $in: teamIdQuery },
        scheduledDate: { $gte: today, $lt: tomorrow },
        isDeleted: false
    });

    // Get today's route progress using the same flexible matching
    const routeProgress = await this.routeProgressModel.findOne({
        businessId,
        teamId: { $in: teamIdQuery },
        routeDate: { $gte: today, $lt: tomorrow },
        isDeleted: false
    });

    // Calculate working hours (default or from team data)
    const workingHours = {
        start: team.workingHours?.start || '8:00 AM',
        end: team.workingHours?.end || '5:00 PM'
    };

    // Calculate task metrics
    const scheduledTasks = todayTasks.length;
    const completedTasks = todayTasks.filter(task => 
        task.status === FieldTaskStatus.COMPLETED
    ).length;
    const inProgressTasks = todayTasks.filter(task => 
        task.status === FieldTaskStatus.IN_PROGRESS
    ).length;

    // FIXED: Use team's configured max daily tasks instead of hardcoded 10
    const maxCapacity = team.maxDailyTasks || 8; // Default to 8 if not configured
    const currentCapacity = scheduledTasks; // Total tasks assigned today
    const utilizationPercentage = Math.round((scheduledTasks / maxCapacity) * 100);

    // Better status logic based on capacity and activity
    let currentStatus: 'available' | 'busy' | 'offline' | 'unavailable' = 'offline';
    
    if (teamLocation) {
        switch (teamLocation.status) {
            case TeamLocationStatus.ACTIVE:
                // More nuanced status based on workload and progress
                if (utilizationPercentage >= 80) {
                    currentStatus = 'busy'; // 80%+ capacity = busy
                } else if (scheduledTasks > 0 || inProgressTasks > 0) {
                    currentStatus = 'available'; // Has work but not overwhelmed = available/working
                } else {
                    currentStatus = 'available'; // No tasks = available for new work
                }
                break;
            case TeamLocationStatus.BREAK:
                currentStatus = 'unavailable';
                break;
            case TeamLocationStatus.INACTIVE:
            case TeamLocationStatus.OFFLINE:
            default:
                currentStatus = 'offline';
                break;
        }
    }

    // Add more detailed status explanation
    let statusExplanation = '';
    switch (currentStatus) {
        case 'available':
            if (scheduledTasks > 0) {
                statusExplanation = `Working within capacity (${utilizationPercentage}% utilized)`;
            } else {
                statusExplanation = 'Available for new assignments';
            }
            break;
        case 'busy':
            statusExplanation = `High workload (${utilizationPercentage}% capacity)`;
            break;
        case 'offline':
            statusExplanation = 'Team is offline or inactive';
            break;
        case 'unavailable':
            statusExplanation = 'Team is on break';
            break;
    }

    // Debug log to show capacity source
    console.log(`[DEBUG] Team ${team.name} capacity: ${currentCapacity}/${maxCapacity} (${utilizationPercentage}%)`);
    console.log(`[DEBUG] Max capacity source: ${team.maxDailyTasks ? 'team.maxDailyTasks' : 'default fallback'}`);

    return {
        status: currentStatus,
        statusExplanation, // Detailed explanation
        workingHours,
        scheduledTasks,
        completedTasks,
        inProgressTasks, // Add in-progress count
        currentCapacity,
        maxCapacity, // FIXED: Now uses team.maxDailyTasks
        utilizationPercentage, // Add utilization percentage
        workloadSummary: { // Workload breakdown
            total: scheduledTasks,
            completed: completedTasks,
            inProgress: inProgressTasks,
            pending: scheduledTasks - completedTasks - inProgressTasks
        }
    };
}
  
  /**
 * FIXED: Calculate week availability data with proper PHP ID handling
 */
private async calculateWeekAvailability(
    businessId: string,
    teamId: string,
    startOfWeek: Date,
    team: any  // Added team parameter to access both IDs
  ): Promise<any[]> {
    const weekData = [];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
    // FIXED: Setup flexible team ID matching for ALL 3 possible formats
    const phpId = team.metadata?.phpId;           // "19"
    const generatedId = team.id;                  // "1748608291431"
    const mongoObjectId = team._id?.toString();   // ObjectId as string
    
    const teamIdQuery = [];
    if (phpId) teamIdQuery.push(phpId);
    if (generatedId && !teamIdQuery.includes(generatedId)) teamIdQuery.push(generatedId);
    if (mongoObjectId && !teamIdQuery.includes(mongoObjectId)) teamIdQuery.push(mongoObjectId);
    if (teamId && !teamIdQuery.includes(teamId)) teamIdQuery.push(teamId);
  
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
  
      // FIXED: Get tasks for this day using flexible team ID matching
      const dayTasks = await this.fieldTaskModel.find({
        businessId,
        assignedTeamId: { $in: teamIdQuery },  // FIXED: Check multiple possible team IDs
        scheduledDate: { $gte: date, $lt: nextDay },
        isDeleted: false
      });
  
      // FIXED: Get route progress for this day using flexible team ID matching
      const routeProgress = await this.routeProgressModel.findOne({
        businessId,
        teamId: { $in: teamIdQuery },  // FIXED: Check multiple possible team IDs
        routeDate: { $gte: date, $lt: nextDay },
        isDeleted: false
      });
  
      // Determine day status
      let dayStatus: 'available' | 'busy' | 'offline' | 'scheduled' = 'available';
      
      if (dayTasks.length > 0) {
        const hasInProgress = dayTasks.some(task => task.status === FieldTaskStatus.IN_PROGRESS);
        const hasCompleted = dayTasks.some(task => task.status === FieldTaskStatus.COMPLETED);
        
        if (hasInProgress) {
          dayStatus = 'busy';
        } else if (hasCompleted || dayTasks.length > 0) {
          dayStatus = 'scheduled';
        }
      }
  
      // Calculate scheduled hours (estimated)
      const scheduledHours = dayTasks.reduce((total, task) => {
        return total + (task.estimatedDuration || 60) / 60; // Convert minutes to hours
      }, 0);
  
      weekData.push({
        date: date.toISOString().split('T')[0],
        dayOfWeek: dayNames[date.getDay()],
        status: dayStatus,
        scheduledHours: Math.round(scheduledHours * 10) / 10, // Round to 1 decimal
        tasks: dayTasks.length
      });
    }
  
    return weekData;
  }
  
 /**
 * FIXED: Calculate comprehensive performance metrics with proper PHP ID handling
 */
private async calculatePerformanceMetrics(
    businessId: string,
    teamId: string,
    team: any  // Added team parameter
  ): Promise<{
    efficiency: number;
    completionRate: number;
    averageResponseTime: number;
    rating: number;
  }> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
      // FIXED: Setup flexible team ID matching for ALL 3 possible formats
      const phpId = team.metadata?.phpId;           // "19"
      const generatedId = team.id;                  // "1748608291431"
      const mongoObjectId = team._id?.toString();   // ObjectId as string
      
      const teamIdQuery = [];
      if (phpId) teamIdQuery.push(phpId);
      if (generatedId && !teamIdQuery.includes(generatedId)) teamIdQuery.push(generatedId);
      if (mongoObjectId && !teamIdQuery.includes(mongoObjectId)) teamIdQuery.push(mongoObjectId);
      if (teamId && !teamIdQuery.includes(teamId)) teamIdQuery.push(teamId);
  
      // Debug log for troubleshooting
      console.log(`[DEBUG] Performance metrics for team ${team.name} checking IDs:`, teamIdQuery);
  
      // FIXED: Get recent tasks using flexible team ID matching
      const recentTasks = await this.fieldTaskModel.find({
        businessId,
        assignedTeamId: { $in: teamIdQuery },  // FIXED: Check multiple possible team IDs
        createdAt: { $gte: thirtyDaysAgo },
        isDeleted: false
      });
  
      // Get completed tasks
      const completedTasks = recentTasks.filter(task => 
        task.status === FieldTaskStatus.COMPLETED
      );
  
      // Calculate completion rate
      const completionRate = recentTasks.length > 0 ? 
        (completedTasks.length / recentTasks.length) * 100 : 0;
  
      // Calculate efficiency (actual vs estimated duration)
      let efficiency = 0; // Default to 0%
      if (completedTasks.length > 0) {
        const efficiencyReadings = completedTasks
          .filter(task => 
            task.actualPerformance?.actualDuration && 
            task.estimatedDuration
          )
          .map(task => {
            const estimated = task.estimatedDuration;
            const actual = task.actualPerformance!.actualDuration!;
            // Efficiency = (estimated / actual) * 100
            // If actual < estimated, efficiency > 100% (good)
            // If actual > estimated, efficiency < 100% (needs improvement)
            return Math.min(200, (estimated / actual) * 100); // Cap at 200%
          });
  
        if (efficiencyReadings.length > 0) {
          efficiency = efficiencyReadings.reduce((sum, eff) => sum + eff, 0) / efficiencyReadings.length;
        }
      }
  
      // Calculate average response time
      let averageResponseTime = 0; // Default 0 minutes
      if (completedTasks.length > 0) {
        const responseTimes = completedTasks
          .filter(task => 
            task.actualPerformance?.startTime && 
            task.scheduledDate
          )
          .map(task => {
            // Calculate time between scheduled time and actual start
            const scheduled = new Date(task.scheduledDate);
            if (task.timeWindow?.start) {
              const [hours, minutes] = task.timeWindow.start.split(':').map(Number);
              scheduled.setHours(hours, minutes, 0, 0);
            } else if (task.scheduledTime) {
              const [hours, minutes] = task.scheduledTime.split(':').map(Number);
              scheduled.setHours(hours, minutes, 0, 0);
            } else {
              scheduled.setHours(9, 0, 0, 0); // Default to 9 AM
            }
            
            const actualStart = task.actualPerformance!.startTime!;
            const diffMinutes = Math.abs(actualStart.getTime() - scheduled.getTime()) / (1000 * 60);
            
            return Math.min(120, diffMinutes); // Cap at 2 hours
          });
  
        if (responseTimes.length > 0) {
          averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
        }
      }
  
      // Calculate rating based on client signoffs
      let rating = 0; // Default to 0 stars
      const tasksWithRatings = completedTasks.filter(task => 
        task.clientSignoff?.satisfactionRating
      );
  
      if (tasksWithRatings.length > 0) {
        const totalRating = tasksWithRatings.reduce((sum, task) => 
          sum + (task.clientSignoff!.satisfactionRating! || 5), 0
        );
        rating = totalRating / tasksWithRatings.length;
      }
  
      // Round all values appropriately
      return {
        efficiency: Math.round(efficiency * 10) / 10, // 1 decimal place
        completionRate: Math.round(completionRate * 10) / 10, // 1 decimal place
        averageResponseTime: Math.round(averageResponseTime), // Whole minutes
        rating: Math.round(rating * 10) / 10 // 1 decimal place
      };
  
    } catch (error) {
      this.logger.warn(`Failed to calculate performance metrics for team ${teamId}: ${error.message}`);
      
      // Return default values if calculation fails
      return {
        efficiency: 0,
        completionRate: 0,
        averageResponseTime: 0,
        rating: 0
      };
    }
  }

  /**
 * NEW: Check for tasks scheduled beyond the current week
 */
private async getFutureTasksIndicator(
    businessId: string,
    teamId: string,
    currentWeekStart: Date,
    team: any
  ): Promise<{
    hasFutureTasks: boolean;
    futureTasksCount: number;
    nextTaskDate?: string;
    furthestTaskDate?: string;
  }> {
    try {
      // Calculate end of current week (7 days from start)
      const currentWeekEnd = new Date(currentWeekStart);
      currentWeekEnd.setDate(currentWeekStart.getDate() + 7);
      currentWeekEnd.setHours(23, 59, 59, 999);
  
      // Setup flexible team ID matching for ALL 3 possible formats
      const phpId = team.metadata?.phpId;           // "19"
      const generatedId = team.id;                  // "1748608291431"
      const mongoObjectId = team._id?.toString();   // ObjectId as string
      
      const teamIdQuery = [];
      if (phpId) teamIdQuery.push(phpId);
      if (generatedId && !teamIdQuery.includes(generatedId)) teamIdQuery.push(generatedId);
      if (mongoObjectId && !teamIdQuery.includes(mongoObjectId)) teamIdQuery.push(mongoObjectId);
      if (teamId && !teamIdQuery.includes(teamId)) teamIdQuery.push(teamId);
  
      // Debug log for troubleshooting
      console.log(`[DEBUG] Future tasks check for team ${team.name} beyond ${currentWeekEnd.toISOString()}`);
  
      // Get all future tasks beyond current week
      const futureTasks = await this.fieldTaskModel.find({
        businessId,
        assignedTeamId: { $in: teamIdQuery },
        scheduledDate: { $gt: currentWeekEnd },
        status: { 
          $in: [
            FieldTaskStatus.PENDING, 
            FieldTaskStatus.SCHEDULED, 
            FieldTaskStatus.ASSIGNED,
            FieldTaskStatus.IN_PROGRESS  // Include in-progress for completeness
          ] 
        },
        isDeleted: false
      }).sort({ scheduledDate: 1 });
  
      const hasFutureTasks = futureTasks.length > 0;
      const futureTasksCount = futureTasks.length;
  
      let nextTaskDate: string | undefined;
      let furthestTaskDate: string | undefined;
  
      if (hasFutureTasks) {
        // Get next upcoming task date
        nextTaskDate = futureTasks[0].scheduledDate.toISOString().split('T')[0];
        
        // Get furthest task date
        furthestTaskDate = futureTasks[futureTasks.length - 1].scheduledDate.toISOString().split('T')[0];
      }
  
      return {
        hasFutureTasks,
        futureTasksCount,
        nextTaskDate,
        furthestTaskDate
      };
  
    } catch (error) {
      console.warn(`Failed to check future tasks for team ${teamId}: ${error.message}`);
      
      // Return default values if check fails
      return {
        hasFutureTasks: false,
        futureTasksCount: 0
      };
    }
  }

  /**
 * FIXED: Get upcoming scheduled tasks with proper date handling
 * Now includes today's remaining tasks and better status filtering
 */
private async getUpcomingSchedule(
    businessId: string,
    teamId: string,
    fromDate: Date,
    team: any
): Promise<any[]> {
    // FIXED: Use start of today instead of current time to include today's tasks
    const startOfToday = new Date(fromDate);
    startOfToday.setHours(0, 0, 0, 0);
    
    const upcomingLimit = new Date(startOfToday);
    upcomingLimit.setDate(upcomingLimit.getDate() + 14); // Next 2 weeks

    // Setup flexible team ID matching for ALL 3 possible formats
    const phpId = team.metadata?.phpId;
    const generatedId = team.id;
    const mongoObjectId = team._id?.toString();
    
    const teamIdQuery = [];
    if (phpId) teamIdQuery.push(phpId);
    if (generatedId && !teamIdQuery.includes(generatedId)) teamIdQuery.push(generatedId);
    if (mongoObjectId && !teamIdQuery.includes(mongoObjectId)) teamIdQuery.push(mongoObjectId);
    if (teamId && !teamIdQuery.includes(teamId)) teamIdQuery.push(teamId);

    // FIXED: More inclusive status filtering and better date range
    const upcomingTasks = await this.fieldTaskModel.find({
        businessId,
        assignedTeamId: { $in: teamIdQuery },
        scheduledDate: { 
            $gte: startOfToday,  // FIXED: Use start of today, not current time
            $lte: upcomingLimit 
        },
        status: { 
            $in: [
                FieldTaskStatus.PENDING, 
                FieldTaskStatus.SCHEDULED, 
                FieldTaskStatus.ASSIGNED,
                FieldTaskStatus.IN_PROGRESS  // FIXED: Include in-progress tasks
                // Note: Not including COMPLETED tasks as they shouldn't be "upcoming"
            ] 
        },
        isDeleted: false
    }).sort({ scheduledDate: 1, scheduledTime: 1 }).limit(10);

    // Debug log to help troubleshoot
    console.log(`[DEBUG] Upcoming schedule query for team ${team.name}:`);
    console.log(`- Team IDs checked: ${teamIdQuery.join(', ')}`);
    console.log(`- Date range: ${startOfToday.toISOString()} to ${upcomingLimit.toISOString()}`);
    console.log(`- Found ${upcomingTasks.length} tasks`);
    
    if (upcomingTasks.length > 0) {
        console.log('- Task details:', upcomingTasks.map(task => ({
            id: task._id.toString(),
            name: task.name,
            scheduledDate: task.scheduledDate.toISOString(),
            scheduledTime: task.scheduledTime,
            timeWindow: task.timeWindow,
            status: task.status,
            assignedTeamId: task.assignedTeamId
        })));
    }

    return upcomingTasks.map(task => {
        // FIXED: Better time handling with fallbacks
        let taskTime = '9:00 AM'; // Default fallback
        
        if (task.timeWindow?.start) {
            taskTime = task.timeWindow.start;
        } else if (task.scheduledTime) {
            taskTime = task.scheduledTime;
        } else if (task.timeWindow?.end) {
            // If only end time is available, estimate start time
            taskTime = `Before ${task.timeWindow.end}`;
        }

        return {
            date: task.scheduledDate.toISOString().split('T')[0],
            time: taskTime,
            task: task.name || task.description || 'Scheduled task',
            location: task.location?.address || 'Location TBD',
            duration: Math.round((task.estimatedDuration || 60) / 60 * 10) / 10, // Convert to hours
            taskId: task._id.toString(),  // ADDED: Include task ID for debugging
            status: task.status  // ADDED: Include status for debugging
        };
    });
}

 /**
   * UPDATED: Export location data now includes emergency contact information
   */
 async exportLocationData(businessId: string): Promise<{ success: boolean; data: any[]; message: string }> {
    try {
      const business = await this.validateBusiness(businessId);
      const teamLocations = await this.getTeamLocations(businessId);

      // Prepare export data with comprehensive information including emergency contacts
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
          `${location.route_progress.completedTasks}/${location.route_progress.totalTasks}` : 'N/A',
        // NEW: Emergency contact information in export
        emergency_contact_name: location.emergencyContact?.name || 'N/A',
        emergency_contact_phone: location.emergencyContact?.phone || 'N/A',
        emergency_contact_relationship: location.emergencyContact?.relationship || 'N/A',
        // NEW: Vehicle information in export
        vehicle_type: location.vehicle_info?.type || 'N/A',
        vehicle_license_plate: location.vehicle_info?.license_plate || 'N/A',
        vehicle_fuel_level: location.vehicle_info?.fuel_level || 'N/A',
        vehicle_model: location.vehicle_info?.model || 'N/A',
        vehicle_year: location.vehicle_info?.year || 'N/A'
      }));

      this.logger.log(`Exported location data with emergency contacts and vehicle info for ${exportData.length} teams from business ${businessId}`);

      return {
        success: true,
        data: exportData,
        message: `Exported data for ${exportData.length} teams with emergency contact and vehicle information`
      };

    } catch (error) {
      this.logger.error(`Error exporting location data: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get team location history in format expected by frontend table with PHP ID support
   */
  async getTeamLocationHistory(
    businessId: string,
    teamId: string,
    filters: {
      limit: number;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<LocationHistoryResponse> {
    try {
      const business = await this.validateBusiness(businessId);

      // Find team by PHP ID first, then by MongoDB ID as fallback
      let team = business.teams?.find((t: any) => t.metadata?.phpId === teamId);
      if (!team) {
        team = business.teams?.find((t: any) => t.id === teamId);
      }
      if (!team) {
        throw new NotFoundException('Team not found');
      }

      // Use PHP ID for storage query if available, otherwise use the provided teamId
      const storageTeamId = team.metadata?.phpId || teamId;

      // Build query for team location record
      const query: any = {
        businessId,
        teamId: storageTeamId,
        isDeleted: false
      };

      // Get the team's location record
      const teamLocationRecord = await this.teamLocationModel.findOne(query);

      if (!teamLocationRecord) {
        return {
          history: [],
          total: 0,
          teamId,
          teamName: team.name
        };
      }

      // Get location history from the record
      let locationHistory = teamLocationRecord.locationHistory || [];

      // Apply date filters
      if (filters.startDate || filters.endDate) {
        locationHistory = locationHistory.filter(entry => {
          const entryDate = new Date(entry.timestamp);
          
          if (filters.startDate && entryDate < filters.startDate) {
            return false;
          }
          
          if (filters.endDate && entryDate > filters.endDate) {
            return false;
          }
          
          return true;
        });
      }

      // Sort by timestamp (newest first)
      locationHistory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Apply limit
      const limitedHistory = locationHistory.slice(0, filters.limit);

      // Format for frontend table - create comprehensive history entries
      const formattedHistory: LocationHistoryEntry[] = [];

      // Add current location as the most recent entry if it exists
      if (teamLocationRecord.location && teamLocationRecord.lastLocationUpdate) {
        formattedHistory.push({
          id: `current-${teamLocationRecord._id}`,
          timestamp: teamLocationRecord.lastLocationUpdate,
          latitude: teamLocationRecord.location.latitude,
          longitude: teamLocationRecord.location.longitude,
          address: teamLocationRecord.location.address || 'Address not available',
          accuracy: teamLocationRecord.location.accuracy,
          source: this.determineLocationSource(teamLocationRecord),
          notes: this.generateLocationNotes(teamLocationRecord),
          isManualUpdate: teamLocationRecord.metadata?.isCustomEntry || false,
          batteryLevel: teamLocationRecord.batteryLevel,
          speed: teamLocationRecord.location.speed,
          heading: teamLocationRecord.location.heading
        });
      }

      // Add historical entries
      limitedHistory.forEach((entry, index) => {
        formattedHistory.push({
          id: `history-${teamLocationRecord._id}-${index}`,
          timestamp: entry.timestamp,
          latitude: entry.latitude,
          longitude: entry.longitude,
          address: this.reverseGeocodeAddress(entry.latitude, entry.longitude),
          accuracy: entry.accuracy,
          source: this.determineHistorySource(entry),
          notes: this.generateHistoryNotes(entry, index),
          isManualUpdate: false, // Historical entries are typically from GPS
          batteryLevel: this.interpolateBatteryLevel(teamLocationRecord.batteryLevel, index),
          speed: this.calculateSpeed(limitedHistory, index),
          heading: this.calculateHeading(limitedHistory, index)
        });
      });

      // Remove duplicates and sort again
      const uniqueHistory = this.removeDuplicateLocations(formattedHistory);
      uniqueHistory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      this.logger.log(`Retrieved ${uniqueHistory.length} location history entries for team ${teamId} (storage: ${storageTeamId})`);

      return {
        history: uniqueHistory.slice(0, filters.limit),
        total: uniqueHistory.length,
        teamId,
        teamName: team.name
      };

    } catch (error) {
      this.logger.error(`Error getting team location history: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Determine location source from team location record
   */
  private determineLocationSource(teamLocation: any): 'gps' | 'manual' | 'address' {
    if (teamLocation.metadata?.isCustomEntry) {
      return teamLocation.metadata?.entryMethod || 'manual';
    }
    
    if (teamLocation.location.accuracy && teamLocation.location.accuracy < 20) {
      return 'gps';
    }
    
    if (teamLocation.location.address && !teamLocation.location.accuracy) {
      return 'address';
    }
    
    return 'gps';
  }

  /**
   * Determine source for historical entries
   */
  private determineHistorySource(entry: any): 'gps' | 'manual' | 'address' {
    if (entry.accuracy && entry.accuracy < 20) {
      return 'gps';
    }
    
    return 'gps'; // Most historical entries are from GPS tracking
  }

  /**
   * Generate notes for current location
   */
  private generateLocationNotes(teamLocation: any): string {
    const notes = [];
    
    if (teamLocation.currentTaskId) {
      notes.push(`Working on task: ${teamLocation.currentTaskId}`);
    }
    
    if (teamLocation.status === TeamLocationStatus.BREAK) {
      notes.push('Team on break');
    }
    
    if (teamLocation.metadata?.notes) {
      notes.push(teamLocation.metadata.notes);
    }
    
    if (teamLocation.connectivity === ConnectivityStatus.POOR) {
      notes.push('Poor connectivity');
    }
    
    return notes.join(', ') || undefined;
  }

  /**
   * Generate notes for historical entries
   */
  private generateHistoryNotes(entry: any, index: number): string {
    const notes = [];
    
    if (index === 0) {
      notes.push('Recent location update');
    }
    
    if (entry.accuracy && entry.accuracy > 50) {
      notes.push('Low GPS accuracy');
    }
    
    // Add time-based context
    const hour = new Date(entry.timestamp).getHours();
    if (hour < 8 || hour > 18) {
      notes.push('Outside working hours');
    }
    
    return notes.join(', ') || undefined;
  }

  /**
   * Simple reverse geocoding placeholder
   */
  private reverseGeocodeAddress(lat: number, lng: number): string {
    // In a real implementation, you'd call a geocoding service
    // For now, return coordinates as address
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }

  /**
   * Interpolate battery level for historical entries
   */
  private interpolateBatteryLevel(currentBattery?: number, index?: number): number | undefined {
    if (!currentBattery || !index) return currentBattery;
    
    // Simulate battery drain over time (rough estimation)
    const drainPerEntry = 2; // 2% per entry
    const estimatedBattery = currentBattery + (index * drainPerEntry);
    
    return Math.min(100, Math.max(0, estimatedBattery));
  }

  /**
   * Calculate speed between location points
   */
  private calculateSpeed(history: any[], index: number): number | undefined {
    if (index === 0 || index >= history.length - 1) return undefined;
    
    const current = history[index];
    const previous = history[index - 1];
    
    if (!current || !previous) return undefined;
    
    // Calculate distance and time difference
    const distance = this.calculateDistance(
      current.latitude, current.longitude,
      previous.latitude, previous.longitude
    );
    
    const timeDiff = (new Date(current.timestamp).getTime() - new Date(previous.timestamp).getTime()) / 1000 / 3600; // hours
    
    if (timeDiff === 0) return undefined;
    
    const speed = distance / timeDiff; // km/h
    return Math.round(speed * 10) / 10; // Round to 1 decimal place
  }

  /**
   * Calculate heading between location points
   */
  private calculateHeading(history: any[], index: number): number | undefined {
    if (index === 0 || index >= history.length - 1) return undefined;
    
    const current = history[index];
    const previous = history[index - 1];
    
    if (!current || !previous) return undefined;
    
    const lat1 = previous.latitude * Math.PI / 180;
    const lat2 = current.latitude * Math.PI / 180;
    const deltaLng = (current.longitude - previous.longitude) * Math.PI / 180;
    
    const y = Math.sin(deltaLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
    
    const heading = Math.atan2(y, x) * 180 / Math.PI;
    return Math.round((heading + 360) % 360);
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Remove duplicate location entries that are too close in time and space
   */
  private removeDuplicateLocations(history: LocationHistoryEntry[]): LocationHistoryEntry[] {
    const filtered: LocationHistoryEntry[] = [];
    const threshold = 0.0001; // ~10 meters
    const timeThreshold = 60000; // 1 minute
    
    for (const entry of history) {
      const isDuplicate = filtered.some(existing => {
        const latDiff = Math.abs(existing.latitude - entry.latitude);
        const lngDiff = Math.abs(existing.longitude - entry.longitude);
        const timeDiff = Math.abs(new Date(existing.timestamp).getTime() - new Date(entry.timestamp).getTime());
        
        return latDiff < threshold && lngDiff < threshold && timeDiff < timeThreshold;
      });
      
      if (!isDuplicate) {
        filtered.push(entry);
      }
    }
    
    return filtered;
  }

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
        id: member.id,
        name: member.name,
        role: member.role,
        phone: member.phone
      }));
    }

    // if no members are available, return empty array
    return [];
  }

  /**
   * Get route progress for a team using real data with PHP ID support
   */
  private async getRouteProgress(teamId: string, businessId: string): Promise<any> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Check for route progress using both PHP ID and MongoDB ID
    const business = await this.businessModel.findById(businessId);
    let actualTeamId = teamId;
    
    if (business) {
      const team = business.teams?.find((t: any) => t.metadata?.phpId === teamId);
      if (team) {
        // If we found a team by PHP ID, check if route progress exists with either ID
        const routeProgressByPhpId = await this.routeProgressModel.findOne({
          businessId,
          teamId: teamId,
          routeDate: { $gte: today, $lt: tomorrow },
          isDeleted: false
        });
        
        if (routeProgressByPhpId) {
          actualTeamId = teamId; // Use PHP ID
        } else {
          actualTeamId = team.id; // Try MongoDB ID
        }
      }
    }

    const routeProgress = await this.routeProgressModel.findOne({
      businessId,
      teamId: actualTeamId,
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
   * Update team availability status with PHP ID support
   */
  private async updateTeamAvailability(businessId: string, teamId: string, locationStatus: TeamLocationStatus): Promise<void> {
    try {
      // Find the team to get consistent ID
      const business = await this.businessModel.findById(businessId);
      if (!business) return;

      let team = business.teams?.find((t: any) => t.metadata?.phpId === teamId);
      if (!team) {
        team = business.teams?.find((t: any) => t.id === teamId);
      }
      if (!team) return;

      const storageTeamId = team.metadata?.phpId || teamId;

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
        { businessId, teamId: storageTeamId, isDeleted: false },
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
   * Calculate real response time from field tasks using actual duration
   */
  private async calculateRealResponseTime(businessId: string): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const completedTasks = await this.fieldTaskModel.find({
      businessId,
      status: FieldTaskStatus.COMPLETED,
      completedAt: { $gte: thirtyDaysAgo },
      'actualPerformance.actualDuration': { $exists: true },
      isDeleted: false
    }).limit(50);

    if (completedTasks.length === 0) return 0; // Default 0 minutes

    // Calculate average actual duration as response time
    const actualDurations = completedTasks
      .map(task => task.actualPerformance?.actualDuration)
      .filter(duration => duration !== undefined && duration > 0) as number[];

    if (actualDurations.length === 0) return 25;

    const avgDuration = actualDurations.reduce((sum, duration) => sum + duration, 0) / actualDurations.length;
    return Math.round(avgDuration);
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