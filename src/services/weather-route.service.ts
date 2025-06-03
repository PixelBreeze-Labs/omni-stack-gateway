// src/services/weather-route.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business } from '../schemas/business.schema';

interface WeatherData {
  location: {
    lat: number;
    lng: number;
    name: string;
  };
  current: {
    temperature: number; // Celsius
    condition: string;
    humidity: number; // percentage
    windSpeed: number; // km/h
    precipitation: number; // mm
    visibility: number; // km
    uvIndex: number;
  };
  forecast: Array<{
    date: string;
    maxTemp: number;
    minTemp: number;
    condition: string;
    precipitationChance: number; // percentage
    windSpeed: number;
  }>;
  alerts: Array<{
    type: 'severe' | 'moderate' | 'minor';
    title: string;
    description: string;
    startTime: string;
    endTime: string;
  }>;
}

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

/**
 * TODO: FUTURE IMPROVEMENTS FOR WEATHER ROUTE INTEGRATION
 * 
 * Current Implementation: Basic weather data simulation with route impact analysis
 * 
 * Planned Enhancements:
 * - Integration with real weather APIs (OpenWeatherMap, AccuWeather, NOAA)
 * - Real-time weather alerts and push notifications
 * - Historical weather pattern analysis for predictive routing
 * - Machine learning models for weather impact prediction
 * - Integration with traffic systems for weather-related delays
 * - Seasonal route optimization based on weather patterns
 * - Equipment and vehicle recommendations based on weather conditions
 * - Customer communication automation for weather delays
 * - Insurance and liability considerations for weather-related incidents
 * - Integration with IoT sensors for real-time environmental monitoring
 * - Climate change adaptation strategies for long-term planning
 * - Multi-location weather tracking for service area coverage
 * - Weather-based pricing and scheduling optimization
 * - Integration with emergency response systems
 */

@Injectable()
export class WeatherRouteService {
  private readonly logger = new Logger(WeatherRouteService.name);

  constructor(
    @InjectModel(Business.name) private businessModel: Model<Business>,
  ) {}

  // ============================================================================
  // WEATHER DATA AND IMPACT ANALYSIS
  // ============================================================================

  /**
   * Get weather impact for routes
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

      // Get weather data (mock implementation)
      const weatherData = await this.getWeatherData(coordinates, date);
      
      // Analyze impact on routes
      const impact = this.analyzeWeatherImpact(weatherData);

      this.logger.log(`Analyzed weather impact for business ${businessId} at coordinates ${coordinates.lat}, ${coordinates.lng}`);

      return impact;

    } catch (error) {
      this.logger.error(`Error getting weather impact: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Adjust route for weather conditions
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

      // Get weather conditions for route area
      const centerCoordinates = this.calculateCenterCoordinates(routeData.coordinates);
      const weatherData = await this.getWeatherData(centerCoordinates, date);
      const weatherImpact = this.analyzeWeatherImpact(weatherData);

      // Calculate route adjustments
      const adjustment = this.calculateRouteAdjustment(routeData, weatherData, weatherImpact);

      this.logger.log(`Adjusted route for weather conditions: ${adjustment.adjustedRoute.weatherDelay} minutes delay added`);

      return adjustment;

    } catch (error) {
      this.logger.error(`Error adjusting route for weather: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get weather alerts for business areas
   */
  async getWeatherAlerts(businessId: string): Promise<WeatherAlert[]> {
    try {
      const business = await this.validateBusiness(businessId);

      // Get service areas from business metadata
      const serviceAreas = business.metadata?.serviceAreas || [];
      const alerts: WeatherAlert[] = [];

      // Generate weather alerts for each service area
      for (const area of serviceAreas) {
        const areaAlerts = await this.generateAreaWeatherAlerts(businessId, area);
        alerts.push(...areaAlerts);
      }

      // Add general business-wide alerts
      const generalAlerts = await this.generateGeneralWeatherAlerts(businessId);
      alerts.push(...generalAlerts);

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
   * Update weather data for business
   */
  async updateWeatherData(businessId: string): Promise<{ success: boolean; message: string; lastUpdated: string }> {
    try {
      const business = await this.validateBusiness(businessId);

      // Get all relevant locations (service areas, active routes)
      const locations = this.extractBusinessLocations(business);
      
      // Fetch weather data for all locations
      const weatherUpdates = [];
      for (const location of locations) {
        const weatherData = await this.getWeatherData(location.coordinates);
        weatherUpdates.push({
          locationId: location.id,
          locationName: location.name,
          weatherData,
          updatedAt: new Date().toISOString()
        });
      }

      // Store weather data in business metadata
      if (!business.metadata) business.metadata = {};
      business.metadata.weatherData = {
        locations: weatherUpdates,
        lastUpdated: new Date().toISOString()
      };

      business.markModified('metadata');
      await business.save();

      this.logger.log(`Updated weather data for ${locations.length} locations for business ${businessId}`);

      return {
        success: true,
        message: `Weather data updated for ${locations.length} locations`,
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
   * Get weather data (mock implementation)
   */
  private async getWeatherData(
    coordinates: { lat: number; lng: number },
    date?: string
  ): Promise<WeatherData> {
    // Mock weather data - replace with real API integration
    const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Heavy Rain', 'Snow', 'Fog'];
    const currentCondition = conditions[Math.floor(Math.random() * conditions.length)];

    // Simulate weather conditions based on condition
    let temperature = 20 + Math.random() * 15; // 20-35°C
    let precipitation = 0;
    let windSpeed = 5 + Math.random() * 15; // 5-20 km/h
    let visibility = 10;

    if (currentCondition.includes('Rain')) {
      precipitation = currentCondition.includes('Heavy') ? 10 + Math.random() * 20 : 2 + Math.random() * 8;
      visibility = currentCondition.includes('Heavy') ? 2 + Math.random() * 3 : 5 + Math.random() * 5;
      windSpeed += 5;
    }

    if (currentCondition === 'Snow') {
      temperature = -5 + Math.random() * 10; // -5 to 5°C
      precipitation = 5 + Math.random() * 15;
      visibility = 1 + Math.random() * 4;
      windSpeed += 10;
    }

    if (currentCondition === 'Fog') {
      visibility = 0.5 + Math.random() * 2;
      temperature -= 5;
    }

    const weatherData: WeatherData = {
      location: {
        lat: coordinates.lat,
        lng: coordinates.lng,
        name: `Location ${coordinates.lat.toFixed(2)}, ${coordinates.lng.toFixed(2)}`
      },
      current: {
        temperature: Math.round(temperature),
        condition: currentCondition,
        humidity: Math.round(40 + Math.random() * 40), // 40-80%
        windSpeed: Math.round(windSpeed),
        precipitation: Math.round(precipitation * 10) / 10,
        visibility: Math.round(visibility * 10) / 10,
        uvIndex: Math.floor(Math.random() * 11) // 0-10
      },
      forecast: this.generateWeatherForecast(currentCondition, temperature),
      alerts: this.generateWeatherAlerts(currentCondition, windSpeed, precipitation)
    };

    return weatherData;
  }

  /**
   * Generate weather forecast
   */
  private generateWeatherForecast(currentCondition: string, currentTemp: number): any[] {
    const forecast = [];
    const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Heavy Rain'];
    
    for (let i = 1; i <= 5; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      
      forecast.push({
        date: date.toISOString().split('T')[0],
        maxTemp: Math.round(currentTemp + (Math.random() - 0.5) * 8),
        minTemp: Math.round(currentTemp - 5 + (Math.random() - 0.5) * 6),
        condition: conditions[Math.floor(Math.random() * conditions.length)],
        precipitationChance: Math.floor(Math.random() * 100),
        windSpeed: Math.round(5 + Math.random() * 15)
      });
    }
    
    return forecast;
  }

  /**
   * Generate weather alerts
   */
  private generateWeatherAlerts(condition: string, windSpeed: number, precipitation: number): any[] {
    const alerts = [];

    if (condition.includes('Heavy Rain') || precipitation > 15) {
      alerts.push({
        type: 'severe',
        title: 'Heavy Rain Warning',
        description: 'Heavy rainfall may cause flooding and reduced visibility',
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() // 4 hours
      });
    }

    if (windSpeed > 25) {
      alerts.push({
        type: 'moderate',
        title: 'High Wind Advisory',
        description: 'Strong winds may affect vehicle stability and safety',
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString() // 6 hours
      });
    }

    if (condition === 'Snow') {
      alerts.push({
        type: 'severe',
        title: 'Snow Warning',
        description: 'Snow conditions may make roads impassable',
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() // 12 hours
      });
    }

    if (condition === 'Fog') {
      alerts.push({
        type: 'moderate',
        title: 'Dense Fog Advisory',
        description: 'Severely reduced visibility conditions',
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString() // 3 hours
      });
    }

    return alerts;
  }

  /**
   * Analyze weather impact on routes
   */
  private analyzeWeatherImpact(weatherData: WeatherData): WeatherImpact {
    const current = weatherData.current;
    let riskLevel: 'low' | 'medium' | 'high' | 'extreme' = 'low';
    let safetyScore = 100;

    // Analyze visibility impact
    const visibilityImpact = this.analyzeVisibilityImpact(current.visibility);
    
    // Analyze precipitation impact
    const precipitationImpact = this.analyzePrecipitationImpact(current.precipitation, current.condition);
    
    // Analyze wind impact
    const windImpact = this.analyzeWindImpact(current.windSpeed);
    
    // Analyze temperature impact
    const temperatureImpact = this.analyzeTemperatureImpact(current.temperature);

    // Calculate overall risk level
    const impacts = [visibilityImpact, precipitationImpact, windImpact, temperatureImpact];
    const highImpacts = impacts.filter(impact => impact.level === 'high').length;
    const mediumImpacts = impacts.filter(impact => impact.level === 'medium').length;

    if (highImpacts >= 2 || current.condition === 'Snow') {
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
   * Analyze visibility impact
   */
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

  /**
   * Analyze precipitation impact
   */
  private analyzePrecipitationImpact(precipitation: number, condition: string): { level: string; impact: string } {
    if (condition === 'Snow' || precipitation > 15) {
      return { level: 'high', impact: 'Heavy precipitation - significant delays expected' };
    } else if (condition.includes('Heavy Rain') || precipitation > 8) {
      return { level: 'medium', impact: 'Moderate precipitation - some delays possible' };
    } else if (precipitation > 2) {
      return { level: 'low', impact: 'Light precipitation - minimal impact' };
    } else {
      return { level: 'none', impact: 'No precipitation - no impact on routes' };
    }
  }

  /**
   * Analyze wind impact
   */
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

  /**
   * Analyze temperature impact
   */
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

  /**
   * Generate weather recommendations
   */
  private generateWeatherRecommendations(weatherData: WeatherData, riskLevel: string): string[] {
    const recommendations = [];
    const current = weatherData.current;

    if (riskLevel === 'extreme') {
      recommendations.push('Consider postponing non-critical routes');
      recommendations.push('Ensure all vehicles have emergency equipment');
      recommendations.push('Maintain constant communication with field teams');
    }

    if (current.condition.includes('Rain') || current.precipitation > 5) {
      recommendations.push('Reduce driving speeds by 20-30%');
      recommendations.push('Increase following distances');
      recommendations.push('Check vehicle tire conditions');
    }

    if (current.condition === 'Snow') {
      recommendations.push('Use winter tires or chains where required');
      recommendations.push('Carry emergency supplies (blankets, food, water)');
      recommendations.push('Allow extra time for all routes');
    }

    if (current.visibility < 3) {
      recommendations.push('Use fog lights and hazard lights when necessary');
      recommendations.push('Reduce speeds significantly');
      recommendations.push('Consider alternate routes with better visibility');
    }

    if (current.windSpeed > 25) {
      recommendations.push('Secure all loose equipment and materials');
      recommendations.push('Be cautious of high-sided vehicles');
      recommendations.push('Avoid exposed routes where possible');
    }

    recommendations.push('Monitor weather updates regularly');
    recommendations.push('Inform customers of potential delays');

    return recommendations.slice(0, 8); // Limit to 8 recommendations
  }

  /**
   * Generate route adjustments
   */
  private generateRouteAdjustments(weatherData: WeatherData, riskLevel: string): any {
    let suggestedDelays = 0;
    const alternativeTimeWindows = [];
    const equipmentRecommendations = [];

    // Calculate delays based on conditions
    if (weatherData.current.condition.includes('Rain')) {
      suggestedDelays += weatherData.current.condition.includes('Heavy') ? 30 : 15;
    }

    if (weatherData.current.condition === 'Snow') {
      suggestedDelays += 60;
    }

    if (weatherData.current.visibility < 3) {
      suggestedDelays += 20;
    }

    if (weatherData.current.windSpeed > 25) {
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

    // Equipment recommendations
    if (weatherData.current.condition.includes('Rain')) {
      equipmentRecommendations.push('Waterproof equipment covers');
      equipmentRecommendations.push('Non-slip footwear');
    }

    if (weatherData.current.condition === 'Snow') {
      equipmentRecommendations.push('Winter tires or chains');
      equipmentRecommendations.push('De-icing equipment');
      equipmentRecommendations.push('Emergency warming supplies');
    }

    if (weatherData.current.visibility < 5) {
      equipmentRecommendations.push('High-visibility safety vests');
      equipmentRecommendations.push('Portable lighting equipment');
    }

    return {
      suggestedDelays,
      alternativeTimeWindows: alternativeTimeWindows.slice(0, 3),
      equipmentRecommendations: equipmentRecommendations.slice(0, 5)
    };
  }

  /**
   * Calculate route adjustment
   */
  private calculateRouteAdjustment(
    routeData: any,
    weatherData: WeatherData,
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
        taskIds: routeData.taskIds, // Same tasks, adjusted timing
        estimatedTime: adjustedTime,
        estimatedDistance: adjustedDistance,
        weatherDelay
      },
      weatherFactors: {
        primaryConcern: this.getPrimaryConcern(weatherData),
        impactLevel: weatherImpact.riskLevel,
        adjustmentReason: `${weatherDelay} minute delay due to ${weatherData.current.condition.toLowerCase()} conditions`
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

  /**
   * Get primary weather concern
   */
  private getPrimaryConcern(weatherData: WeatherData): string {
    const current = weatherData.current;
    
    if (current.condition === 'Snow') return 'Snow conditions';
    if (current.condition.includes('Heavy Rain')) return 'Heavy rainfall';
    if (current.visibility < 3) return 'Poor visibility';
    if (current.windSpeed > 25) return 'Strong winds';
    if (current.precipitation > 10) return 'Heavy precipitation';
    if (current.condition.includes('Rain')) return 'Wet conditions';
    
    return 'Weather conditions';
  }

  /**
   * Calculate center coordinates
   */
  private calculateCenterCoordinates(coordinates: Array<{ lat: number; lng: number }>): { lat: number; lng: number } {
    const sumLat = coordinates.reduce((sum, coord) => sum + coord.lat, 0);
    const sumLng = coordinates.reduce((sum, coord) => sum + coord.lng, 0);
    
    return {
      lat: sumLat / coordinates.length,
      lng: sumLng / coordinates.length
    };
  }

  /**
   * Generate area weather alerts
   */
  private async generateAreaWeatherAlerts(businessId: string, area: any): Promise<WeatherAlert[]> {
    // Mock implementation - would get real weather data for area
    const alerts: WeatherAlert[] = [];
    
    // Simulate random weather events
    if (Math.random() < 0.3) { // 30% chance of weather alert per area
      const alertTypes = ['weather_warning', 'route_impact', 'safety_concern'];
      const severities = ['low', 'medium', 'high'];
      
      alerts.push({
        id: `alert-${Date.now()}-${area.id}`,
        businessId,
        alertType: alertTypes[Math.floor(Math.random() * alertTypes.length)] as any,
        severity: severities[Math.floor(Math.random() * severities.length)] as any,
        title: `Weather Alert for ${area.name}`,
        message: 'Potential weather impact detected in service area',
        affectedAreas: [area.id],
        affectedRoutes: [], // Would be populated with actual route data
        recommendations: ['Monitor conditions closely', 'Consider route adjustments'],
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6 hours
        createdAt: new Date().toISOString()
      });
    }
    
    return alerts;
  }

  /**
   * Generate general weather alerts
   */
  private async generateGeneralWeatherAlerts(businessId: string): Promise<WeatherAlert[]> {
    const alerts: WeatherAlert[] = [];
    
    // Add seasonal or general alerts
    const currentMonth = new Date().getMonth();
    
    if (currentMonth >= 11 || currentMonth <= 2) { // Winter months
      alerts.push({
        id: `general-winter-${Date.now()}`,
        businessId,
        alertType: 'safety_concern',
        severity: 'medium',
        title: 'Winter Weather Advisory',
        message: 'Winter conditions may affect route safety and timing',
        affectedAreas: ['all'],
        affectedRoutes: ['all'],
        recommendations: [
          'Ensure vehicles have winter equipment',
          'Allow extra time for routes',
          'Monitor weather forecasts daily'
        ],
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        createdAt: new Date().toISOString()
      });
    }
    
    return alerts;
  }

  /**
   * Extract business locations for weather monitoring
   */
  private extractBusinessLocations(business: any): Array<{ id: string; name: string; coordinates: { lat: number; lng: number } }> {
    const locations = [];
    
    // Add service areas
    const serviceAreas = business.metadata?.serviceAreas || [];
    serviceAreas.forEach((area: any) => {
      if (area.coverage?.boundaries?.coordinates?.length > 0) {
        const centerCoords = this.calculateCenterCoordinates(area.coverage.boundaries.coordinates);
        locations.push({
          id: area.id,
          name: area.name,
          coordinates: centerCoords
        });
      }
    });
    
    // Add headquarters location (default)
    if (locations.length === 0) {
      locations.push({
        id: 'headquarters',
        name: 'Business Headquarters',
        coordinates: { lat: 40.7128, lng: -74.0060 } // Default to NYC
      });
    }
    
    return locations;
  }
}