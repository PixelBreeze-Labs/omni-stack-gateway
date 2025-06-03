// src/services/weather-route.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business } from '../schemas/business.schema';
import { FieldTask } from '../schemas/field-task.schema';
import { WeatherService } from './weather.service';

interface WeatherImpact {
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
  impactFactors: {
    visibility: { level: string; impact: string };
    precipitation: { level: string; impact: string };
    wind: { level: string; impact: string };
    temperature: { level: string; impact: string };
  };
  recommendations: string[];
  routeAdjustments: {
    suggestedDelays: number; // minutes
    alternativeTimeWindows: Array<{ start: string; end: string }>;
    equipmentRecommendations: string[];
  };
  safetyScore: number; // 0-100, higher is safer
}

interface RouteWeatherAdjustment {
  originalRoute: {
    taskIds: string[];
    estimatedTime: number;
    estimatedDistance: number;
  };
  adjustedRoute: {
    taskIds: string[];
    estimatedTime: number;
    estimatedDistance: number;
    weatherDelay: number;
  };
  weatherFactors: {
    primaryConcern: string;
    impactLevel: string;
    adjustmentReason: string;
  };
  alternativeOptions: Array<{
    description: string;
    timeAdjustment: number;
    feasibility: 'high' | 'medium' | 'low';
  }>;
}

interface WeatherAlert {
  id: string;
  businessId: string;
  alertType: 'weather_warning' | 'route_impact' | 'safety_concern';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  affectedAreas: string[];
  affectedRoutes: string[];
  recommendations: string[];
  validFrom: string;
  validUntil: string;
  createdAt: string;
}

@Injectable()
export class WeatherRouteService {
  private readonly logger = new Logger(WeatherRouteService.name);

  constructor(
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(FieldTask.name) private fieldTaskModel: Model<FieldTask>,
    private readonly weatherService: WeatherService,
  ) {}

  // ============================================================================
  // REAL WEATHER DATA AND IMPACT ANALYSIS USING YOUR WEATHER SERVICE
  // ============================================================================

  /**
   * Get weather impact for routes using your weather service
   */
  async getWeatherImpact(
    businessId: string,
    coordinates: { lat: number; lng: number },
    date?: string
  ): Promise<WeatherImpact> {
    try {
      const business = await this.validateBusiness(businessId);

      // Validate coordinates
      this.validateCoordinates(coordinates.lat, coordinates.lng);

      // Get real weather data using your weather service
      const weatherData = await this.weatherService.getOneCallWeather(coordinates.lat, coordinates.lng);
      
      // Analyze impact on routes using real data
      const impact = this.analyzeRealWeatherImpact(weatherData);

      this.logger.log(`Analyzed weather impact for business ${businessId} at coordinates ${coordinates.lat}, ${coordinates.lng}`);

      return impact;

    } catch (error) {
      this.logger.error(`Error getting weather impact: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Adjust route for weather conditions using real weather data
   */
  async adjustRouteForWeather(
    businessId: string,
    routeData: {
      taskIds: string[];
      coordinates: Array<{ lat: number; lng: number }>;
      originalTime: number;
      originalDistance: number;
    },
    date?: string
  ): Promise<RouteWeatherAdjustment> {
    try {
      const business = await this.validateBusiness(businessId);

      if (!routeData.taskIds?.length) {
        throw new BadRequestException('Route must contain at least one task');
      }

      if (!routeData.coordinates?.length) {
        throw new BadRequestException('Route coordinates are required');
      }

      // Get weather conditions for route area using your weather service
      const centerCoordinates = this.calculateCenterCoordinates(routeData.coordinates);
      const weatherData = await this.weatherService.getOneCallWeather(centerCoordinates.lat, centerCoordinates.lng);
      const weatherImpact = this.analyzeRealWeatherImpact(weatherData);

      // Calculate route adjustments based on real weather
      const adjustment = this.calculateRealRouteAdjustment(routeData, weatherData, weatherImpact);

      this.logger.log(`Adjusted route for weather conditions: ${adjustment.adjustedRoute.weatherDelay} minutes delay added`);

      return adjustment;

    } catch (error) {
      this.logger.error(`Error adjusting route for weather: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get weather alerts using your weather service and real business data
   */
  async getWeatherAlerts(businessId: string): Promise<WeatherAlert[]> {
    try {
      const business = await this.validateBusiness(businessId);

      // Get real weather alerts from your weather service
      const realWeatherAlerts = await this.weatherService.getAllBusinessAlerts(businessId, false);
      
      // Convert to our interface format
      const alerts: WeatherAlert[] = realWeatherAlerts.map(alert => ({
        id: alert.id,
        businessId,
        alertType: this.mapWeatherTypeToAlertType(alert.weatherType),
        severity: this.mapSeverityLevel(alert.severity),
        title: alert.title,
        message: alert.description,
        affectedAreas: alert.affectedProjects?.map(p => p.name) || [],
        affectedRoutes: [], // Would be populated with route data if available
        recommendations: this.generateRouteRecommendations(alert),
        validFrom: alert.startTime.toISOString(),
        validUntil: alert.endTime.toISOString(),
        createdAt: new Date().toISOString()
      }));

      // Add route-specific alerts for tasks scheduled today
      const routeAlerts = await this.generateRouteSpecificAlerts(businessId);
      alerts.push(...routeAlerts);

      // Sort by severity and time
      alerts.sort((a, b) => {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        if (severityDiff !== 0) return severityDiff;
        return new Date(a.validFrom).getTime() - new Date(b.validFrom).getTime();
      });

      return alerts.slice(0, 10); // Return top 10 alerts

    } catch (error) {
      this.logger.error(`Error getting weather alerts: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update weather data for business using your weather service
   */
  async updateWeatherData(businessId: string): Promise<{ success: boolean; message: string; lastUpdated: string }> {
    try {
      const business = await this.validateBusiness(businessId);

      // Get all locations from tasks scheduled for today and tomorrow
      const locations = await this.extractBusinessLocations(businessId);
      
      if (locations.length === 0) {
        return {
          success: true,
          message: 'No locations found for weather updates',
          lastUpdated: new Date().toISOString()
        };
      }

      // Update weather data for all locations using your weather service
      const weatherUpdates = [];
      for (const location of locations) {
        try {
          const weatherData = await this.weatherService.getOneCallWeather(
            location.coordinates.lat, 
            location.coordinates.lng
          );
          
          weatherUpdates.push({
            locationId: location.id,
            locationName: location.name,
            coordinates: location.coordinates,
            weatherData: {
              current: weatherData.current,
              hourly: weatherData.hourly.slice(0, 24), // Next 24 hours
              daily: weatherData.daily.slice(0, 3), // Next 3 days
              alerts: weatherData.alerts || []
            },
            updatedAt: new Date().toISOString()
          });

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          this.logger.warn(`Failed to update weather for location ${location.name}: ${error.message}`);
        }
      }

      // Store weather data in business metadata
      if (!business.metadata) business.metadata = {};
      business.metadata.weatherData = {
        locations: weatherUpdates,
        lastUpdated: new Date().toISOString()
      };

      business.markModified('metadata');
      await business.save();

      this.logger.log(`Updated weather data for ${weatherUpdates.length} locations for business ${businessId}`);

      return {
        success: true,
        message: `Weather data updated for ${weatherUpdates.length} locations`,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error(`Error updating weather data: ${error.message}`, error.stack);
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
   * Analyze weather impact using real weather data from your service
   */
  private analyzeRealWeatherImpact(weatherData: any): WeatherImpact {
    const current = weatherData.current;
    let riskLevel: 'low' | 'medium' | 'high' | 'extreme' = 'low';
    let safetyScore = 100;

    // Analyze visibility impact using real data
    const visibilityImpact = this.analyzeVisibilityImpact(current.visibility / 1000); // Convert to km
    
    // Analyze precipitation impact using real data
    const precipitationImpact = this.analyzePrecipitationImpact(current.rain?.['1h'] || 0, current.weather[0].main);
    
    // Analyze wind impact using real data
    const windImpact = this.analyzeWindImpact(current.wind_speed * 3.6); // Convert m/s to km/h
    
    // Analyze temperature impact using real data
    const temperatureImpact = this.analyzeTemperatureImpact(current.temp);

    // Calculate overall risk level
    const impacts = [visibilityImpact, precipitationImpact, windImpact, temperatureImpact];
    const highImpacts = impacts.filter(impact => impact.level === 'high').length;
    const mediumImpacts = impacts.filter(impact => impact.level === 'medium').length;

    if (highImpacts >= 2 || current.weather[0].main === 'Snow') {
      riskLevel = 'extreme';
      safetyScore = 20;
    } else if (highImpacts >= 1 || mediumImpacts >= 3) {
      riskLevel = 'high';
      safetyScore = 40;
    } else if (mediumImpacts >= 2) {
      riskLevel = 'medium';
      safetyScore = 65;
    } else {
      riskLevel = 'low';
      safetyScore = 85;
    }

    const recommendations = this.generateWeatherRecommendations(weatherData, riskLevel);
    const routeAdjustments = this.generateRouteAdjustments(weatherData, riskLevel);

    return {
      riskLevel,
      impactFactors: {
        visibility: visibilityImpact,
        precipitation: precipitationImpact,
        wind: windImpact,
        temperature: temperatureImpact
      },
      recommendations,
      routeAdjustments,
      safetyScore
    };
  }

  /**
   * Extract business locations from real field tasks
   */
  private async extractBusinessLocations(businessId: string): Promise<Array<{ id: string; name: string; coordinates: { lat: number; lng: number } }>> {
    const locations = [];
    
    // Get tasks scheduled for today and tomorrow
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    
    const tasks = await this.fieldTaskModel.find({
      businessId,
      isDeleted: false,
      scheduledDate: {
        $gte: today,
        $lte: tomorrow
      }
    });

    // Extract unique locations from tasks
    const locationMap = new Map();
    tasks.forEach(task => {
      const key = `${task.location.latitude.toFixed(4)},${task.location.longitude.toFixed(4)}`;
      if (!locationMap.has(key)) {
        locationMap.set(key, {
          id: task._id.toString(),
          name: task.location.address,
          coordinates: {
            lat: task.location.latitude,
            lng: task.location.longitude
          }
        });
      }
    });

    locations.push(...locationMap.values());

    // Add business base location if available
    const business = await this.businessModel.findById(businessId);
    if (business.baseLocation?.latitude && business.baseLocation?.longitude) {
      locations.push({
        id: 'headquarters',
        name: business.baseLocation.name || 'Business Headquarters',
        coordinates: {
          lat: business.baseLocation.latitude,
          lng: business.baseLocation.longitude
        }
      });
    }

    return locations;
  }

  /**
   * Generate route-specific weather alerts
   */
  private async generateRouteSpecificAlerts(businessId: string): Promise<WeatherAlert[]> {
    const alerts: WeatherAlert[] = [];
    
    try {
      // Get tasks scheduled for today
      const today = new Date();
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      const tasks = await this.fieldTaskModel.find({
        businessId,
        isDeleted: false,
        scheduledDate: { $gte: startOfDay, $lte: endOfDay },
        assignedTeamId: { $exists: true }
      });

      // Group tasks by team to check route-level weather
      const tasksByTeam = new Map();
      tasks.forEach(task => {
        const teamId = task.assignedTeamId;
        if (!tasksByTeam.has(teamId)) {
          tasksByTeam.set(teamId, []);
        }
        tasksByTeam.get(teamId).push(task);
      });

      // Check weather for each team's route
      for (const [teamId, teamTasks] of tasksByTeam) {
        if (teamTasks.length === 0) continue;

        // Get weather for route center
        const coordinates = teamTasks.map(t => ({ lat: t.location.latitude, lng: t.location.longitude }));
        const centerCoords = this.calculateCenterCoordinates(coordinates);
        
        try {
          const weatherData = await this.weatherService.getCurrentWeather(centerCoords.lat, centerCoords.lng);
          
          // Check for route-impacting conditions
          if (weatherData.weather[0].main === 'Rain' && (weatherData.rain?.['1h'] || 0) > 5) {
            alerts.push({
              id: `route-rain-${teamId}-${Date.now()}`,
              businessId,
              alertType: 'route_impact',
              severity: 'medium',
              title: 'Heavy Rain Alert for Route',
              message: `Heavy rain expected to impact team route with ${teamTasks.length} tasks`,
              affectedAreas: [...new Set(teamTasks.map(t => t.location.address))],
              affectedRoutes: [teamId],
              recommendations: [
                'Consider delaying non-urgent tasks',
                'Ensure waterproof equipment',
                'Allow extra travel time'
              ],
              validFrom: new Date().toISOString(),
              validUntil: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
              createdAt: new Date().toISOString()
            });
          }

          if (weatherData.wind.speed > 8) { // > 8 m/s
            alerts.push({
              id: `route-wind-${teamId}-${Date.now()}`,
              businessId,
              alertType: 'safety_concern',
              severity: 'high',
              title: 'High Wind Warning for Route',
              message: `Strong winds (${Math.round(weatherData.wind.speed * 3.6)} km/h) may affect team safety`,
              affectedAreas: [...new Set(teamTasks.map(t => t.location.address))],
              affectedRoutes: [teamId],
              recommendations: [
                'Secure all equipment and materials',
                'Exercise extra caution with elevated work',
                'Consider postponing outdoor tasks'
              ],
              validFrom: new Date().toISOString(),
              validUntil: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
              createdAt: new Date().toISOString()
            });
          }
        } catch (error) {
          this.logger.warn(`Could not get weather for team ${teamId} route: ${error.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error generating route-specific alerts: ${error.message}`);
    }

    return alerts;
  }

  /**
   * Calculate route adjustment based on real weather data
   */
  private calculateRealRouteAdjustment(
    routeData: any,
    weatherData: any,
    weatherImpact: WeatherImpact
  ): RouteWeatherAdjustment {
    const weatherDelay = weatherImpact.routeAdjustments.suggestedDelays;
    const adjustedTime = routeData.originalTime + weatherDelay;
    
    // Adjust distance based on potential detours
    let distanceAdjustment = 0;
    if (weatherImpact.riskLevel === 'high' || weatherImpact.riskLevel === 'extreme') {
      distanceAdjustment = routeData.originalDistance * 0.1; // 10% increase for detours
    }

    const adjustedDistance = routeData.originalDistance + distanceAdjustment;

    return {
      originalRoute: {
        taskIds: routeData.taskIds,
        estimatedTime: routeData.originalTime,
        estimatedDistance: routeData.originalDistance
      },
      adjustedRoute: {
        taskIds: routeData.taskIds,
        estimatedTime: adjustedTime,
        estimatedDistance: adjustedDistance,
        weatherDelay
      },
      weatherFactors: {
        primaryConcern: this.getPrimaryConcern(weatherData),
        impactLevel: weatherImpact.riskLevel,
        adjustmentReason: `${weatherDelay} minute delay due to ${weatherData.current.weather[0].description}`
      },
      alternativeOptions: [
        {
          description: 'Delay route start by 2 hours',
          timeAdjustment: 120,
          feasibility: 'high'
        },
        {
          description: 'Split route across multiple days',
          timeAdjustment: 0,
          feasibility: 'medium'
        },
        {
          description: 'Use alternative transportation method',
          timeAdjustment: 30,
          feasibility: 'low'
        }
      ]
    };
  }

  // Weather analysis helper methods (implement the same logic as before but using real data)
  private analyzeVisibilityImpact(visibility: number): { level: string; impact: string } {
    if (visibility < 1) {
      return { level: 'high', impact: 'Severely reduced visibility - routes may be unsafe' };
    } else if (visibility < 3) {
      return { level: 'medium', impact: 'Reduced visibility - slower speeds required' };
    } else if (visibility < 5) {
      return { level: 'low', impact: 'Slightly reduced visibility - exercise caution' };
    } else {
      return { level: 'none', impact: 'Clear visibility - no impact on routes' };
    }
  }

  private analyzePrecipitationImpact(precipitation: number, condition: string): { level: string; impact: string } {
    if (condition === 'Snow' || precipitation > 15) {
      return { level: 'high', impact: 'Heavy precipitation - significant delays expected' };
    } else if (condition.includes('Rain') || precipitation > 8) {
      return { level: 'medium', impact: 'Moderate precipitation - some delays possible' };
    } else if (precipitation > 2) {
      return { level: 'low', impact: 'Light precipitation - minimal impact' };
    } else {
      return { level: 'none', impact: 'No precipitation - no impact on routes' };
    }
  }

  private analyzeWindImpact(windSpeed: number): { level: string; impact: string } {
    if (windSpeed > 30) {
      return { level: 'high', impact: 'Strong winds - vehicle stability concerns' };
    } else if (windSpeed > 20) {
      return { level: 'medium', impact: 'Moderate winds - increased fuel consumption' };
    } else if (windSpeed > 15) {
      return { level: 'low', impact: 'Light winds - minimal impact' };
    } else {
      return { level: 'none', impact: 'Calm conditions - no wind impact' };
    }
  }

  private analyzeTemperatureImpact(temperature: number): { level: string; impact: string } {
    if (temperature < -10 || temperature > 40) {
      return { level: 'high', impact: 'Extreme temperature - equipment and safety concerns' };
    } else if (temperature < 0 || temperature > 35) {
      return { level: 'medium', impact: 'Challenging temperature - increased precautions needed' };
    } else if (temperature < 5 || temperature > 30) {
      return { level: 'low', impact: 'Mild temperature impact - minor adjustments' };
    } else {
      return { level: 'none', impact: 'Comfortable temperature - no impact' };
    }
  }

  private generateWeatherRecommendations(weatherData: any, riskLevel: string): string[] {
    const recommendations = [];
    const current = weatherData.current;

    if (riskLevel === 'extreme') {
      recommendations.push('Consider postponing non-critical routes');
      recommendations.push('Ensure all vehicles have emergency equipment');
      recommendations.push('Maintain constant communication with field teams');
    }

    if (current.weather[0].main.includes('Rain') || (current.rain?.['1h'] || 0) > 5) {
      recommendations.push('Reduce driving speeds by 20-30%');
      recommendations.push('Increase following distances');
      recommendations.push('Check vehicle tire conditions');
    }

    if (current.weather[0].main === 'Snow') {
      recommendations.push('Use winter tires or chains where required');
      recommendations.push('Carry emergency supplies');
      recommendations.push('Allow extra time for all routes');
    }

    if (current.visibility < 3000) {
      recommendations.push('Use fog lights when necessary');
      recommendations.push('Reduce speeds significantly');
      recommendations.push('Consider alternate routes with better visibility');
    }

    if (current.wind_speed > 7) { // > 7 m/s
      recommendations.push('Secure all loose equipment and materials');
      recommendations.push('Be cautious of high-sided vehicles');
      recommendations.push('Avoid exposed routes where possible');
    }

    recommendations.push('Monitor weather updates regularly');
    recommendations.push('Inform customers of potential delays');

    return recommendations.slice(0, 8);
  }

  private generateRouteAdjustments(weatherData: any, riskLevel: string): any {
    let suggestedDelays = 0;
    const alternativeTimeWindows = [];
    const equipmentRecommendations = [];

    const current = weatherData.current;

    // Calculate delays based on real conditions
    if (current.weather[0].main.includes('Rain')) {
      suggestedDelays += (current.rain?.['1h'] || 0) > 10 ? 30 : 15;
    }

    if (current.weather[0].main === 'Snow') {
      suggestedDelays += 60;
    }

    if (current.visibility < 3000) {
      suggestedDelays += 20;
    }

    if (current.wind_speed > 7) {
      suggestedDelays += 15;
    }

    // Generate alternative time windows
    const now = new Date();
    for (let i = 2; i <= 6; i += 2) {
      const startTime = new Date(now.getTime() + i * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + 4 * 60 * 60 * 1000);
      
      alternativeTimeWindows.push({
        start: startTime.toTimeString().slice(0, 5),
        end: endTime.toTimeString().slice(0, 5)
      });
    }

    // Equipment recommendations based on real weather
    if (current.weather[0].main.includes('Rain')) {
      equipmentRecommendations.push('Waterproof equipment covers');
      equipmentRecommendations.push('Non-slip footwear');
    }

    if (current.weather[0].main === 'Snow') {
      equipmentRecommendations.push('Winter tires or chains');
      equipmentRecommendations.push('De-icing equipment');
      equipmentRecommendations.push('Emergency warming supplies');
    }

    if (current.visibility < 5000) {
      equipmentRecommendations.push('High-visibility safety vests');
      equipmentRecommendations.push('Portable lighting equipment');
    }

    return {
      suggestedDelays,
      alternativeTimeWindows: alternativeTimeWindows.slice(0, 3),
      equipmentRecommendations: equipmentRecommendations.slice(0, 5)
    };
  }

  private getPrimaryConcern(weatherData: any): string {
    const current = weatherData.current;
    
    if (current.weather[0].main === 'Snow') return 'Snow conditions';
    if (current.weather[0].main.includes('Rain') && (current.rain?.['1h'] || 0) > 10) return 'Heavy rainfall';
    if (current.visibility < 3000) return 'Poor visibility';
    if (current.wind_speed > 7) return 'Strong winds';
    if (current.rain?.['1h'] || 0 > 5) return 'Heavy precipitation';
    if (current.weather[0].main.includes('Rain')) return 'Wet conditions';
    
    return 'Weather conditions';
  }

  private calculateCenterCoordinates(coordinates: Array<{ lat: number; lng: number }>): { lat: number; lng: number } {
    const sumLat = coordinates.reduce((sum, coord) => sum + coord.lat, 0);
    const sumLng = coordinates.reduce((sum, coord) => sum + coord.lng, 0);
    
    return {
      lat: sumLat / coordinates.length,
      lng: sumLng / coordinates.length
    };
  }

  private mapWeatherTypeToAlertType(weatherType: string): 'weather_warning' | 'route_impact' | 'safety_concern' {
    switch (weatherType.toLowerCase()) {
      case 'storm':
      case 'wind':
        return 'safety_concern';
      case 'rain':
      case 'snow':
        return 'route_impact';
      default:
        return 'weather_warning';
    }
  }

  private mapSeverityLevel(severity: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (severity.toLowerCase()) {
      case 'emergency':
        return 'critical';
      case 'warning':
        return 'high';
      case 'watch':
        return 'medium';
      default:
        return 'low';
    }
  }

  private generateRouteRecommendations(alert: any): string[] {
    const recommendations = [];
    
    switch (alert.weatherType?.toLowerCase()) {
      case 'rain':
        recommendations.push('Allow extra travel time');
        recommendations.push('Use waterproof equipment');
        break;
      case 'wind':
        recommendations.push('Secure loose materials');
        recommendations.push('Avoid outdoor work at height');
        break;
      case 'heat':
        recommendations.push('Schedule work during cooler hours');
        recommendations.push('Ensure adequate hydration');
        break;
      case 'cold':
        recommendations.push('Allow vehicles to warm up');
        recommendations.push('Check for ice on equipment');
        break;
      default:
        recommendations.push('Monitor conditions closely');
        recommendations.push('Follow safety protocols');
    }
    
    return recommendations;
  }
}