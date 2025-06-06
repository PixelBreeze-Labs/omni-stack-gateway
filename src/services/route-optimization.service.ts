// src/services/route-optimization.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as mongoose from 'mongoose';
import { Business } from '../schemas/business.schema';
import { FieldTask, FieldTaskStatus } from '../schemas/field-task.schema';
import { AppClient } from '../schemas/app-client.schema';
import { Route, RouteStatus, OptimizationObjective } from '../schemas/route.schema';
import { RouteProgress, RouteStatus as ProgressRouteStatus } from '../schemas/route-progress.schema';
import { FieldTaskService } from './field-task.service';
import { WeatherService } from './weather.service';
import { WeatherRouteService } from './weather-route.service';
import { GoogleMapsService } from './google-maps.service';

interface OptimizeRoutesRequest {
  businessId: string;
  date: string;
  taskIds?: string[];
  teamIds?: string[];
  params?: {
    prioritizeTime?: boolean;
    prioritizeFuel?: boolean;
    considerWeather?: boolean;
    maxRouteTime?: number;
    maxTasksPerTeam?: number;
  };
}

interface RouteMetrics {
  estimatedTotalTime: number;
  estimatedDistance: number;
  estimatedFuelCost: number;
  optimizationScore: number;
  taskCount: number;
}

interface OptimizedRoute {
  routeId: string;
  teamId: string;
  teamName: string;
  tasks: Array<{
    taskId: string;
    name: string;
    location: { latitude: number; longitude: number; address: string };
    estimatedDuration: number;
    priority: string;
    customerInfo: {
      name: string;
      email?: string;
      phone?: string;
      type: string;
    };
  }>;
  metrics: RouteMetrics;
  route: Array<{
    taskId: string;
    arrivalTime: string;
    departureTime: string;
    travelTime: number;
    distance: number;
    weatherDelayMinutes?: number;
  }>;
  weatherWarnings?: string[];
  weatherImpact?: {
    riskLevel: string;
    safetyScore: number;
    suggestedDelays: number;
    equipmentRecommendations: string[];
  };
  status: RouteStatus;
  createdAt?: Date;
}

interface RouteStats {
  totalTasks: number;
  completedTasks: number;
  avgExecutionTime: number;
  totalDistance: number;
  fuelSavings: number;
  efficiency: number;
  teamsWithRoutes: number;
}

interface DebugInfo {
  timestamp: string;
  method: string;
  businessId: string;
  inputs: any;
  queryResults: any;
  errors?: string[];
  warnings?: string[];
  executionTime: number;
  routesPersisted?: any[];
  progressCreated?: any[];
}

@Injectable()
export class RouteOptimizationService {
  private readonly logger = new Logger(RouteOptimizationService.name);

  constructor(
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(FieldTask.name) private fieldTaskModel: Model<FieldTask>,
    @InjectModel(AppClient.name) private appClientModel: Model<AppClient>,
    @InjectModel(Route.name) private routeModel: Model<Route>,
    @InjectModel(RouteProgress.name) private routeProgressModel: Model<RouteProgress>,
    private readonly fieldTaskService: FieldTaskService,
    private readonly weatherService: WeatherService,
    private readonly weatherRouteService: WeatherRouteService,
    private readonly googleMapsService: GoogleMapsService,
  ) {}

  // ============================================================================
  // 🚀 COMPLETE ROUTE OPTIMIZATION WITH PERSISTENCE
  // ============================================================================

  /**
   * ✅ FIXED: Optimize routes AND persist them to database with RouteProgress
   */
  async optimizeRoutes(request: OptimizeRoutesRequest): Promise<{
    success: boolean;
    message: string;
    routes: OptimizedRoute[];
    debug: DebugInfo;
  }> {
    const startTime = Date.now();
    const debug: DebugInfo = {
      timestamp: new Date().toISOString(),
      method: 'optimizeRoutes',
      businessId: request.businessId,
      inputs: request,
      queryResults: {},
      errors: [],
      warnings: [],
      executionTime: 0,
      routesPersisted: [],
      progressCreated: []
    };

    try {
      const businessObjectId = this.convertToObjectId(request.businessId);
      debug.queryResults.businessObjectId = businessObjectId.toString();

      const business = await this.validateBusiness(request.businessId);
      debug.queryResults.businessName = business.name;

      // Get tasks for optimization
      let tasks: FieldTask[];
      if (request.taskIds && request.taskIds.length > 0) {
        const taskObjectIds = request.taskIds.map(id => this.convertToObjectId(id));
        tasks = await this.fieldTaskModel.find({
          _id: { $in: taskObjectIds },
          businessId: businessObjectId,
          isDeleted: false
        }).populate('appClientId');

        debug.queryResults.tasksFoundById = tasks.length;
      } else {
        tasks = await this.getTasksForRouting(request.businessId, request.date, request.teamIds);
        debug.queryResults.tasksFromDate = tasks.length;
      }

      debug.queryResults.finalTasksCount = tasks.length;

      if (tasks.length === 0) {
        debug.errors.push('No tasks found for optimization');
        throw new BadRequestException('No tasks found for optimization');
      }

      const availableTeams = this.getAvailableTeams(business, request.teamIds);
      debug.queryResults.availableTeams = availableTeams.length;

      if (availableTeams.length === 0) {
        debug.errors.push('No teams available for routing');
        throw new BadRequestException('No teams available for routing');
      }

      // Generate optimized routes (in memory)
      const optimizedRoutes = await this.generateRealOptimizedRoutes(
        tasks,
        availableTeams,
        request.params || {}
      );

      debug.queryResults.generatedRoutes = optimizedRoutes.length;

      // 🚀 NEW: PERSIST ROUTES TO DATABASE
      const persistedRoutes: OptimizedRoute[] = [];
      
      for (const route of optimizedRoutes) {
        // Create Route document
        const routeId = `route-${route.teamId}-${request.date}-${Date.now()}`;
        
        const routeStops = route.tasks.map((task, index) => {
          const routeStep = route.route[index];
          return {
            taskId: task.taskId,
            sequenceNumber: index + 1,
            estimatedArrivalTime: this.parseTimeToDate(routeStep.arrivalTime, request.date),
            estimatedDepartureTime: this.parseTimeToDate(routeStep.departureTime, request.date),
            distanceFromPrevious: routeStep.distance,
            travelTimeFromPrevious: routeStep.travelTime,
            serviceTime: task.estimatedDuration,
            status: 'pending' as const,
            location: {
              latitude: task.location.latitude,
              longitude: task.location.longitude,
              address: task.location.address
            }
          };
        });

        const routeDoc = new this.routeModel({
          routeId,
          businessId: businessObjectId,
          clientId: businessObjectId, // Using businessId as clientId for now
          teamId: route.teamId,
          date: new Date(request.date),
          status: RouteStatus.OPTIMIZED,
          optimizationScore: route.metrics.optimizationScore,
          estimatedTotalTime: route.metrics.estimatedTotalTime,
          estimatedDistance: route.metrics.estimatedDistance,
          estimatedFuelCost: route.metrics.estimatedFuelCost,
          routeStops,
          optimizationObjective: request.params?.prioritizeTime 
            ? OptimizationObjective.MINIMIZE_TIME 
            : request.params?.prioritizeFuel 
            ? OptimizationObjective.MINIMIZE_FUEL
            : OptimizationObjective.BALANCED,
          optimizationMetadata: {
            algorithmUsed: 'nearest_neighbor_with_priority',
            processingTime: (Date.now() - startTime) / 1000,
            iterations: 1,
            trafficConsidered: false,
            weatherConsidered: request.params?.considerWeather || false,
            skillMatchingApplied: true,
            constraints: {
              maxRouteTime: request.params?.maxRouteTime || 480,
              maxStops: request.params?.maxTasksPerTeam || 8,
              requiredBreaks: false,
              timeWindows: true
            },
            alternativeRoutesCount: 0
          },
          weatherConsiderations: [],
          createdBy: business.adminUserId
        });

        // Save Route
        const savedRoute = await routeDoc.save();
        
        debug.routesPersisted.push({
          routeId,
          teamId: route.teamId,
          teamName: route.teamName,
          taskCount: route.tasks.length,
          savedToDb: true
        });

        // Update FieldTasks with routeId
        const taskObjectIds = route.tasks.map(t => this.convertToObjectId(t.taskId));
        await this.fieldTaskModel.updateMany(
          { _id: { $in: taskObjectIds } },
          { 
            assignedRouteId: savedRoute._id,
            assignedTeamId: route.teamId,
            assignedAt: new Date(),
            status: FieldTaskStatus.ASSIGNED
          }
        );

        // 🚀 NEW: CREATE ROUTE PROGRESS TRACKING
        const routeProgress = new this.routeProgressModel({
          businessId: request.businessId,
          teamId: route.teamId,
          teamName: route.teamName,
          routeDate: new Date(request.date),
          tasks: route.tasks.map((task, index) => ({
            taskId: task.taskId,
            scheduledOrder: index + 1,
            estimatedStartTime: this.parseTimeToDate(route.route[index].arrivalTime, request.date),
            estimatedEndTime: this.parseTimeToDate(route.route[index].departureTime, request.date),
            status: 'pending' as const,
            location: {
              latitude: task.location.latitude,
              longitude: task.location.longitude,
              address: task.location.address
            },
            estimatedDuration: task.estimatedDuration
          })),
          routeStatus: ProgressRouteStatus.PENDING,
          currentTaskIndex: 0,
          completedTasksCount: 0,
          estimatedCompletionTime: this.parseTimeToDate(
            route.route[route.route.length - 1].departureTime, 
            request.date
          ),
          totalEstimatedDuration: route.metrics.estimatedTotalTime,
          totalDistanceKm: route.metrics.estimatedDistance,
          progressUpdates: [{
            timestamp: new Date(),
            location: { latitude: 0, longitude: 0 }, // Will be updated when route starts
            status: 'route_created',
            notes: 'Route optimized and assigned to team'
          }],
          createdBy: business.adminUserId
        });

        const savedProgress = await routeProgress.save();

        debug.progressCreated.push({
          progressId: savedProgress._id.toString(),
          teamId: route.teamId,
          taskCount: route.tasks.length
        });

        // Add to response
        persistedRoutes.push({
          ...route,
          routeId,
          status: RouteStatus.OPTIMIZED
        });
      }

      // Add weather warnings if requested
      if (request.params?.considerWeather) {
        await this.addWeatherWarnings(persistedRoutes, request.businessId);
      }

      debug.executionTime = Date.now() - startTime;

      return {
        success: true,
        message: `Generated and persisted ${persistedRoutes.length} optimized routes with progress tracking`,
        routes: persistedRoutes,
        debug
      };

    } catch (error) {
      debug.errors.push(`Error optimizing routes: ${error.message}`);
      debug.executionTime = Date.now() - startTime;
      this.logger.error(`Error optimizing routes: ${error.message}`, error.stack);
      
      return {
        success: false,
        message: error.message,
        routes: [],
        debug
      };
    }
  }

  /**
   * ✅ Get persisted routes from Route collection
   */
  async getOptimizedRoutes(
    businessId: string,
    date: string
  ): Promise<{
    success: boolean;
    date: string;
    routes: OptimizedRoute[];
    debug: DebugInfo;
  }> {
    const startTime = Date.now();
    const debug: DebugInfo = {
      timestamp: new Date().toISOString(),
      method: 'getOptimizedRoutes',
      businessId,
      inputs: { businessId, date },
      queryResults: {},
      errors: [],
      warnings: [],
      executionTime: 0
    };

    try {
      const businessObjectId = this.convertToObjectId(businessId);
      debug.queryResults.businessObjectId = businessObjectId.toString();

      const business = await this.validateBusiness(businessId);
      debug.queryResults.businessName = business.name;

      const { startOfDay, endOfDay } = this.createUTCDateRange(date);
      debug.queryResults.dateRange = {
        original: date,
        startOfDay: startOfDay.toISOString(),
        endOfDay: endOfDay.toISOString()
      };

      // Get Routes from Route collection
      const routes = await this.routeModel.find({
        businessId: businessObjectId,
        date: { $gte: startOfDay, $lte: endOfDay },
        isDeleted: false
      }).sort({ createdAt: -1 });

      debug.queryResults.persistedRoutesFound = routes.length;
      debug.queryResults.routeDetails = routes.map(r => ({
        routeId: r.routeId,
        teamId: r.teamId,
        status: r.status,
        taskCount: r.routeStops.length
      }));

      const optimizedRoutes: OptimizedRoute[] = [];

      for (const route of routes) {
        const team = business.teams?.find((t: any) => t.id === route.teamId);
        if (!team) {
          debug.warnings.push(`Team not found: ${route.teamId}`);
          continue;
        }

        // Get task details for this route
        const taskIds = route.routeStops.map(stop => this.convertToObjectId(stop.taskId));
        const tasks = await this.fieldTaskModel.find({
          _id: { $in: taskIds },
          isDeleted: false
        }).populate('appClientId');

        const taskMap = new Map(tasks.map(t => [t._id.toString(), t]));

        optimizedRoutes.push({
          routeId: route.routeId,
          teamId: route.teamId,
          teamName: team.name,
          tasks: route.routeStops.map(stop => {
            const task = taskMap.get(stop.taskId);
            return {
              taskId: stop.taskId,
              name: task?.name || 'Unknown Task',
              location: {
                latitude: stop.location.latitude,
                longitude: stop.location.longitude,
                address: stop.location.address
              },
              estimatedDuration: stop.serviceTime,
              priority: task?.priority || 'medium',
              customerInfo: this.extractCustomerInfo(task)
            };
          }),
          metrics: {
            estimatedTotalTime: route.estimatedTotalTime,
            estimatedDistance: route.estimatedDistance,
            estimatedFuelCost: route.estimatedFuelCost,
            optimizationScore: route.optimizationScore,
            taskCount: route.routeStops.length
          },
          route: route.routeStops.map(stop => ({
            taskId: stop.taskId,
            arrivalTime: this.formatTimeFromDate(stop.estimatedArrivalTime),
            departureTime: this.formatTimeFromDate(stop.estimatedDepartureTime),
            travelTime: stop.travelTimeFromPrevious,
            distance: stop.distanceFromPrevious
          })),
          status: route.status
        });
      }

      debug.queryResults.finalRoutes = optimizedRoutes.length;
      debug.executionTime = Date.now() - startTime;

      return {
        success: true,
        date,
        routes: optimizedRoutes,
        debug
      };

    } catch (error) {
      debug.errors.push(`Error getting optimized routes: ${error.message}`);
      debug.executionTime = Date.now() - startTime;
      this.logger.error(`Error getting optimized routes: ${error.message}`, error.stack);
      
      return {
        success: false,
        date,
        routes: [],
        debug
      };
    }
  }

  /**
 * ✅ FIXED: Update route progress and ensure FieldTask status is properly updated
 */
async updateRouteProgress(
    businessId: string,
    teamId: string,
    taskId: string,
    status: 'started' | 'completed' | 'paused' | 'arrived',
    currentLocation?: { latitude: number; longitude: number }
  ): Promise<{
    success: boolean;
    message: string;
    debug: DebugInfo;
  }> {
    const startTime = Date.now();
    const debug: DebugInfo = {
      timestamp: new Date().toISOString(),
      method: 'updateRouteProgress',
      businessId,
      inputs: { businessId, teamId, taskId, status, currentLocation },
      queryResults: {},
      errors: [],
      warnings: [],
      executionTime: 0
    };
  
    try {
      const businessObjectId = this.convertToObjectId(businessId);
      const taskObjectId = this.convertToObjectId(taskId);
  
      debug.queryResults.businessObjectId = businessObjectId.toString();
      debug.queryResults.taskObjectId = taskObjectId.toString();
  
      const business = await this.validateBusiness(businessId);
  
      // 🚀 FIXED: Find task using flexible team ID matching
      // First try to find the task with the exact teamId provided
      let task = await this.fieldTaskModel.findOne({
        _id: taskObjectId,
        businessId: businessObjectId,
        assignedTeamId: teamId,
        isDeleted: false
      });
  
      // If not found, try to find by different team ID formats
      if (!task) {
        // Get team info to check for different ID formats
        const team = business.teams?.find((t: any) => 
          t.id === teamId || t.metadata?.phpId === teamId
        );
        
        if (team) {
          // Try all possible team ID formats
          const possibleTeamIds = [
            team.id,
            team.metadata?.phpId,
            team._id?.toString()
          ].filter(Boolean);
  
          task = await this.fieldTaskModel.findOne({
            _id: taskObjectId,
            businessId: businessObjectId,
            assignedTeamId: { $in: possibleTeamIds },
            isDeleted: false
          });
  
          debug.queryResults.searchedTeamIds = possibleTeamIds;
        }
      }
  
      if (!task) {
        debug.errors.push('Task not found or not assigned to this team');
        throw new NotFoundException('Task not found or not assigned to this team');
      }
  
      debug.queryResults.taskFound = true;
      debug.queryResults.currentTaskStatus = task.status;
      debug.queryResults.taskAssignedTeamId = task.assignedTeamId;
  
      // 🚀 FIXED: Properly update task status with more robust logic
      const originalStatus = task.status;
      
      if (status === 'started') {
        task.status = FieldTaskStatus.IN_PROGRESS;
        if (!task.actualPerformance) {
          task.actualPerformance = {
            startTime: new Date(),
            delays: []
          };
        } else if (!task.actualPerformance.startTime) {
          task.actualPerformance.startTime = new Date();
        }
        debug.queryResults.taskAction = 'started';
        
      } else if (status === 'completed') {
        // 🚀 CRITICAL FIX: Ensure status is properly set to COMPLETED
        task.status = FieldTaskStatus.COMPLETED;
        task.completedAt = new Date();
        
        // Ensure actualPerformance exists and update it
        if (!task.actualPerformance) {
          task.actualPerformance = {
            startTime: new Date(Date.now() - 60 * 60 * 1000), // Default 1 hour ago
            delays: []
          };
        }
        
        task.actualPerformance.endTime = new Date();
        
        // Calculate actual duration
        if (task.actualPerformance.startTime) {
          task.actualPerformance.actualDuration = Math.round(
            (new Date().getTime() - task.actualPerformance.startTime.getTime()) / (1000 * 60)
          );
        } else {
          // Fallback if no start time
          task.actualPerformance.actualDuration = task.estimatedDuration || 60;
        }
        
        debug.queryResults.taskAction = 'completed';
        debug.queryResults.actualDuration = task.actualPerformance.actualDuration;
        
      } else if (status === 'arrived') {
        // Don't change status for 'arrived' - just log arrival
        debug.queryResults.taskAction = 'arrived';
      }
  
      // 🚀 CRITICAL: Save the task with explicit validation
      try {
        const savedTask = await task.save();
        debug.queryResults.taskSaved = true;
        debug.queryResults.newTaskStatus = savedTask.status;
        debug.queryResults.taskCompletedAt = savedTask.completedAt;
        
        // Verify the save worked
        const verifyTask = await this.fieldTaskModel.findById(taskObjectId);
        debug.queryResults.verificationStatus = verifyTask?.status;
        debug.queryResults.statusChangeSuccessful = (verifyTask?.status === task.status);
        
      } catch (saveError) {
        debug.errors.push(`Failed to save task: ${saveError.message}`);
        throw new Error(`Failed to update task status: ${saveError.message}`);
      }
  
      // Get location for progress updates
      let locationToUse = currentLocation;
      
      if (!locationToUse) {
        const team = business.teams?.find((t: any) => 
          t.id === teamId || t.metadata?.phpId === teamId
        );
        
        if (team?.currentLocation) {
          locationToUse = {
            latitude: team.currentLocation.lat || team.currentLocation.latitude,
            longitude: team.currentLocation.lng || team.currentLocation.longitude
          };
          debug.queryResults.locationSource = 'team_current_location';
        } else if (task.location) {
          locationToUse = {
            latitude: task.location.latitude,
            longitude: task.location.longitude
          };
          debug.queryResults.locationSource = 'task_location';
        } else {
          locationToUse = { latitude: 0, longitude: 0 };
          debug.warnings.push('No location data available, using default coordinates');
          debug.queryResults.locationSource = 'default_fallback';
        }
      } else {
        debug.queryResults.locationSource = 'provided_parameter';
      }
  
      debug.queryResults.locationUsed = locationToUse;
  
      // 🚀 UPDATE ROUTE PROGRESS with flexible team ID matching
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Try to find route progress with different team ID formats
      const team = business.teams?.find((t: any) => 
        t.id === teamId || t.metadata?.phpId === teamId
      );
      
      const possibleTeamIds = team ? [
        team.id,
        team.metadata?.phpId,
        teamId
      ].filter(Boolean) : [teamId];
  
      let routeProgress = await this.routeProgressModel.findOne({
        businessId,
        teamId: { $in: possibleTeamIds },
        routeDate: { 
          $gte: today, 
          $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) 
        },
        isDeleted: false
      });
  
      debug.queryResults.routeProgressFound = !!routeProgress;
      debug.queryResults.searchedRouteProgressTeamIds = possibleTeamIds;
  
      if (routeProgress) {
        // Find and update the specific task
        const taskIndex = routeProgress.tasks.findIndex(t => 
          t.taskId === taskId || t.taskId === taskObjectId.toString()
        );
        
        debug.queryResults.taskIndexInRoute = taskIndex;
        
        if (taskIndex !== -1) {
          const routeTask = routeProgress.tasks[taskIndex];
          const originalRouteTaskStatus = routeTask.status;
          
          if (status === 'started') {
            routeTask.status = 'in_progress';
            routeTask.actualStartTime = new Date();
            routeProgress.routeStatus = ProgressRouteStatus.IN_PROGRESS;
            routeProgress.currentTaskIndex = taskIndex;
            if (!routeProgress.routeStartTime) {
              routeProgress.routeStartTime = new Date();
            }
            
          } else if (status === 'completed') {
            // 🚀 CRITICAL FIX: Ensure route task status is set to completed
            routeTask.status = 'completed';
            routeTask.actualEndTime = new Date();
            
            if (routeTask.actualStartTime) {
              routeTask.actualDuration = Math.round(
                (new Date().getTime() - routeTask.actualStartTime.getTime()) / (1000 * 60)
              );
            } else {
              routeTask.actualDuration = routeTask.estimatedDuration || 60;
            }
            
            // 🚀 CRITICAL: Recalculate completed count accurately
            const completedTasksCount = routeProgress.tasks.filter(t => t.status === 'completed').length;
            routeProgress.completedTasksCount = completedTasksCount;
            
            debug.queryResults.routeTaskAction = 'completed';
            debug.queryResults.newCompletedCount = completedTasksCount;
            debug.queryResults.totalRouteTasks = routeProgress.tasks.length;
            
            // Check if route is complete
            if (completedTasksCount === routeProgress.tasks.length) {
              routeProgress.routeStatus = ProgressRouteStatus.COMPLETED;
              routeProgress.routeEndTime = new Date();
              if (routeProgress.routeStartTime) {
                routeProgress.totalActualDuration = Math.round(
                  (new Date().getTime() - routeProgress.routeStartTime.getTime()) / (1000 * 60)
                );
              }
              debug.queryResults.routeCompleted = true;
            }
            
          } else if (status === 'arrived') {
            routeTask.status = 'pending'; // Ready to start
          }
  
          // Add progress update with actual location
          routeProgress.progressUpdates.push({
            timestamp: new Date(),
            location: locationToUse,
            status: `task_${status}`,
            notes: `Task ${taskId} ${status} by team ${teamId} at ${locationToUse.latitude}, ${locationToUse.longitude}`
          });
  
          // 🚀 CRITICAL: Save route progress with error handling
          try {
            const savedRouteProgress = await routeProgress.save();
            debug.queryResults.routeProgressSaved = true;
            debug.queryResults.routeProgressUpdated = {
              progressId: savedRouteProgress._id.toString(),
              taskIndex,
              originalRouteTaskStatus,
              newRouteTaskStatus: routeTask.status,
              routeStatus: savedRouteProgress.routeStatus,
              completedCount: savedRouteProgress.completedTasksCount
            };
          } catch (routeProgressSaveError) {
            debug.errors.push(`Failed to save route progress: ${routeProgressSaveError.message}`);
            // Don't throw - route progress update failure shouldn't stop task update
          }
        } else {
          debug.warnings.push(`Task ${taskId} not found in route progress tasks`);
          debug.queryResults.routeTaskIds = routeProgress.tasks.map(t => t.taskId);
        }
      } else {
        debug.warnings.push('No route progress found for this team/date');
      }
  
      // 🚀 UPDATE ROUTE STATUS in Route collection
      if (task.assignedRouteId) {
        try {
          const route = await this.routeModel.findById(task.assignedRouteId);
          if (route) {
            // Update route stop status
            const stopIndex = route.routeStops.findIndex(stop => 
              stop.taskId === taskId || stop.taskId === taskObjectId.toString()
            );
            
            if (stopIndex !== -1) {
              const stop = route.routeStops[stopIndex];
              const originalStopStatus = stop.status;
              
              if (status === 'started') {
                stop.status = 'in_service';
                stop.actualArrivalTime = new Date();
                if (route.status === RouteStatus.ASSIGNED) {
                  route.status = RouteStatus.IN_PROGRESS;
                  route.startedAt = new Date();
                }
              } else if (status === 'completed') {
                stop.status = 'completed';
                stop.actualDepartureTime = new Date();
                
                // Check if all stops are completed
                const allCompleted = route.routeStops.every(s => s.status === 'completed');
                if (allCompleted) {
                  route.status = RouteStatus.COMPLETED;
                  route.completedAt = new Date();
                }
              }
  
              await route.save();
  
              debug.queryResults.routeUpdated = {
                routeId: route.routeId,
                stopIndex,
                originalStopStatus,
                newStopStatus: stop.status,
                routeStatus: route.status
              };
            } else {
              debug.warnings.push(`Task ${taskId} not found in route stops`);
            }
          }
        } catch (routeUpdateError) {
          debug.errors.push(`Failed to update route: ${routeUpdateError.message}`);
          // Don't throw - route update failure shouldn't stop task update
        }
      }
  
      debug.queryResults.originalTaskStatus = originalStatus;
      debug.queryResults.finalTaskStatus = task.status;
      debug.executionTime = Date.now() - startTime;
      
      return {
        success: true,
        message: `Task ${status} successfully - status updated from ${originalStatus} to ${task.status}`,
        debug
      };
  
    } catch (error) {
      debug.errors.push(`Error updating route progress: ${error.message}`);
      debug.executionTime = Date.now() - startTime;
      this.logger.error(`Error updating route progress: ${error.message}`, error.stack);
      
      return {
        success: false,
        message: error.message,
        debug
      };
    }
  }

  /**
   * ✅ Get route progress for a team/date
   */
  async getRouteProgress(
    businessId: string,
    teamId: string,
    date: string
  ): Promise<{
    success: boolean;
    progress: any;
    debug: DebugInfo;
  }> {
    const startTime = Date.now();
    const debug: DebugInfo = {
      timestamp: new Date().toISOString(),
      method: 'getRouteProgress',
      businessId,
      inputs: { businessId, teamId, date },
      queryResults: {},
      errors: [],
      warnings: [],
      executionTime: 0
    };

    try {
      const { startOfDay, endOfDay } = this.createUTCDateRange(date);

      const routeProgress = await this.routeProgressModel.findOne({
        businessId,
        teamId,
        routeDate: { $gte: startOfDay, $lte: endOfDay },
        isDeleted: false
      });

      debug.queryResults.progressFound = !!routeProgress;

      if (!routeProgress) {
        debug.warnings.push('No route progress found for this team/date');
        return {
          success: true,
          progress: null,
          debug
        };
      }

      debug.queryResults.progressDetails = {
        routeStatus: routeProgress.routeStatus,
        currentTaskIndex: routeProgress.currentTaskIndex,
        completedTasksCount: routeProgress.completedTasksCount,
        totalTasks: routeProgress.tasks.length
      };

      debug.executionTime = Date.now() - startTime;

      return {
        success: true,
        progress: {
          progressId: routeProgress._id.toString(),
          teamId: routeProgress.teamId,
          teamName: routeProgress.teamName,
          routeDate: routeProgress.routeDate,
          routeStatus: routeProgress.routeStatus,
          currentTaskIndex: routeProgress.currentTaskIndex,
          completedTasksCount: routeProgress.completedTasksCount,
          totalTasks: routeProgress.tasks.length,
          estimatedCompletionTime: routeProgress.estimatedCompletionTime,
          actualCompletionTime: routeProgress.routeEndTime,
          efficiency: routeProgress.performance?.efficiency,
          tasks: routeProgress.tasks.map(task => ({
            taskId: task.taskId,
            status: task.status,
            scheduledOrder: task.scheduledOrder,
            estimatedStartTime: task.estimatedStartTime,
            actualStartTime: task.actualStartTime,
            estimatedDuration: task.estimatedDuration,
            actualDuration: task.actualDuration,
            location: task.location
          })),
          progressUpdates: routeProgress.progressUpdates
        },
        debug
      };

    } catch (error) {
      debug.errors.push(`Error getting route progress: ${error.message}`);
      debug.executionTime = Date.now() - startTime;
      this.logger.error(`Error getting route progress: ${error.message}`, error.stack);
      
      return {
        success: false,
        progress: null,
        debug
      };
    }
  }

  /**
   * ✅ Assign persisted route to team (update Route status)
   */
  async assignRouteToTeam(
    businessId: string,
    teamId: string,
    routeId: string
  ): Promise<{
    success: boolean;
    message: string;
    debug: DebugInfo;
  }> {
    const startTime = Date.now();
    const debug: DebugInfo = {
      timestamp: new Date().toISOString(),
      method: 'assignRouteToTeam',
      businessId,
      inputs: { businessId, teamId, routeId },
      queryResults: {},
      errors: [],
      warnings: [],
      executionTime: 0
    };

    try {
      const businessObjectId = this.convertToObjectId(businessId);
      const business = await this.validateBusiness(businessId);

      // Validate team exists
      const team = business.teams?.find((t: any) => t.id === teamId);
      if (!team) {
        debug.errors.push(`Team not found: ${teamId}`);
        throw new NotFoundException('Team not found');
      }

      // Find and update Route
      const route = await this.routeModel.findOne({
        routeId,
        businessId: businessObjectId,
        isDeleted: false
      });

      if (!route) {
        debug.errors.push(`Route not found: ${routeId}`);
        throw new NotFoundException('Route not found');
      }

      debug.queryResults.routeFound = true;
      debug.queryResults.currentStatus = route.status;

      // Update route status to assigned
      route.status = RouteStatus.ASSIGNED;
      route.assignedAt = new Date();
      route.assignedBy = business.adminUserId;

      await route.save();

      // Update RouteProgress status
      const routeProgress = await this.routeProgressModel.findOne({
        businessId,
        teamId,
        routeDate: route.date,
        isDeleted: false
      });

      if (routeProgress) {
        routeProgress.routeStatus = ProgressRouteStatus.PENDING;
        routeProgress.progressUpdates.push({
          timestamp: new Date(),
          location: { latitude: 0, longitude: 0 },
          status: 'route_assigned',
          notes: `Route ${routeId} assigned to team ${team.name}`
        });
        await routeProgress.save();

        debug.queryResults.progressUpdated = true;
      }

      debug.queryResults.newStatus = route.status;
      debug.executionTime = Date.now() - startTime;

      return {
        success: true,
        message: `Route ${routeId} assigned to ${team.name} successfully`,
        debug
      };

    } catch (error) {
      debug.errors.push(`Error assigning route: ${error.message}`);
      debug.executionTime = Date.now() - startTime;
      this.logger.error(`Error assigning route: ${error.message}`, error.stack);
      
      return {
        success: false,
        message: error.message,
        debug
      };
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private convertToObjectId(id: string): mongoose.Types.ObjectId {
    try {
      return new mongoose.Types.ObjectId(id);
    } catch (error) {
      throw new BadRequestException(`Invalid ObjectId format: ${id}`);
    }
  }

  private createUTCDateRange(date: string): { startOfDay: Date; endOfDay: Date } {
    const startOfDay = new Date(date + 'T00:00:00.000Z');
    const endOfDay = new Date(date + 'T23:59:59.999Z');
    return { startOfDay, endOfDay };
  }

  private parseTimeToDate(timeString: string, dateString: string): Date {
    return new Date(`${dateString}T${timeString}:00.000Z`);
  }

  private formatTimeFromDate(date: Date): string {
    return date.toTimeString().substring(0, 5); // HH:MM format
  }

  private async validateBusiness(businessId: string): Promise<any> {
    const businessObjectId = this.convertToObjectId(businessId);
    const business = await this.businessModel.findById(businessObjectId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    return business;
  }

  private getAvailableTeams(business: any, teamIds?: string[]): any[] {
    let teams = business.teams || [];
    
    if (teamIds && teamIds.length > 0) {
      teams = teams.filter((t: any) => teamIds.includes(t.id));
    }

    return teams.filter((t: any) => t.isActive && t.isAvailableForRouting);
  }

  private async getTasksForRouting(
    businessId: string,
    date: string,
    teamIds?: string[]
  ): Promise<FieldTask[]> {
    const businessObjectId = this.convertToObjectId(businessId);
    const { startOfDay, endOfDay } = this.createUTCDateRange(date);
    
    const query: any = {
      businessId: businessObjectId,
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      isDeleted: false,
      status: { $in: [FieldTaskStatus.PENDING] } // Only pending tasks for optimization
    };

    return await this.fieldTaskModel.find(query).populate('appClientId');
  }

  private async generateRealOptimizedRoutes(
    tasks: FieldTask[],
    teams: any[],
    params: any
  ): Promise<any[]> {
    const routes: any[] = [];
    const maxTasksPerTeam = params.maxTasksPerTeam || 8;

    // Sort tasks by priority
    const sortedTasks = [...tasks].sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1, urgent: 4, emergency: 5 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    // Distribute tasks among teams
    let taskIndex = 0;
    for (const team of teams) {
      const teamTasks: FieldTask[] = [];
      const maxTasks = Math.min(maxTasksPerTeam, team.maxDailyTasks || maxTasksPerTeam);

      // Assign tasks to this team
      while (teamTasks.length < maxTasks && taskIndex < sortedTasks.length) {
        teamTasks.push(sortedTasks[taskIndex]);
        taskIndex++;
      }

      if (teamTasks.length > 0) {
        const optimizedTasks = this.optimizeTaskOrder(teamTasks, team);
        const metrics = await this.calculateRouteMetricsForTasks(optimizedTasks, team);
        
        routes.push({
          teamId: team.id,
          teamName: team.name,
          tasks: optimizedTasks.map(task => ({
            taskId: task._id.toString(),
            name: task.name,
            location: {
              latitude: task.location.latitude,
              longitude: task.location.longitude,
              address: task.location.address
            },
            estimatedDuration: task.estimatedDuration,
            priority: task.priority,
            customerInfo: this.extractCustomerInfo(task)
          })),
          metrics,
          route: this.generateRouteSequence(optimizedTasks)
        });
      }
    }

    return routes;
  }

  private optimizeTaskOrder(tasks: FieldTask[], team: any): FieldTask[] {
    if (tasks.length <= 1) return tasks;

    let currentLocation = team.currentLocation || {
      lat: tasks[0].location.latitude,
      lng: tasks[0].location.longitude
    };

    const optimizedOrder: FieldTask[] = [];
    const remainingTasks = [...tasks];

    while (remainingTasks.length > 0) {
      let nearestIndex = 0;
      let shortestDistance = this.calculateDistance(
        currentLocation,
        { lat: remainingTasks[0].location.latitude, lng: remainingTasks[0].location.longitude }
      );

      for (let i = 1; i < remainingTasks.length; i++) {
        const distance = this.calculateDistance(
          currentLocation,
          { lat: remainingTasks[i].location.latitude, lng: remainingTasks[i].location.longitude }
        );
        if (distance < shortestDistance) {
          shortestDistance = distance;
          nearestIndex = i;
        }
      }

      const nearestTask = remainingTasks.splice(nearestIndex, 1)[0];
      optimizedOrder.push(nearestTask);
      currentLocation = {
        lat: nearestTask.location.latitude,
        lng: nearestTask.location.longitude
      };
    }

    return optimizedOrder;
  }

  private calculateDistance(point1: { lat: number; lng: number }, point2: { lat: number; lng: number }): number {
    const R = 6371;
    const dLat = this.toRadians(point2.lat - point1.lat);
    const dLng = this.toRadians(point2.lng - point1.lng);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(point1.lat)) * Math.cos(this.toRadians(point2.lat)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private async calculateRouteMetricsForTasks(tasks: FieldTask[], team?: any): Promise<RouteMetrics> {
    const totalDuration = tasks.reduce((sum, task) => sum + task.estimatedDuration, 0);
    const coordinates = tasks.map(task => ({
      lat: task.location.latitude,
      lng: task.location.longitude
    }));
  
    const { totalDistance, totalTravelTime } = this.calculateRealDistances(coordinates);
    const estimatedTotalTime = totalDuration + totalTravelTime;
    const estimatedFuelCost = this.calculateFuelCost(totalDistance, team);
    const optimizationScore = this.calculateOptimizationScore(tasks, totalDistance, estimatedTotalTime);
  
    return {
      estimatedTotalTime,
      estimatedDistance: totalDistance,
      estimatedFuelCost,
      optimizationScore,
      taskCount: tasks.length
    };
  }

  private calculateRealDistances(coordinates: Array<{ lat: number; lng: number }>): { totalDistance: number; totalTravelTime: number } {
    if (coordinates.length <= 1) {
      return { totalDistance: 0, totalTravelTime: 0 };
    }

    let totalDistance = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
      totalDistance += this.calculateDistance(coordinates[i], coordinates[i + 1]);
    }

    const totalTravelTime = Math.round((totalDistance / 50) * 60); // minutes
    return { totalDistance, totalTravelTime };
  }

  private calculateFuelCost(distance: number, team?: any): number {
    if (!team?.vehicleInfo) {
      // Fallback to default values if no team vehicle info
      const defaultConsumption = 8; // L/100km
      const defaultPrice = 1.5; // per liter
      return (distance / 100) * defaultConsumption * defaultPrice;
    }
  
    const vehicleInfo = team.vehicleInfo;
    const fuelType = vehicleInfo.fuelType || 'gasoline';
    const consumption = vehicleInfo.avgFuelConsumption || 8;
  
    let fuelCost = 0;
  
    switch (fuelType) {
      case 'electric':
        // For electric vehicles, use kWh consumption and price per kWh
        const pricePerKwh = vehicleInfo.fuelPricePerKwh || 0.12; // Default $0.12/kWh
        const kwhPer100km = consumption; // Assume consumption is in kWh/100km for electric
        fuelCost = (distance / 100) * kwhPer100km * pricePerKwh;
        break;
        
      case 'gasoline':
      case 'diesel':
      case 'hybrid':
      default:
        // For fuel-based vehicles, use liters and price per liter
        const pricePerLiter = vehicleInfo.fuelPricePerLiter || 1.5; // Default $1.50/L
        const litersPer100km = consumption; // L/100km
        fuelCost = (distance / 100) * litersPer100km * pricePerLiter;
        break;
    }
  
    return Math.round(fuelCost * 100) / 100; // Round to 2 decimal places
  }

  private calculateOptimizationScore(tasks: FieldTask[], totalDistance: number, totalTime: number): number {
    const taskCount = tasks.length;
    const avgDistancePerTask = taskCount > 1 ? totalDistance / (taskCount - 1) : 0;
    const avgTimePerTask = totalTime / taskCount;

    let score = 100;
    score -= Math.min(30, avgDistancePerTask * 2);
    score -= Math.min(20, (avgTimePerTask - 45) / 5);

    return Math.max(60, Math.round(score));
  }

  private generateRouteSequence(tasks: FieldTask[]): Array<any> {
    const sequence = [];
    let currentTime = 8 * 60; // Start at 8:00 AM

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const travelTime = i === 0 ? 0 : 15;
      
      currentTime += travelTime;
      const arrivalTime = this.minutesToTimeString(currentTime);
      currentTime += task.estimatedDuration;
      const departureTime = this.minutesToTimeString(currentTime);

      sequence.push({
        taskId: task._id.toString(),
        arrivalTime,
        departureTime,
        travelTime,
        distance: i === 0 ? 0 : 5
      });
    }

    return sequence;
  }

  private minutesToTimeString(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  private extractCustomerInfo(task: any): { name: string; email?: string; phone?: string; type: string } {
    if (task?.appClientId && typeof task.appClientId === 'object') {
      const client = task.appClientId;
      return {
        name: client.name || 'Unknown Customer',
        email: client.email,
        phone: client.phone,
        type: client.type || 'individual'
      };
    }
    
    return {
      name: 'Unknown Customer',
      type: 'individual'
    };
  }

  /**
   * ✅ FIXED: Add weather warnings using WeatherRouteService
   */
  private async addWeatherWarnings(routes: OptimizedRoute[], businessId: string): Promise<void> {
    try {
      this.logger.log(`Adding weather warnings for ${routes.length} routes in business ${businessId}`);

      for (const route of routes) {
        if (route.tasks.length === 0) continue;

        try {
          // Extract coordinates from route tasks
          const coordinates = route.tasks.map(task => ({
            lat: task.location.latitude,
            lng: task.location.longitude
          }));

          // Calculate center coordinates for weather impact analysis
          const centerCoords = this.calculateCenterCoordinates(coordinates);

          // Get weather impact using your WeatherRouteService
          const weatherImpact = await this.weatherRouteService.getWeatherImpact(
            businessId,
            centerCoords
          );

          // Add weather warnings to route
          route.weatherWarnings = [];
          route.weatherImpact = {
            riskLevel: weatherImpact.riskLevel,
            safetyScore: weatherImpact.safetyScore,
            suggestedDelays: weatherImpact.routeAdjustments.suggestedDelays,
            equipmentRecommendations: weatherImpact.routeAdjustments.equipmentRecommendations
          };

          // Generate weather warnings based on impact
          if (weatherImpact.riskLevel === 'high' || weatherImpact.riskLevel === 'extreme') {
            route.weatherWarnings.push(`${weatherImpact.riskLevel.toUpperCase()} RISK: Weather conditions may significantly impact this route`);
          }

          if (weatherImpact.routeAdjustments.suggestedDelays > 0) {
            route.weatherWarnings.push(`Suggested delay: ${weatherImpact.routeAdjustments.suggestedDelays} minutes due to weather conditions`);
          }

          // Add specific warnings based on impact factors
          Object.entries(weatherImpact.impactFactors).forEach(([factor, impact]) => {
            if (impact.level === 'high' || impact.level === 'medium') {
              route.weatherWarnings.push(`${factor.toUpperCase()}: ${impact.impact}`);
            }
          });

          // Add weather delay to route sequence if applicable
          if (weatherImpact.routeAdjustments.suggestedDelays > 0) {
            route.route.forEach(routeStep => {
              routeStep.weatherDelayMinutes = Math.round(weatherImpact.routeAdjustments.suggestedDelays / route.route.length);
            });
          }

          this.logger.log(`Added weather impact for route ${route.routeId}: Risk level ${weatherImpact.riskLevel}, Safety score ${weatherImpact.safetyScore}`);

        } catch (weatherError) {
          this.logger.warn(`Could not get weather impact for route ${route.routeId}: ${weatherError.message}`);
          
          // Add fallback warning
          route.weatherWarnings = ['Weather data unavailable - monitor conditions manually'];
          route.weatherImpact = {
            riskLevel: 'unknown',
            safetyScore: 50,
            suggestedDelays: 0,
            equipmentRecommendations: ['Monitor weather conditions', 'Follow standard safety protocols']
          };
        }
      }

      // Get general weather alerts for the business
      try {
        const weatherAlerts = await this.weatherRouteService.getWeatherAlerts(businessId);
        
        // Add general alerts to routes that might be affected
        weatherAlerts.forEach(alert => {
          if (alert.severity === 'high' || alert.severity === 'critical') {
            routes.forEach(route => {
              // Check if route is in affected areas
              const routeAddresses = route.tasks.map(t => t.location.address.toLowerCase());
              const hasAffectedArea = alert.affectedAreas.some(area => 
                routeAddresses.some(address => address.includes(area.toLowerCase()))
              );

              if (hasAffectedArea || alert.affectedAreas.length === 0) {
                if (!route.weatherWarnings) route.weatherWarnings = [];
                route.weatherWarnings.push(`${alert.severity.toUpperCase()} ALERT: ${alert.title} - ${alert.message}`);
              }
            });
          }
        });

        this.logger.log(`Processed ${weatherAlerts.length} weather alerts for routes`);

      } catch (alertError) {
        this.logger.warn(`Could not get weather alerts: ${alertError.message}`);
      }

    } catch (error) {
      this.logger.error(`Error adding weather warnings: ${error.message}`, error.stack);
      // Don't throw - weather warnings are optional
    }
  }

  /**
   * ✅ Get route statistics for business
   */
  async getRouteStats(
    businessId: string,
    date: string
  ): Promise<{
    success: boolean;
    stats: RouteStats;
    debug: DebugInfo;
  }> {
    const startTime = Date.now();
    const debug: DebugInfo = {
      timestamp: new Date().toISOString(),
      method: 'getRouteStats',
      businessId,
      inputs: { businessId, date },
      queryResults: {},
      errors: [],
      warnings: [],
      executionTime: 0
    };

    try {
      const businessObjectId = this.convertToObjectId(businessId);
      const { startOfDay, endOfDay } = this.createUTCDateRange(date);

      // Get all routes for the date
      const routes = await this.routeModel.find({
        businessId: businessObjectId,
        date: { $gte: startOfDay, $lte: endOfDay },
        isDeleted: false
      });

      // Get all tasks for the date
      const tasks = await this.fieldTaskModel.find({
        businessId: businessObjectId,
        scheduledDate: { $gte: startOfDay, $lte: endOfDay },
        isDeleted: false
      });

      // Calculate statistics
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(task => task.status === FieldTaskStatus.COMPLETED).length;
      const totalDistance = routes.reduce((sum, route) => sum + (route.actualDistance || route.estimatedDistance || 0), 0);
      const totalTime = routes.reduce((sum, route) => sum + (route.actualTotalTime || route.estimatedTotalTime || 0), 0);
      const avgExecutionTime = routes.length > 0 ? totalTime / routes.length : 0;
      const teamsWithRoutes = new Set(routes.map(r => r.teamId)).size;

      // Calculate efficiency (simplified)
      const estimatedTime = routes.reduce((sum, route) => sum + route.estimatedTotalTime, 0);
      const actualTime = routes.reduce((sum, route) => sum + (route.actualTotalTime || route.estimatedTotalTime), 0);
      const efficiency = estimatedTime > 0 ? Math.round((estimatedTime / actualTime) * 100) : 100;

      // Calculate fuel savings (placeholder)
      const estimatedFuel = routes.reduce((sum, route) => sum + route.estimatedFuelCost, 0);
      const actualFuel = routes.reduce((sum, route) => sum + (route.actualFuelCost || route.estimatedFuelCost), 0);
      const fuelSavings = Math.max(0, estimatedFuel - actualFuel);

      const stats: RouteStats = {
        totalTasks,
        completedTasks,
        avgExecutionTime,
        totalDistance,
        fuelSavings,
        efficiency,
        teamsWithRoutes
      };

      debug.queryResults = {
        routesCount: routes.length,
        tasksCount: tasks.length,
        stats
      };
      debug.executionTime = Date.now() - startTime;

      return { success: true, stats, debug };

    } catch (error) {
      debug.errors.push(`Error getting route stats: ${error.message}`);
      debug.executionTime = Date.now() - startTime;
      this.logger.error(`Error getting route stats: ${error.message}`, error.stack);
      
      return {
        success: false,
        stats: {
          totalTasks: 0,
          completedTasks: 0,
          avgExecutionTime: 0,
          totalDistance: 0,
          fuelSavings: 0,
          efficiency: 0,
          teamsWithRoutes: 0
        },
        debug
      };
    }
  }

  /**
   * ✅ Calculate route metrics for specific tasks
   */
  async calculateRouteMetrics(
    businessId: string,
    taskIds: string[],
    teamId?: string
  ): Promise<{
    success: boolean;
    metrics: RouteMetrics;
    debug: DebugInfo;
  }> {
    const startTime = Date.now();
    const debug: DebugInfo = {
      timestamp: new Date().toISOString(),
      method: 'calculateRouteMetrics',
      businessId,
      inputs: { businessId, taskIds, teamId },
      queryResults: {},
      errors: [],
      warnings: [],
      executionTime: 0
    };

    try {
      const businessObjectId = this.convertToObjectId(businessId);
      const business = await this.validateBusiness(businessId);

      const taskObjectIds = taskIds.map(id => this.convertToObjectId(id));

      // Get team if teamId provided
    let team = null;
    if (teamId) {
      team = business.teams?.find((t: any) => t.id === teamId);
      debug.queryResults.teamFound = !!team;
    }

      // Get tasks
      const tasks = await this.fieldTaskModel.find({
        _id: { $in: taskObjectIds },
        businessId: businessObjectId,
        isDeleted: false
      });

      debug.queryResults.tasksFound = tasks.length;

      if (tasks.length === 0) {
        throw new NotFoundException('No tasks found for metrics calculation');
      }

      const metrics = await this.calculateRouteMetricsForTasks(tasks, team);
      debug.queryResults.metrics = metrics;
      debug.executionTime = Date.now() - startTime;

      return { success: true, metrics, debug };

    } catch (error) {
      debug.errors.push(`Error calculating route metrics: ${error.message}`);
      debug.executionTime = Date.now() - startTime;
      this.logger.error(`Error calculating route metrics: ${error.message}`, error.stack);
      
      return {
        success: false,
        metrics: {
          estimatedTotalTime: 0,
          estimatedDistance: 0,
          estimatedFuelCost: 0,
          optimizationScore: 0,
          taskCount: 0
        },
        debug
      };
    }
  }

  /**
   * ✅ Re-optimize existing route
   */
  async reoptimizeRoute(
    businessId: string,
    routeId: string,
    params?: any
  ): Promise<{
    success: boolean;
    route: OptimizedRoute;
    debug: DebugInfo;
  }> {
    const startTime = Date.now();
    const debug: DebugInfo = {
      timestamp: new Date().toISOString(),
      method: 'reoptimizeRoute',
      businessId,
      inputs: { businessId, routeId, params },
      queryResults: {},
      errors: [],
      warnings: [],
      executionTime: 0
    };

    try {
      const businessObjectId = this.convertToObjectId(businessId);
      const business = await this.validateBusiness(businessId);

      // Find existing route
      const existingRoute = await this.routeModel.findOne({
        routeId,
        businessId: businessObjectId,
        isDeleted: false
      });

      if (!existingRoute) {
        throw new NotFoundException('Route not found');
      }

      debug.queryResults.existingRouteFound = true;

      // Get tasks from existing route
      const taskIds = existingRoute.routeStops.map(stop => this.convertToObjectId(stop.taskId));
      const tasks = await this.fieldTaskModel.find({
        _id: { $in: taskIds },
        isDeleted: false
      });

      debug.queryResults.tasksInRoute = tasks.length;

      // Get team info
      const team = business.teams?.find((t: any) => t.id === existingRoute.teamId);
      if (!team) {
        throw new NotFoundException('Team not found for route');
      }

      // Re-optimize tasks
      const optimizedTasks = this.optimizeTaskOrder(tasks, team);
      const metrics = await this.calculateRouteMetricsForTasks(optimizedTasks, team);
      const routeSequence = this.generateRouteSequence(optimizedTasks);

      // Update existing route
      existingRoute.routeStops = optimizedTasks.map((task, index) => ({
        taskId: task._id.toString(),
        sequenceNumber: index + 1,
        estimatedArrivalTime: this.parseTimeToDate(routeSequence[index].arrivalTime, existingRoute.date.toISOString().split('T')[0]),
        estimatedDepartureTime: this.parseTimeToDate(routeSequence[index].departureTime, existingRoute.date.toISOString().split('T')[0]),
        distanceFromPrevious: routeSequence[index].distance,
        travelTimeFromPrevious: routeSequence[index].travelTime,
        serviceTime: task.estimatedDuration,
        status: 'pending' as const,
        location: {
          latitude: task.location.latitude,
          longitude: task.location.longitude,
          address: task.location.address
        }
      }));

      existingRoute.optimizationScore = metrics.optimizationScore;
      existingRoute.estimatedTotalTime = metrics.estimatedTotalTime;
      existingRoute.estimatedDistance = metrics.estimatedDistance;
      existingRoute.estimatedFuelCost = metrics.estimatedFuelCost;

      await existingRoute.save();

      const optimizedRoute: OptimizedRoute = {
        routeId: existingRoute.routeId,
        teamId: existingRoute.teamId,
        teamName: team.name,
        tasks: optimizedTasks.map(task => ({
          taskId: task._id.toString(),
          name: task.name,
          location: {
            latitude: task.location.latitude,
            longitude: task.location.longitude,
            address: task.location.address
          },
          estimatedDuration: task.estimatedDuration,
          priority: task.priority,
          customerInfo: this.extractCustomerInfo(task)
        })),
        metrics,
        route: routeSequence,
        status: existingRoute.status
      };

      debug.queryResults.reoptimizedRoute = {
        routeId: optimizedRoute.routeId,
        newOptimizationScore: metrics.optimizationScore,
        taskCount: optimizedRoute.tasks.length
      };
      debug.executionTime = Date.now() - startTime;

      return { success: true, route: optimizedRoute, debug };

    } catch (error) {
      debug.errors.push(`Error re-optimizing route: ${error.message}`);
      debug.executionTime = Date.now() - startTime;
      this.logger.error(`Error re-optimizing route: ${error.message}`, error.stack);
      
      return {
        success: false,
        route: null as any,
        debug
      };
    }
  }

  /**
   * ✅ Validate route constraints
   */
  async validateRouteConstraints(
    businessId: string,
    routeData: {
      taskIds: string[];
      teamId: string;
      maxTime?: number;
      maxDistance?: number;
    }
  ): Promise<{
    success: boolean;
    valid: boolean;
    violations: string[];
    debug: DebugInfo;
  }> {
    const startTime = Date.now();
    const debug: DebugInfo = {
      timestamp: new Date().toISOString(),
      method: 'validateRouteConstraints',
      businessId,
      inputs: { businessId, routeData },
      queryResults: {},
      errors: [],
      warnings: [],
      executionTime: 0
    };

    try {
      const businessObjectId = this.convertToObjectId(businessId);
      const business = await this.validateBusiness(businessId);
      
      const violations: string[] = [];

      // Validate team exists
      const team = business.teams?.find((t: any) => t.id === routeData.teamId);
      if (!team) {
        violations.push('Team not found');
      }

      debug.queryResults.teamFound = !!team;

      // Get tasks
      const taskObjectIds = routeData.taskIds.map(id => this.convertToObjectId(id));
      const tasks = await this.fieldTaskModel.find({
        _id: { $in: taskObjectIds },
        businessId: businessObjectId,
        isDeleted: false
      });

      debug.queryResults.tasksFound = tasks.length;
      debug.queryResults.tasksRequested = routeData.taskIds.length;

      if (tasks.length !== routeData.taskIds.length) {
        violations.push(`${routeData.taskIds.length - tasks.length} tasks not found`);
      }

      // Calculate metrics for validation
      const metrics = await this.calculateRouteMetricsForTasks(tasks, team);

      // Validate time constraints
      const maxTime = routeData.maxTime || team?.maxRouteTime || 480; // 8 hours default
      if (metrics.estimatedTotalTime > maxTime) {
        violations.push(`Route exceeds maximum time: ${metrics.estimatedTotalTime} > ${maxTime} minutes`);
      }

      // Validate distance constraints
      const maxDistance = routeData.maxDistance || team?.maxRouteDistance || 200; // 200km default
      if (metrics.estimatedDistance > maxDistance) {
        violations.push(`Route exceeds maximum distance: ${metrics.estimatedDistance} > ${maxDistance} km`);
      }

      // Validate task count
      const maxTasks = team?.maxDailyTasks || 8;
      if (tasks.length > maxTasks) {
        violations.push(`Too many tasks for team: ${tasks.length} > ${maxTasks}`);
      }

      // Validate skills and equipment
      if (team) {
        const teamSkills = team.skills || [];
        const teamEquipment = team.equipment || [];

        tasks.forEach((task, index) => {
          const missingSkills = task.skillsRequired.filter(skill => !teamSkills.includes(skill));
          if (missingSkills.length > 0) {
            violations.push(`Task ${index + 1} requires skills not available in team: ${missingSkills.join(', ')}`);
          }

          const missingEquipment = task.equipmentRequired.filter(eq => !teamEquipment.includes(eq));
          if (missingEquipment.length > 0) {
            violations.push(`Task ${index + 1} requires equipment not available in team: ${missingEquipment.join(', ')}`);
          }
        });
      }

      const valid = violations.length === 0;

      debug.queryResults = {
        ...debug.queryResults,
        metrics,
        violationCount: violations.length,
        valid
      };
      debug.executionTime = Date.now() - startTime;

      return { success: true, valid, violations, debug };

    } catch (error) {
      debug.errors.push(`Error validating route constraints: ${error.message}`);
      debug.executionTime = Date.now() - startTime;
      this.logger.error(`Error validating route constraints: ${error.message}`, error.stack);
      
      return {
        success: false,
        valid: false,
        violations: [`Validation error: ${error.message}`],
        debug
      };
    }
  }

  /**
   * Helper method to calculate center coordinates
   */
  private calculateCenterCoordinates(coordinates: Array<{ lat: number; lng: number }>): { lat: number; lng: number } {
    if (coordinates.length === 0) {
      return { lat: 0, lng: 0 };
    }

    if (coordinates.length === 1) {
      return coordinates[0];
    }

    const sumLat = coordinates.reduce((sum, coord) => sum + coord.lat, 0);
    const sumLng = coordinates.reduce((sum, coord) => sum + coord.lng, 0);
    
    return {
      lat: sumLat / coordinates.length,
      lng: sumLng / coordinates.length
    };
  }
}