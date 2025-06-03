// src/services/route-optimization.service.ts - REAL IMPLEMENTATION
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business } from '../schemas/business.schema';
import { FieldTask, FieldTaskStatus } from '../schemas/field-task.schema';
import { FieldTaskService } from './field-task.service';
import { WeatherService } from './weather.service';

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
    customerInfo: any;
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

@Injectable()
export class RouteOptimizationService {
  private readonly logger = new Logger(RouteOptimizationService.name);

  constructor(
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(FieldTask.name) private fieldTaskModel: Model<FieldTask>,
    private readonly fieldTaskService: FieldTaskService,
    private readonly weatherService: WeatherService,
  ) {}

  // ============================================================================
  // REAL ROUTE OPTIMIZATION USING YOUR DATA
  // ============================================================================

  /**
   * Optimize routes using real field tasks and teams
   */
  async optimizeRoutes(request: OptimizeRoutesRequest): Promise<OptimizedRoute[]> {
    try {
      // Validate business
      const business = await this.validateBusiness(request.businessId);
      
      this.logger.log(`Starting route optimization for business ${request.businessId} on ${request.date}`);

      // Get real tasks for the date
      let tasks: FieldTask[];
      if (request.taskIds && request.taskIds.length > 0) {
        // Get specific tasks
        tasks = await this.fieldTaskModel.find({
          _id: { $in: request.taskIds },
          businessId: request.businessId,
          isDeleted: false
        });
      } else {
        // Get all tasks for the date
        tasks = await this.fieldTaskService.getTasksForRouting(
          request.businessId,
          request.date,
          request.teamIds
        );
      }

      if (tasks.length === 0) {
        throw new BadRequestException('No tasks found for optimization');
      }

      // Get available teams
      const availableTeams = this.getAvailableTeams(business, request.teamIds);
      if (availableTeams.length === 0) {
        throw new BadRequestException('No teams available for routing');
      }

      this.logger.log(`Optimizing ${tasks.length} tasks across ${availableTeams.length} teams`);

      // Generate optimized routes
      const optimizedRoutes = await this.generateRealOptimizedRoutes(
        tasks,
        availableTeams,
        request.params || {}
      );

      // Add weather warnings if requested
      if (request.params?.considerWeather) {
        await this.addWeatherWarnings(optimizedRoutes, request.businessId);
      }

      this.logger.log(`Generated ${optimizedRoutes.length} optimized routes`);
      return optimizedRoutes;

    } catch (error) {
      this.logger.error(`Error optimizing routes: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Calculate real route metrics using actual task data
   */
  async calculateRouteMetrics(
    businessId: string,
    taskIds: string[],
    teamId: string
  ): Promise<RouteMetrics> {
    try {
      await this.validateBusiness(businessId);

      // Get real tasks
      const tasks = await this.fieldTaskModel.find({
        _id: { $in: taskIds },
        businessId,
        isDeleted: false
      });

      if (tasks.length === 0) {
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

      return {
        estimatedTotalTime,
        estimatedDistance: totalDistance,
        estimatedFuelCost,
        optimizationScore,
        taskCount: tasks.length
      };

    } catch (error) {
      this.logger.error(`Error calculating route metrics: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Assign real optimized route to a team
   */
  async assignRouteToTeam(
    businessId: string,
    teamId: string,
    taskIds: string[]
  ): Promise<{ success: boolean; message: string }> {
    try {
      const business = await this.validateBusiness(businessId);

      // Validate team exists
      const team = business.teams?.find((t: any) => t.id === teamId);
      if (!team) {
        throw new NotFoundException('Team not found');
      }

      // Validate and assign tasks
      const tasks = await this.fieldTaskModel.find({
        _id: { $in: taskIds },
        businessId,
        isDeleted: false
      });

      if (tasks.length !== taskIds.length) {
        throw new BadRequestException('Some tasks not found or already deleted');
      }

      // Update all tasks to be assigned to this team
      await this.fieldTaskModel.updateMany(
        { _id: { $in: taskIds } },
        { 
          assignedTeamId: teamId,
          assignedAt: new Date(),
          status: FieldTaskStatus.ASSIGNED
        }
      );

      this.logger.log(`Assigned ${tasks.length} tasks to team ${teamId} for business ${businessId}`);

      return {
        success: true,
        message: `Route with ${tasks.length} tasks assigned to ${team.name} successfully`
      };

    } catch (error) {
      this.logger.error(`Error assigning route: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update route progress using real task data
   */
  async updateRouteProgress(
    businessId: string,
    teamId: string,
    taskId: string,
    status: 'started' | 'completed'
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.validateBusiness(businessId);

      const task = await this.fieldTaskModel.findOne({
        _id: taskId,
        businessId,
        assignedTeamId: teamId,
        isDeleted: false
      });

      if (!task) {
        throw new NotFoundException('Task not found or not assigned to this team');
      }

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
      
      this.logger.log(`Updated route progress: Team ${teamId}, Task ${taskId} - ${status}`);

      return {
        success: true,
        message: `Task ${status} successfully`
      };

    } catch (error) {
      this.logger.error(`Error updating route progress: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get real optimized routes for a date
   */
  async getOptimizedRoutes(
    businessId: string,
    date: string
  ): Promise<OptimizedRoute[]> {
    try {
      await this.validateBusiness(businessId);

      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Get all tasks for the date that are assigned
      const tasks = await this.fieldTaskModel.find({
        businessId,
        scheduledDate: { $gte: startOfDay, $lte: endOfDay },
        assignedTeamId: { $exists: true },
        isDeleted: false
      }).populate('assignedTeamId');

      // Group tasks by team
      const tasksByTeam = new Map();
      tasks.forEach(task => {
        const teamId = task.assignedTeamId;
        if (!tasksByTeam.has(teamId)) {
          tasksByTeam.set(teamId, []);
        }
        tasksByTeam.get(teamId).push(task);
      });

      // Build optimized routes response
      const routes: OptimizedRoute[] = [];
      const business = await this.businessModel.findById(businessId);

      for (const [teamId, teamTasks] of tasksByTeam) {
        const team = business.teams?.find((t: any) => t.id === teamId);
        if (!team) continue;

        const taskIds = teamTasks.map(t => t._id.toString());
        const metrics = await this.calculateRouteMetrics(businessId, taskIds, teamId);
        
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
            customerInfo: task.customerInfo
          })),
          metrics,
          route: this.generateRouteSequence(teamTasks)
        });
      }

      return routes;

    } catch (error) {
      this.logger.error(`Error getting optimized routes: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get real route statistics using actual data
   */
  async getRouteStats(businessId: string, date: string): Promise<RouteStats> {
    try {
      await this.validateBusiness(businessId);

      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Get real task statistics
      const pipeline = [
        {
          $match: {
            businessId,
            scheduledDate: { $gte: startOfDay, $lte: endOfDay },
            isDeleted: false
          }
        },
        {
          $group: {
            _id: null,
            totalTasks: { $sum: 1 },
            completedTasks: { $sum: { $cond: [{ $eq: ['$status', FieldTaskStatus.COMPLETED] }, 1, 0] } },
            avgEstimatedDuration: { $avg: '$estimatedDuration' },
            avgActualDuration: { $avg: '$actualPerformance.actualDuration' },
            teamsWithTasks: { $addToSet: '$assignedTeamId' }
          }
        }
      ];

      const result = await this.fieldTaskModel.aggregate(pipeline);
      const stats = result[0] || {
        totalTasks: 0,
        completedTasks: 0,
        avgEstimatedDuration: 0,
        avgActualDuration: 0,
        teamsWithTasks: []
      };

      // Calculate additional metrics
      const totalDistance = await this.calculateTotalDistanceForDate(businessId, date);
      const efficiency = stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;
      const fuelSavings = this.calculateFuelSavings(totalDistance, stats.totalTasks);

      return {
        totalTasks: stats.totalTasks,
        completedTasks: stats.completedTasks,
        avgExecutionTime: Math.round(stats.avgActualDuration || stats.avgEstimatedDuration || 0),
        totalDistance: Math.round(totalDistance),
        fuelSavings: Math.round(fuelSavings),
        efficiency,
        teamsWithRoutes: stats.teamsWithTasks.filter(t => t != null).length
      };

    } catch (error) {
      this.logger.error(`Error getting route stats: ${error.message}`, error.stack);
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
   * Generate real optimized routes using actual task data
   */
  private async generateRealOptimizedRoutes(
    tasks: FieldTask[],
    teams: any[],
    params: any
  ): Promise<OptimizedRoute[]> {
    const routes: OptimizedRoute[] = [];
    const maxTasksPerTeam = params.maxTasksPerTeam || 8;

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
    for (const team of teams) {
      const teamTasks: FieldTask[] = [];
      const maxTasks = Math.min(maxTasksPerTeam, team.maxDailyTasks || maxTasksPerTeam);

      // Assign tasks to this team
      while (teamTasks.length < maxTasks && taskIndex < sortedTasks.length) {
        const task = sortedTasks[taskIndex];
        
        // Check if team has required skills
        if (this.teamCanHandleTask(team, task)) {
          teamTasks.push(task);
        }
        taskIndex++;
      }

      if (teamTasks.length > 0) {
        // Optimize task order for this team (simple nearest neighbor for now)
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
            customerInfo: task.customerInfo
          })),
          metrics,
          route: this.generateRouteSequence(optimizedTasks)
        });
      }
    }

    return routes;
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
}