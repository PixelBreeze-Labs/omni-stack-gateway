// src/services/route-optimization.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as mongoose from 'mongoose';
import { Business } from '../schemas/business.schema';
import { FieldTask, FieldTaskStatus } from '../schemas/field-task.schema';
import { AppClient } from '../schemas/app-client.schema';
import { FieldTaskService } from './field-task.service';
import { WeatherService } from './weather.service';
import { GoogleMapsService } from './google-maps.service';

interface OptimizeRoutesRequest {
  businessId: string;
  date: string;
  taskIds?: string[]; // Optional - if not provided, will get all tasks for date
  teamIds?: string[]; // Optional - if not provided, will use all available teams
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
  }>;
  weatherWarnings?: string[];
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

interface RouteValidation {
  isValid: boolean;
  violations: Array<{
    type: 'time_window' | 'skill_mismatch' | 'capacity' | 'distance' | 'equipment';
    message: string;
    severity: 'warning' | 'error';
  }>;
  recommendations: string[];
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
}

@Injectable()
export class RouteOptimizationService {
  private readonly logger = new Logger(RouteOptimizationService.name);

  constructor(
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(FieldTask.name) private fieldTaskModel: Model<FieldTask>,
    @InjectModel(AppClient.name) private appClientModel: Model<AppClient>,
    private readonly fieldTaskService: FieldTaskService,
    private readonly weatherService: WeatherService,
    private readonly googleMapsService: GoogleMapsService,
  ) {}

  // ============================================================================
  // IMPROVED ROUTE OPTIMIZATION WITH DEBUG INFO
  // ============================================================================

  /**
   * Optimize routes using real field tasks and teams - IMPROVED VERSION
   */
  async optimizeRoutes(request: OptimizeRoutesRequest): Promise<OptimizedRoute[]> {
    const startTime = Date.now();
    const debug: DebugInfo = {
      timestamp: new Date().toISOString(),
      method: 'optimizeRoutes',
      businessId: request.businessId,
      inputs: request,
      queryResults: {},
      errors: [],
      warnings: [],
      executionTime: 0
    };

    try {
      // ✅ Convert businessId to ObjectId properly
      const businessObjectId = this.convertToObjectId(request.businessId);
      debug.queryResults.businessObjectId = businessObjectId.toString();

      // Validate business
      const business = await this.validateBusinessImproved(businessObjectId, debug);
      
      this.logger.log(`Starting route optimization for business ${request.businessId} on ${request.date}`);

      // Get real tasks for the date
      let tasks: FieldTask[];
      if (request.taskIds && request.taskIds.length > 0) {
        // ✅ Convert task IDs to ObjectIds
        const taskObjectIds = request.taskIds.map(id => this.convertToObjectId(id));
        debug.queryResults.taskObjectIds = taskObjectIds.map(id => id.toString());

        tasks = await this.fieldTaskModel.find({
          _id: { $in: taskObjectIds },
          businessId: businessObjectId, // ✅ Use ObjectId
          isDeleted: false
        }).populate('appClientId');

        debug.queryResults.tasksFoundById = tasks.length;
        debug.queryResults.tasksExpected = request.taskIds.length;

        if (tasks.length !== request.taskIds.length) {
          const foundIds = tasks.map(t => t._id.toString());
          const missingIds = request.taskIds.filter(id => !foundIds.includes(id));
          debug.warnings.push(`Some tasks not found: ${missingIds.join(', ')}`);
        }
      } else {
        // Get all tasks for the date
        tasks = await this.getTasksForRoutingImproved(
          businessObjectId,
          request.date,
          request.teamIds,
          debug
        );
      }

      debug.queryResults.finalTasksCount = tasks.length;

      if (tasks.length === 0) {
        debug.errors.push('No tasks found for optimization');
        throw new BadRequestException('No tasks found for optimization');
      }

      // Get available teams
      const availableTeams = this.getAvailableTeams(business, request.teamIds);
      debug.queryResults.availableTeams = availableTeams.length;
      debug.queryResults.teamNames = availableTeams.map(t => t.name);

      if (availableTeams.length === 0) {
        debug.errors.push('No teams available for routing');
        throw new BadRequestException('No teams available for routing');
      }

      this.logger.log(`Optimizing ${tasks.length} tasks across ${availableTeams.length} teams`);

      // Generate optimized routes
      const optimizedRoutes = await this.generateRealOptimizedRoutes(
        tasks,
        availableTeams,
        request.params || {},
        debug
      );

      // Add weather warnings if requested
      if (request.params?.considerWeather) {
        await this.addWeatherWarnings(optimizedRoutes, request.businessId);
      }

      debug.queryResults.generatedRoutes = optimizedRoutes.length;
      debug.executionTime = Date.now() - startTime;

      this.logger.log(`Generated ${optimizedRoutes.length} optimized routes`);
      this.logger.log(`DEBUG INFO: ${JSON.stringify(debug, null, 2)}`);

      return optimizedRoutes;

    } catch (error) {
      debug.errors.push(`Error optimizing routes: ${error.message}`);
      debug.executionTime = Date.now() - startTime;
      this.logger.error(`Error optimizing routes: ${error.message}`, error.stack);
      this.logger.error(`DEBUG INFO: ${JSON.stringify(debug, null, 2)}`);
      throw error;
    }
  }

  /**
   * Re-optimize existing route with optional additional tasks - IMPROVED VERSION
   */
  async reoptimizeRoute(
    businessId: string,
    teamId: string,
    additionalTaskIds?: string[]
  ): Promise<OptimizedRoute> {
    const startTime = Date.now();
    const debug: DebugInfo = {
      timestamp: new Date().toISOString(),
      method: 'reoptimizeRoute',
      businessId,
      inputs: { businessId, teamId, additionalTaskIds },
      queryResults: {},
      errors: [],
      warnings: [],
      executionTime: 0
    };

    try {
      // ✅ Convert businessId to ObjectId
      const businessObjectId = this.convertToObjectId(businessId);
      debug.queryResults.businessObjectId = businessObjectId.toString();

      const business = await this.validateBusinessImproved(businessObjectId, debug);

      // Get current tasks assigned to this team
      const currentTasks = await this.fieldTaskModel.find({
        businessId: businessObjectId, // ✅ Use ObjectId
        assignedTeamId: teamId,
        status: { $in: [FieldTaskStatus.ASSIGNED, FieldTaskStatus.IN_PROGRESS] },
        isDeleted: false
      }).populate('appClientId');

      debug.queryResults.currentTasks = currentTasks.length;

      // Get additional tasks if provided
      let additionalTasks: FieldTask[] = [];
      if (additionalTaskIds && additionalTaskIds.length > 0) {
        // ✅ Convert additional task IDs to ObjectIds
        const additionalTaskObjectIds = additionalTaskIds.map(id => this.convertToObjectId(id));
        debug.queryResults.additionalTaskObjectIds = additionalTaskObjectIds.map(id => id.toString());

        additionalTasks = await this.fieldTaskModel.find({
          _id: { $in: additionalTaskObjectIds },
          businessId: businessObjectId, // ✅ Use ObjectId
          isDeleted: false,
          assignedTeamId: { $exists: false } // Only unassigned tasks
        }).populate('appClientId');

        debug.queryResults.additionalTasks = additionalTasks.length;
      }

      const allTasks = [...currentTasks, ...additionalTasks];
      debug.queryResults.totalTasks = allTasks.length;
      
      if (allTasks.length === 0) {
        debug.errors.push('No tasks found for re-optimization');
        throw new BadRequestException('No tasks found for re-optimization');
      }

      // Get the specific team
      const team = business.teams?.find((t: any) => t.id === teamId);
      if (!team) {
        debug.errors.push(`Team not found: ${teamId}`);
        throw new NotFoundException('Team not found');
      }

      debug.queryResults.teamFound = true;
      debug.queryResults.teamName = team.name;

      // Re-optimize the tasks for this team
      const optimizedTasks = this.optimizeTaskOrder(allTasks, team);
      const metrics = await this.calculateRouteMetricsForTasks(optimizedTasks);

      const reoptimizedRoute: OptimizedRoute = {
        teamId,
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
      };

      // Update task assignments for additional tasks
      if (additionalTasks.length > 0) {
        const additionalTaskObjectIds = additionalTaskIds.map(id => this.convertToObjectId(id));
        const updateResult = await this.fieldTaskModel.updateMany(
          { _id: { $in: additionalTaskObjectIds } },
          { 
            assignedTeamId: teamId,
            assignedAt: new Date(),
            status: FieldTaskStatus.ASSIGNED
          }
        );

        debug.queryResults.additionalTasksUpdateResult = {
          acknowledged: updateResult.acknowledged,
          matchedCount: updateResult.matchedCount,
          modifiedCount: updateResult.modifiedCount
        };
      }

      debug.executionTime = Date.now() - startTime;
      this.logger.log(`Re-optimized route for team ${teamId} with ${allTasks.length} tasks`);
      this.logger.log(`DEBUG INFO: ${JSON.stringify(debug, null, 2)}`);

      return reoptimizedRoute;

    } catch (error) {
      debug.errors.push(`Error re-optimizing route: ${error.message}`);
      debug.executionTime = Date.now() - startTime;
      this.logger.error(`Error re-optimizing route: ${error.message}`, error.stack);
      this.logger.error(`DEBUG INFO: ${JSON.stringify(debug, null, 2)}`);
      throw error;
    }
  }

  /**
   * Validate route constraints - IMPROVED VERSION
   */
  async validateRouteConstraints(
    businessId: string,
    teamId: string,
    taskIds: string[]
  ): Promise<RouteValidation> {
    const startTime = Date.now();
    const debug: DebugInfo = {
      timestamp: new Date().toISOString(),
      method: 'validateRouteConstraints',
      businessId,
      inputs: { businessId, teamId, taskIds },
      queryResults: {},
      errors: [],
      warnings: [],
      executionTime: 0
    };

    try {
      // ✅ Convert businessId to ObjectId
      const businessObjectId = this.convertToObjectId(businessId);
      debug.queryResults.businessObjectId = businessObjectId.toString();

      const business = await this.validateBusinessImproved(businessObjectId, debug);
      
      const team = business.teams?.find((t: any) => t.id === teamId);
      if (!team) {
        debug.errors.push(`Team not found: ${teamId}`);
        throw new NotFoundException('Team not found');
      }

      debug.queryResults.teamFound = true;
      debug.queryResults.teamName = team.name;

      // ✅ Convert task IDs to ObjectIds
      const taskObjectIds = taskIds.map(id => this.convertToObjectId(id));
      debug.queryResults.taskObjectIds = taskObjectIds.map(id => id.toString());

      const tasks = await this.fieldTaskModel.find({
        _id: { $in: taskObjectIds },
        businessId: businessObjectId, // ✅ Use ObjectId
        isDeleted: false
      });

      debug.queryResults.tasksFound = tasks.length;
      debug.queryResults.tasksExpected = taskIds.length;

      if (tasks.length !== taskIds.length) {
        const foundIds = tasks.map(t => t._id.toString());
        const missingIds = taskIds.filter(id => !foundIds.includes(id));
        debug.errors.push(`Some tasks not found: ${missingIds.join(', ')}`);
        throw new BadRequestException('Some tasks not found');
      }

      const violations: RouteValidation['violations'] = [];
      const recommendations: string[] = [];

      // Check team capacity
      if (tasks.length > team.maxDailyTasks) {
        violations.push({
          type: 'capacity',
          message: `Team can handle max ${team.maxDailyTasks} tasks, but ${tasks.length} assigned`,
          severity: 'error'
        });
      }

      // Check skill requirements
      const teamSkills = team.skills || [];
      for (const task of tasks) {
        const missingSkills = (task.skillsRequired || []).filter(skill => !teamSkills.includes(skill));
        if (missingSkills.length > 0) {
          violations.push({
            type: 'skill_mismatch',
            message: `Task "${task.name}" requires skills: ${missingSkills.join(', ')}`,
            severity: 'error'
          });
        }
      }

      // Check equipment requirements
      const teamEquipment = team.equipment || [];
      for (const task of tasks) {
        const missingEquipment = (task.equipmentRequired || []).filter(eq => !teamEquipment.includes(eq));
        if (missingEquipment.length > 0) {
          violations.push({
            type: 'equipment',
            message: `Task "${task.name}" requires equipment: ${missingEquipment.join(', ')}`,
            severity: 'error'
          });
        }
      }

      // Check total route distance
      const coordinates = tasks.map(task => ({
        lat: task.location.latitude,
        lng: task.location.longitude
      }));
      const { totalDistance } = this.calculateRealDistances(coordinates);
      
      if (totalDistance > team.maxRouteDistance) {
        violations.push({
          type: 'distance',
          message: `Route distance (${Math.round(totalDistance)}km) exceeds team limit (${team.maxRouteDistance}km)`,
          severity: 'warning'
        });
      }

      // Check time windows
      const totalDuration = tasks.reduce((sum, task) => sum + task.estimatedDuration, 0);
      const workingHours = team.workingHours;
      const maxWorkingMinutes = this.calculateWorkingMinutes(workingHours.start, workingHours.end);
      
      if (totalDuration > maxWorkingMinutes) {
        violations.push({
          type: 'time_window',
          message: `Estimated work time (${Math.round(totalDuration/60)}h) exceeds working hours`,
          severity: 'warning'
        });
      }

      // Generate recommendations
      if (violations.length === 0) {
        recommendations.push('Route assignment looks good!');
      } else {
        if (violations.some(v => v.type === 'skill_mismatch')) {
          recommendations.push('Consider training team members or reassigning tasks requiring specific skills');
        }
        if (violations.some(v => v.type === 'capacity')) {
          recommendations.push('Split tasks across multiple teams or days');
        }
        if (violations.some(v => v.type === 'distance')) {
          recommendations.push('Consider regional task assignments to reduce travel distance');
        }
      }

      debug.queryResults.validationResults = {
        violations: violations.length,
        recommendations: recommendations.length
      };

      debug.executionTime = Date.now() - startTime;
      this.logger.log(`DEBUG INFO: ${JSON.stringify(debug, null, 2)}`);

      return {
        isValid: violations.filter(v => v.severity === 'error').length === 0,
        violations,
        recommendations
      };

    } catch (error) {
      debug.errors.push(`Error validating route constraints: ${error.message}`);
      debug.executionTime = Date.now() - startTime;
      this.logger.error(`Error validating route constraints: ${error.message}`, error.stack);
      this.logger.error(`DEBUG INFO: ${JSON.stringify(debug, null, 2)}`);
      throw error;
    }
  }

  /**
   * Calculate real route metrics using actual task data - IMPROVED VERSION
   */
  async calculateRouteMetrics(
    businessId: string,
    taskIds: string[],
    teamId: string
  ): Promise<RouteMetrics> {
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
      // ✅ Convert businessId to ObjectId
      const businessObjectId = this.convertToObjectId(businessId);
      debug.queryResults.businessObjectId = businessObjectId.toString();

      await this.validateBusinessImproved(businessObjectId, debug);

      // ✅ Convert task IDs to ObjectIds
      const taskObjectIds = taskIds.map(id => this.convertToObjectId(id));
      debug.queryResults.taskObjectIds = taskObjectIds.map(id => id.toString());

      // Get real tasks
      const tasks = await this.fieldTaskModel.find({
        _id: { $in: taskObjectIds },
        businessId: businessObjectId, // ✅ Use ObjectId
        isDeleted: false
      });

      debug.queryResults.tasksFound = tasks.length;
      debug.queryResults.tasksExpected = taskIds.length;

      if (tasks.length === 0) {
        debug.errors.push('No valid tasks found');
        throw new BadRequestException('No valid tasks found');
      }

      // Calculate real metrics
      const totalDuration = tasks.reduce((sum, task) => sum + task.estimatedDuration, 0);
      const coordinates = tasks.map(task => ({
        lat: task.location.latitude,
        lng: task.location.longitude
      }));

      // Calculate distances between tasks
      const { totalDistance, totalTravelTime } = this.calculateRealDistances(coordinates);
      
      const estimatedTotalTime = totalDuration + totalTravelTime;
      const estimatedFuelCost = this.calculateFuelCost(totalDistance);
      const optimizationScore = this.calculateOptimizationScore(tasks, totalDistance, estimatedTotalTime);

      debug.queryResults.metricsCalculated = {
        totalDuration,
        totalDistance,
        totalTravelTime,
        estimatedTotalTime,
        estimatedFuelCost,
        optimizationScore
      };

      debug.executionTime = Date.now() - startTime;
      this.logger.log(`DEBUG INFO: ${JSON.stringify(debug, null, 2)}`);

      return {
        estimatedTotalTime,
        estimatedDistance: totalDistance,
        estimatedFuelCost,
        optimizationScore,
        taskCount: tasks.length
      };

    } catch (error) {
      debug.errors.push(`Error calculating route metrics: ${error.message}`);
      debug.executionTime = Date.now() - startTime;
      this.logger.error(`Error calculating route metrics: ${error.message}`, error.stack);
      this.logger.error(`DEBUG INFO: ${JSON.stringify(debug, null, 2)}`);
      throw error;
    }
  }

  /**
   * Assign real optimized route to a team - IMPROVED VERSION
   */
  async assignRouteToTeam(
    businessId: string,
    teamId: string,
    taskIds: string[]
  ): Promise<{ success: boolean; message: string }> {
    const startTime = Date.now();
    const debug: DebugInfo = {
      timestamp: new Date().toISOString(),
      method: 'assignRouteToTeam',
      businessId,
      inputs: { businessId, teamId, taskIds },
      queryResults: {},
      errors: [],
      warnings: [],
      executionTime: 0
    };

    try {
      // ✅ Convert all IDs to proper types
      const businessObjectId = this.convertToObjectId(businessId);
      const taskObjectIds = taskIds.map(id => this.convertToObjectId(id));
      
      debug.queryResults.businessObjectId = businessObjectId.toString();
      debug.queryResults.taskObjectIds = taskObjectIds.map(id => id.toString());
      debug.queryResults.teamId = teamId;

      const business = await this.validateBusinessImproved(businessObjectId, debug);

      // Validate team exists
      const team = business.teams?.find((t: any) => t.id === teamId);
      if (!team) {
        debug.errors.push(`Team not found: ${teamId}`);
        throw new NotFoundException('Team not found');
      }
      debug.queryResults.teamFound = true;
      debug.queryResults.teamName = team.name;

      // ✅ Find tasks using ObjectIds
      const tasks = await this.fieldTaskModel.find({
        _id: { $in: taskObjectIds },
        businessId: businessObjectId, // ✅ Use ObjectId
        isDeleted: false
      });

      debug.queryResults.tasksFound = tasks.length;
      debug.queryResults.tasksExpected = taskIds.length;
      debug.queryResults.foundTaskIds = tasks.map(t => t._id.toString());

      if (tasks.length !== taskIds.length) {
        const foundIds = tasks.map(t => t._id.toString());
        const missingIds = taskIds.filter(id => !foundIds.includes(id));
        debug.errors.push(`Some tasks not found: ${missingIds.join(', ')}`);
        throw new BadRequestException(`Some tasks not found: ${missingIds.join(', ')}`);
      }

      // Check which tasks are already assigned
      const alreadyAssigned = tasks.filter(t => t.assignedTeamId);
      if (alreadyAssigned.length > 0) {
        debug.warnings.push(`${alreadyAssigned.length} tasks already assigned`);
        debug.queryResults.alreadyAssignedTasks = alreadyAssigned.map(t => ({
          taskId: t._id.toString(),
          assignedTo: t.assignedTeamId
        }));
      }

      // ✅ Update all tasks to be assigned to this team using ObjectIds
      const updateResult = await this.fieldTaskModel.updateMany(
        { _id: { $in: taskObjectIds } },
        { 
          assignedTeamId: teamId,
          assignedAt: new Date(),
          status: FieldTaskStatus.ASSIGNED
        }
      );

      debug.queryResults.updateResult = {
        acknowledged: updateResult.acknowledged,
        matchedCount: updateResult.matchedCount,
        modifiedCount: updateResult.modifiedCount
      };

      // Verify assignment worked
      const verifyTasks = await this.fieldTaskModel.find({
        _id: { $in: taskObjectIds },
        assignedTeamId: teamId
      });

      debug.queryResults.verificationResults = {
        tasksNowAssigned: verifyTasks.length,
        assignedTaskIds: verifyTasks.map(t => t._id.toString())
      };

      debug.executionTime = Date.now() - startTime;

      this.logger.log(`Assigned ${tasks.length} tasks to team ${teamId} for business ${businessId}`);
      this.logger.log(`DEBUG INFO: ${JSON.stringify(debug, null, 2)}`);

      return {
        success: true,
        message: `Route with ${tasks.length} tasks assigned to ${team.name} successfully`
      };

    } catch (error) {
      debug.errors.push(`Error assigning route: ${error.message}`);
      debug.executionTime = Date.now() - startTime;
      this.logger.error(`Error assigning route: ${error.message}`, error.stack);
      this.logger.error(`DEBUG INFO: ${JSON.stringify(debug, null, 2)}`);
      throw error;
    }
  }

  /**
   * Update route progress using real task data - IMPROVED VERSION
   */
  async updateRouteProgress(
    businessId: string,
    teamId: string,
    taskId: string,
    status: 'started' | 'completed'
  ): Promise<{ success: boolean; message: string }> {
    const startTime = Date.now();
    const debug: DebugInfo = {
      timestamp: new Date().toISOString(),
      method: 'updateRouteProgress',
      businessId,
      inputs: { businessId, teamId, taskId, status },
      queryResults: {},
      errors: [],
      warnings: [],
      executionTime: 0
    };

    try {
      // ✅ Convert IDs to proper types
      const businessObjectId = this.convertToObjectId(businessId);
      const taskObjectId = this.convertToObjectId(taskId);

      debug.queryResults.businessObjectId = businessObjectId.toString();
      debug.queryResults.taskObjectId = taskObjectId.toString();
      debug.queryResults.teamId = teamId;

      await this.validateBusinessImproved(businessObjectId, debug);

      const task = await this.fieldTaskModel.findOne({
        _id: taskObjectId,
        businessId: businessObjectId, // ✅ Use ObjectId
        assignedTeamId: teamId,
        isDeleted: false
      });

      if (!task) {
        debug.errors.push('Task not found or not assigned to this team');
        throw new NotFoundException('Task not found or not assigned to this team');
      }

      debug.queryResults.taskFound = true;
      debug.queryResults.currentStatus = task.status;

      // Update task status and performance data
      if (status === 'started') {
        task.status = FieldTaskStatus.IN_PROGRESS;
        task.actualPerformance = {
          startTime: new Date(),
          delays: []
        };
      } else if (status === 'completed') {
        task.status = FieldTaskStatus.COMPLETED;
        task.completedAt = new Date();
        
        if (task.actualPerformance?.startTime) {
          task.actualPerformance.endTime = new Date();
          task.actualPerformance.actualDuration = Math.round(
            (new Date().getTime() - task.actualPerformance.startTime.getTime()) / (1000 * 60)
          );
        }
      }

      await task.save();

      debug.queryResults.newStatus = task.status;
      debug.executionTime = Date.now() - startTime;
      
      this.logger.log(`Updated route progress: Team ${teamId}, Task ${taskId} - ${status}`);
      this.logger.log(`DEBUG INFO: ${JSON.stringify(debug, null, 2)}`);

      return {
        success: true,
        message: `Task ${status} successfully`
      };

    } catch (error) {
      debug.errors.push(`Error updating route progress: ${error.message}`);
      debug.executionTime = Date.now() - startTime;
      this.logger.error(`Error updating route progress: ${error.message}`, error.stack);
      this.logger.error(`DEBUG INFO: ${JSON.stringify(debug, null, 2)}`);
      throw error;
    }
  }

  /**
   * Get real optimized routes for a date - IMPROVED VERSION
   */
  async getOptimizedRoutes(
    businessId: string,
    date: string
  ): Promise<OptimizedRoute[]> {
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
      // ✅ Convert businessId to ObjectId
      const businessObjectId = this.convertToObjectId(businessId);
      debug.queryResults.businessObjectId = businessObjectId.toString();

      const business = await this.validateBusinessImproved(businessObjectId, debug);

      // ✅ Handle dates properly in UTC
      const { startOfDay, endOfDay } = this.createUTCDateRange(date);
      debug.queryResults.dateRange = {
        original: date,
        startOfDay: startOfDay.toISOString(),
        endOfDay: endOfDay.toISOString()
      };

      // Get all tasks for the date that are assigned
      const tasks = await this.fieldTaskModel.find({
        businessId: businessObjectId, // ✅ Use ObjectId
        scheduledDate: { $gte: startOfDay, $lte: endOfDay },
        assignedTeamId: { $exists: true, $ne: null },
        isDeleted: false
      }).populate('appClientId');

      debug.queryResults.assignedTasksFound = tasks.length;
      debug.queryResults.assignedTaskDetails = tasks.map(t => ({
        taskId: t._id.toString(),
        assignedTeamId: t.assignedTeamId,
        status: t.status,
        scheduledDate: t.scheduledDate
      }));

      // Group tasks by team
      const tasksByTeam = new Map();
      tasks.forEach(task => {
        const teamId = task.assignedTeamId;
        if (!tasksByTeam.has(teamId)) {
          tasksByTeam.set(teamId, []);
        }
        tasksByTeam.get(teamId).push(task);
      });

      debug.queryResults.teamsWithTasks = Array.from(tasksByTeam.keys());
      debug.queryResults.taskDistribution = {};
      tasksByTeam.forEach((teamTasks, teamId) => {
        debug.queryResults.taskDistribution[teamId] = teamTasks.length;
      });

      // Build optimized routes response
      const routes: OptimizedRoute[] = [];

      for (const [teamId, teamTasks] of tasksByTeam) {
        const team = business.teams?.find((t: any) => t.id === teamId);
        if (!team) {
          debug.warnings.push(`Team not found: ${teamId}`);
          continue;
        }

        const taskIds = teamTasks.map(t => t._id.toString());
        const metrics = await this.calculateRouteMetricsForTasks(teamTasks);
        
        routes.push({
          teamId,
          teamName: team.name,
          tasks: teamTasks.map(task => ({
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
          route: this.generateRouteSequence(teamTasks)
        });
      }

      debug.queryResults.finalRoutes = routes.length;
      debug.executionTime = Date.now() - startTime;
      this.logger.log(`DEBUG INFO: ${JSON.stringify(debug, null, 2)}`);

      return routes;

    } catch (error) {
      debug.errors.push(`Error getting optimized routes: ${error.message}`);
      debug.executionTime = Date.now() - startTime;
      this.logger.error(`Error getting optimized routes: ${error.message}`, error.stack);
      this.logger.error(`DEBUG INFO: ${JSON.stringify(debug, null, 2)}`);
      throw error;
    }
  }

  /**
   * Get real route statistics using actual data - IMPROVED VERSION
   */
  async getRouteStats(businessId: string, date: string): Promise<RouteStats> {
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
      // ✅ Convert businessId to ObjectId
      const businessObjectId = this.convertToObjectId(businessId);
      debug.queryResults.businessObjectId = businessObjectId.toString();

      await this.validateBusinessImproved(businessObjectId, debug);

      // ✅ Handle dates properly in UTC
      const { startOfDay, endOfDay } = this.createUTCDateRange(date);
      debug.queryResults.dateRange = {
        original: date,
        startOfDay: startOfDay.toISOString(),
        endOfDay: endOfDay.toISOString()
      };

      // Get real task statistics with proper date and businessId matching
      const pipeline = [
        {
          $match: {
            businessId: businessObjectId, // ✅ Use ObjectId
            scheduledDate: { $gte: startOfDay, $lte: endOfDay },
            isDeleted: false
          }
        },
        {
          $group: {
            _id: null,
            totalTasks: { $sum: 1 },
            completedTasks: { $sum: { $cond: [{ $eq: ['$status', FieldTaskStatus.COMPLETED] }, 1, 0] } },
            assignedTasks: { $sum: { $cond: [{ $eq: ['$status', FieldTaskStatus.ASSIGNED] }, 1, 0] } },
            inProgressTasks: { $sum: { $cond: [{ $eq: ['$status', FieldTaskStatus.IN_PROGRESS] }, 1, 0] } },
            avgEstimatedDuration: { $avg: '$estimatedDuration' },
            avgActualDuration: { $avg: '$actualPerformance.actualDuration' },
            teamsWithTasks: { $addToSet: '$assignedTeamId' },
            taskStatuses: { $push: '$status' },
            taskIds: { $push: '$_id' }
          }
        }
      ];

      debug.queryResults.aggregationPipeline = pipeline;

      const result = await this.fieldTaskModel.aggregate(pipeline);
      const stats = result[0] || {
        totalTasks: 0,
        completedTasks: 0,
        assignedTasks: 0,
        inProgressTasks: 0,
        avgEstimatedDuration: 0,
        avgActualDuration: 0,
        teamsWithTasks: [],
        taskStatuses: [],
        taskIds: []
      };

      debug.queryResults.rawAggregationResult = stats;

      // Also do a direct count query for comparison
      const directCount = await this.fieldTaskModel.countDocuments({
        businessId: businessObjectId,
        scheduledDate: { $gte: startOfDay, $lte: endOfDay },
        isDeleted: false
      });

      debug.queryResults.directCountComparison = {
        aggregationCount: stats.totalTasks,
        directCount: directCount
      };

      // Calculate additional metrics
      const totalDistance = await this.calculateTotalDistanceForDate(businessId, date);
      const efficiency = stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;
      const fuelSavings = this.calculateFuelSavings(totalDistance, stats.totalTasks);

      debug.queryResults.calculatedMetrics = {
        totalDistance,
        efficiency,
        fuelSavings
      };

      debug.executionTime = Date.now() - startTime;
      this.logger.log(`DEBUG INFO: ${JSON.stringify(debug, null, 2)}`);

      const finalStats: RouteStats = {
        totalTasks: stats.totalTasks,
        completedTasks: stats.completedTasks,
        avgExecutionTime: Math.round(stats.avgActualDuration || stats.avgEstimatedDuration || 0),
        totalDistance: Math.round(totalDistance),
        fuelSavings: Math.round(fuelSavings),
        efficiency,
        teamsWithRoutes: stats.teamsWithTasks.filter(t => t != null).length
      };

      return finalStats;

    } catch (error) {
      debug.errors.push(`Error getting route stats: ${error.message}`);
      debug.executionTime = Date.now() - startTime;
      this.logger.error(`Error getting route stats: ${error.message}`, error.stack);
      this.logger.error(`DEBUG INFO: ${JSON.stringify(debug, null, 2)}`);
      throw error;
    }
  }

  // ============================================================================
  // IMPROVED HELPER METHODS
  // ============================================================================

  /**
   * Convert string ID to ObjectId safely
   */
  private convertToObjectId(id: string): mongoose.Types.ObjectId {
    try {
      return new mongoose.Types.ObjectId(id);
    } catch (error) {
      throw new BadRequestException(`Invalid ObjectId format: ${id}`);
    }
  }

  /**
   * Create UTC date range for proper date matching
   */
  private createUTCDateRange(date: string): { startOfDay: Date; endOfDay: Date } {
    // Parse date as UTC to match database format
    const startOfDay = new Date(date + 'T00:00:00.000Z');
    const endOfDay = new Date(date + 'T23:59:59.999Z');
    
    return { startOfDay, endOfDay };
  }

  /**
   * Validate business exists - IMPROVED VERSION
   */
  private async validateBusinessImproved(businessObjectId: mongoose.Types.ObjectId, debug: DebugInfo): Promise<any> {
    const business = await this.businessModel.findById(businessObjectId);
    
    debug.queryResults.businessValidation = {
      businessId: businessObjectId.toString(),
      found: !!business,
      businessName: business?.name || 'N/A'
    };

    if (!business) {
      debug.errors.push('Business not found');
      throw new NotFoundException('Business not found');
    }
    
    return business;
  }

  /**
   * Get tasks for routing with improved handling
   */
  private async getTasksForRoutingImproved(
    businessObjectId: mongoose.Types.ObjectId,
    date: string,
    teamIds: string[] | undefined,
    debug: DebugInfo
  ): Promise<FieldTask[]> {
    const { startOfDay, endOfDay } = this.createUTCDateRange(date);
    
    const query: any = {
      businessId: businessObjectId,
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      isDeleted: false
    };

    if (teamIds && teamIds.length > 0) {
      query.assignedTeamId = { $in: teamIds };
    }

    debug.queryResults.taskQuery = {
      query: JSON.stringify(query, null, 2),
      dateRange: { startOfDay: startOfDay.toISOString(), endOfDay: endOfDay.toISOString() }
    };

    const tasks = await this.fieldTaskModel.find(query).populate('appClientId');
    
    debug.queryResults.tasksFromQuery = {
      count: tasks.length,
      taskIds: tasks.map(t => t._id.toString()),
      statuses: tasks.map(t => t.status),
      assignedTeams: tasks.map(t => t.assignedTeamId).filter(Boolean)
    };

    return tasks;
  }

  /**
   * Validate business exists - ORIGINAL METHOD FOR COMPATIBILITY
   */
  private async validateBusiness(businessId: string): Promise<any> {
    const businessObjectId = this.convertToObjectId(businessId);
    const business = await this.businessModel.findById(businessObjectId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    return business;
  }

  /**
   * Generate real optimized routes with debug info
   */
  private async generateRealOptimizedRoutes(
    tasks: FieldTask[],
    teams: any[],
    params: any,
    debug: DebugInfo
  ): Promise<OptimizedRoute[]> {
    const routes: OptimizedRoute[] = [];
    const maxTasksPerTeam = params.maxTasksPerTeam || 8;

    debug.queryResults.routeGeneration = {
      totalTasks: tasks.length,
      totalTeams: teams.length,
      maxTasksPerTeam
    };

    // Sort tasks by priority and time window
    const sortedTasks = [...tasks].sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1, urgent: 4, emergency: 5 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Secondary sort by time window start
      return a.timeWindow.start.localeCompare(b.timeWindow.start);
    });

    // Distribute tasks among teams
    let taskIndex = 0;
    const teamAssignments = {};

    for (const team of teams) {
      const teamTasks: FieldTask[] = [];
      const maxTasks = Math.min(maxTasksPerTeam, team.maxDailyTasks || maxTasksPerTeam);

      // Assign tasks to this team
      while (teamTasks.length < maxTasks && taskIndex < sortedTasks.length) {
        const task = sortedTasks[taskIndex];
        
        // Check if team can handle task
        if (this.teamCanHandleTask(team, task)) {
          teamTasks.push(task);
        }
        taskIndex++;
      }

      teamAssignments[team.id] = teamTasks.length;

      if (teamTasks.length > 0) {
        // Optimize task order for this team
        const optimizedTasks = this.optimizeTaskOrder(teamTasks, team);
        const metrics = await this.calculateRouteMetricsForTasks(optimizedTasks);
        
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

    debug.queryResults.teamAssignments = teamAssignments;

    return routes;
  }

  // ============================================================================
  // EXISTING HELPER METHODS (UNCHANGED)
  // ============================================================================

  /**
   * Extract customer info from populated task
   */
  private extractCustomerInfo(task: any): { name: string; email?: string; phone?: string; type: string } {
    if (task.appClientId && typeof task.appClientId === 'object') {
      const client = task.appClientId;
      return {
        name: client.name || 'Unknown Customer',
        email: client.email,
        phone: client.phone,
        type: client.type || 'individual'
      };
    }
    
    // Fallback if not populated
    return {
      name: 'Unknown Customer',
      type: 'individual'
    };
  }

  /**
   * Calculate working minutes from time strings
   */
  private calculateWorkingMinutes(startTime: string, endTime: string): number {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    return endMinutes - startMinutes;
  }

  /**
   * Get available teams for routing
   */
  private getAvailableTeams(business: any, teamIds?: string[]): any[] {
    let teams = business.teams || [];
    
    if (teamIds && teamIds.length > 0) {
      teams = teams.filter((t: any) => teamIds.includes(t.id));
    }

    // Filter for active teams available for routing
    return teams.filter((t: any) => t.isActive && t.isAvailableForRouting);
  }

  /**
   * Check if team can handle a task based on skills
   */
  private teamCanHandleTask(team: any, task: FieldTask): boolean {
    if (!task.skillsRequired || task.skillsRequired.length === 0) {
      return true; // No specific skills required
    }

    const teamSkills = team.skills || [];
    return task.skillsRequired.every(skill => teamSkills.includes(skill));
  }

  /**
   * Optimize task order using simple nearest neighbor algorithm
   */
  private optimizeTaskOrder(tasks: FieldTask[], team: any): FieldTask[] {
    if (tasks.length <= 1) return tasks;

    // Start from team's base location or first task
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

      // Find nearest task
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

      // Add nearest task to optimized order
      const nearestTask = remainingTasks.splice(nearestIndex, 1)[0];
      optimizedOrder.push(nearestTask);
      currentLocation = {
        lat: nearestTask.location.latitude,
        lng: nearestTask.location.longitude
      };
    }

    return optimizedOrder;
  }

  /**
   * Calculate real distances between coordinates using Haversine formula
   */
  private calculateRealDistances(coordinates: Array<{ lat: number; lng: number }>): { totalDistance: number; totalTravelTime: number } {
    if (coordinates.length <= 1) {
      return { totalDistance: 0, totalTravelTime: 0 };
    }

    let totalDistance = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
      totalDistance += this.calculateDistance(coordinates[i], coordinates[i + 1]);
    }

    // Estimate travel time (assuming average speed of 50 km/h in urban areas)
    const totalTravelTime = Math.round((totalDistance / 50) * 60); // minutes

    return { totalDistance, totalTravelTime };
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  private calculateDistance(point1: { lat: number; lng: number }, point2: { lat: number; lng: number }): number {
    const R = 6371; // Earth's radius in kilometers
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

  /**
   * Calculate fuel cost based on distance
   */
  private calculateFuelCost(distance: number): number {
    const fuelConsumptionPer100km = 8; // liters per 100km
    const fuelPricePerLiter = 1.5; // $1.50 per liter
    return (distance / 100) * fuelConsumptionPer100km * fuelPricePerLiter;
  }

  /**
   * Calculate optimization score
   */
  private calculateOptimizationScore(tasks: FieldTask[], totalDistance: number, totalTime: number): number {
    const taskCount = tasks.length;
    const avgDistancePerTask = taskCount > 1 ? totalDistance / (taskCount - 1) : 0;
    const avgTimePerTask = totalTime / taskCount;

    // Score based on efficiency (lower distance and time per task = higher score)
    let score = 100;
    score -= Math.min(30, avgDistancePerTask * 2); // Penalty for long distances
    score -= Math.min(20, (avgTimePerTask - 45) / 5); // Penalty for tasks taking longer than 45 min

    return Math.max(60, Math.round(score));
  }

  /**
   * Calculate route metrics for a list of tasks
   */
  private async calculateRouteMetricsForTasks(tasks: FieldTask[]): Promise<RouteMetrics> {
    const totalDuration = tasks.reduce((sum, task) => sum + task.estimatedDuration, 0);
    const coordinates = tasks.map(task => ({
      lat: task.location.latitude,
      lng: task.location.longitude
    }));

    const { totalDistance, totalTravelTime } = this.calculateRealDistances(coordinates);
    const estimatedTotalTime = totalDuration + totalTravelTime;
    const estimatedFuelCost = this.calculateFuelCost(totalDistance);
    const optimizationScore = this.calculateOptimizationScore(tasks, totalDistance, estimatedTotalTime);

    return {
      estimatedTotalTime,
      estimatedDistance: totalDistance,
      estimatedFuelCost,
      optimizationScore,
      taskCount: tasks.length
    };
  }

  /**
   * Generate route sequence with times
   */
  private generateRouteSequence(tasks: FieldTask[]): Array<any> {
    const sequence = [];
    let currentTime = 8 * 60; // Start at 8:00 AM (in minutes)

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const travelTime = i === 0 ? 0 : 15; // 15 minutes travel time between tasks
      
      currentTime += travelTime;
      const arrivalTime = this.minutesToTimeString(currentTime);
      currentTime += task.estimatedDuration;
      const departureTime = this.minutesToTimeString(currentTime);

      sequence.push({
        taskId: task._id.toString(),
        arrivalTime,
        departureTime,
        travelTime,
        distance: i === 0 ? 0 : 5 // Estimate 5km between tasks
      });
    }

    return sequence;
  }

  /**
   * Convert minutes to time string (HH:MM)
   */
  private minutesToTimeString(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  /**
   * Add weather warnings to routes
   */
  private async addWeatherWarnings(routes: OptimizedRoute[], businessId: string): Promise<void> {
    try {
      for (const route of routes) {
        const warnings: string[] = [];
        
        // Check weather for each task location
        for (const task of route.tasks) {
          try {
            const weatherData = await this.weatherService.getCurrentWeather(
              task.location.latitude,
              task.location.longitude
            );

            // Check for adverse weather conditions
            if (weatherData.weather[0].main === 'Rain') {
              warnings.push(`Rain expected at ${task.location.address}`);
            }
            if (weatherData.wind.speed > 10) {
              warnings.push(`High winds (${weatherData.wind.speed} m/s) at ${task.location.address}`);
            }
            if (weatherData.main.temp < 0) {
              warnings.push(`Freezing temperatures at ${task.location.address}`);
            }
          } catch (error) {
            this.logger.warn(`Could not get weather for task ${task.taskId}: ${error.message}`);
          }
        }

        route.weatherWarnings = [...new Set(warnings)]; // Remove duplicates
      }
    } catch (error) {
      this.logger.error(`Error adding weather warnings: ${error.message}`);
    }
  }

  /**
   * Calculate total distance for all routes on a specific date
   */
  private async calculateTotalDistanceForDate(businessId: string, date: string): Promise<number> {
    const routes = await this.getOptimizedRoutes(businessId, date);
    return routes.reduce((total, route) => total + route.metrics.estimatedDistance, 0);
  }

  /**
   * Calculate estimated fuel savings compared to unoptimized routing
   */
  private calculateFuelSavings(optimizedDistance: number, taskCount: number): number {
    if (taskCount <= 1) return 0;
    
    // Assume unoptimized routing would be 30% longer
    const unoptimizedDistance = optimizedDistance * 1.3;
    const distanceSaved = unoptimizedDistance - optimizedDistance;
    return this.calculateFuelCost(distanceSaved);
  }

  /**
   * Enhanced distance calculation using Google Maps API if available
   */
  private async calculateDistanceWithGoogleMaps(
    business: any,
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number }
  ): Promise<{ distance: number; duration: number }> {
    // Check if Google Maps is configured and enabled
    const googleMapsConfig = business.routePlanningConfig?.integrations?.googleMaps;
    
    if (!googleMapsConfig?.enabled || !googleMapsConfig?.apiKey || !googleMapsConfig?.directionsEnabled) {
      // Fallback to Haversine calculation
      const distance = this.calculateDistance(origin, destination);
      const duration = Math.round((distance / 50) * 60); // Assume 50 km/h average speed
      return { distance, duration };
    }

    try {
      // Use Google Maps API for more accurate distance and duration
      const result = await this.googleMapsService.getDirections(
        origin,
        destination,
        googleMapsConfig,
        {
          departureTime: new Date(), // Current time for traffic data
          avoidTolls: false,
          avoidHighways: false
        }
      );

      return {
        distance: result.distance,
        duration: result.duration
      };
    } catch (error) {
      this.logger.warn(`Google Maps API call failed, using fallback: ${error.message}`);
      const distance = this.calculateDistance(origin, destination);
      const duration = Math.round((distance / 50) * 60);
      return { distance, duration };
    }
  }

  /**
   * Enhanced route optimization using Google Maps for real distances
   */
  private async optimizeRouteWithGoogleMaps(
    business: any,
    tasks: FieldTask[],
    team: any
  ): Promise<FieldTask[]> {
    const googleMapsConfig = business.routePlanningConfig?.integrations?.googleMaps;
    
    if (!googleMapsConfig?.enabled || !googleMapsConfig?.apiKey || tasks.length <= 1) {
      // Fallback to simple nearest neighbor algorithm
      return this.optimizeTaskOrder(tasks, team);
    }

    try {
      // Prepare waypoints for Google Maps optimization
      const startLocation = team.currentLocation || business.baseLocation || {
        lat: tasks[0].location.latitude,
        lng: tasks[0].location.longitude
      };

      const waypoints = tasks.slice(1).map(task => ({
        lat: task.location.latitude,
        lng: task.location.longitude
      }));

      const destination = {
        lat: tasks[0].location.latitude,
        lng: tasks[0].location.longitude
      };

      // Get optimized route from Google Maps
      const optimizedRoute = await this.googleMapsService.getOptimizedRoute(
        startLocation,
        destination,
        waypoints,
        googleMapsConfig
      );

      // Reorder tasks based on Google Maps optimization
      const optimizedTasks = [tasks[0]]; // First task stays first
      optimizedRoute.optimizedOrder.forEach(index => {
        optimizedTasks.push(tasks[index + 1]); // +1 because we excluded first task from waypoints
      });

      this.logger.log(`Google Maps optimized route: saved ${optimizedRoute.distance}km total distance`);
      return optimizedTasks;

    } catch (error) {
      this.logger.warn(`Google Maps route optimization failed, using fallback: ${error.message}`);
      return this.optimizeTaskOrder(tasks, team);
    }
  }

  /**
   * Enhanced distance calculation for route metrics using Google Maps
   */
  private async calculateRealDistancesEnhanced(
    business: any,
    coordinates: Array<{ lat: number; lng: number }>
  ): Promise<{ totalDistance: number; totalTravelTime: number }> {
    if (coordinates.length <= 1) {
      return { totalDistance: 0, totalTravelTime: 0 };
    }

    const googleMapsConfig = business.routePlanningConfig?.integrations?.googleMaps;
    
    if (!googleMapsConfig?.enabled || !googleMapsConfig?.apiKey) {
      // Fallback to Haversine calculation
      return this.calculateRealDistances(coordinates);
    }

    try {
      let totalDistance = 0;
      let totalTravelTime = 0;

      // Calculate distance between consecutive points using Google Maps
      for (let i = 0; i < coordinates.length - 1; i++) {
        const result = await this.calculateDistanceWithGoogleMaps(
          business,
          coordinates[i],
          coordinates[i + 1]
        );
        totalDistance += result.distance;
        totalTravelTime += result.duration;
      }

      return { totalDistance, totalTravelTime };

    } catch (error) {
      this.logger.warn(`Enhanced distance calculation failed, using fallback: ${error.message}`);
      return this.calculateRealDistances(coordinates);
    }
  }
}