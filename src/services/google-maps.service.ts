// src/services/google-maps.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

interface GoogleMapsConfig {
  apiKey: string;
  enabled: boolean;
  geocodingEnabled: boolean;
  directionsEnabled: boolean;
  trafficEnabled: boolean;
}

interface DirectionsResult {
  distance: number; // in kilometers
  duration: number; // in minutes
  polyline?: string;
  steps?: Array<{
    instruction: string;
    distance: number;
    duration: number;
  }>;
}

interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  addressComponents: any;
}

interface DistanceMatrixResult {
  origins: string[];
  destinations: string[];
  distances: number[][]; // in kilometers
  durations: number[][]; // in minutes
}

@Injectable()
export class GoogleMapsService {
  private readonly logger = new Logger(GoogleMapsService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get directions between two points
   */
  async getDirections(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    config: GoogleMapsConfig,
    options?: {
      avoidTolls?: boolean;
      avoidHighways?: boolean;
      optimizeWaypoints?: boolean;
      departureTime?: Date;
    }
  ): Promise<DirectionsResult> {
    if (!config.enabled || !config.directionsEnabled || !config.apiKey) {
      throw new Error('Google Maps Directions API not configured or enabled');
    }

    try {
      const params = new URLSearchParams({
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        key: config.apiKey,
        units: 'metric',
        mode: 'driving'
      });

      // Add optional parameters
      if (options?.avoidTolls) params.append('avoid', 'tolls');
      if (options?.avoidHighways) params.append('avoid', 'highways');
      if (options?.departureTime && config.trafficEnabled) {
        params.append('departure_time', Math.floor(options.departureTime.getTime() / 1000).toString());
        params.append('traffic_model', 'best_guess');
      }

      const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;
      
      const response = await firstValueFrom(
        this.httpService.get(url, { timeout: 10000 })
      );

      if (response.data.status !== 'OK') {
        throw new Error(`Google Maps API error: ${response.data.status}`);
      }

      const route = response.data.routes[0];
      const leg = route.legs[0];

      return {
        distance: leg.distance.value / 1000, // Convert meters to kilometers
        duration: Math.round(leg.duration.value / 60), // Convert seconds to minutes
        polyline: route.overview_polyline?.points,
        steps: leg.steps?.map(step => ({
          instruction: step.html_instructions?.replace(/<[^>]*>/g, ''), // Remove HTML tags
          distance: step.distance.value / 1000,
          duration: Math.round(step.duration.value / 60)
        }))
      };

    } catch (error) {
      this.logger.error(`Error getting directions from Google Maps: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get optimized route for multiple waypoints
   */
  async getOptimizedRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    waypoints: Array<{ lat: number; lng: number }>,
    config: GoogleMapsConfig
  ): Promise<{
    distance: number;
    duration: number;
    optimizedOrder: number[];
    legs: Array<DirectionsResult>;
  }> {
    if (!config.enabled || !config.directionsEnabled || !config.apiKey) {
      throw new Error('Google Maps Directions API not configured or enabled');
    }

    try {
      const params = new URLSearchParams({
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        key: config.apiKey,
        units: 'metric',
        mode: 'driving',
        optimize: 'true'
      });

      if (waypoints.length > 0) {
        const waypointsStr = waypoints.map(wp => `${wp.lat},${wp.lng}`).join('|');
        params.append('waypoints', `optimize:true|${waypointsStr}`);
      }

      const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;
      
      const response = await firstValueFrom(
        this.httpService.get(url, { timeout: 15000 })
      );

      if (response.data.status !== 'OK') {
        throw new Error(`Google Maps API error: ${response.data.status}`);
      }

      const route = response.data.routes[0];
      
      // Extract optimized waypoint order
      const optimizedOrder = route.waypoint_order || [];
      
      // Calculate total distance and duration
      let totalDistance = 0;
      let totalDuration = 0;
      
      const legs: DirectionsResult[] = route.legs.map(leg => {
        const distance = leg.distance.value / 1000;
        const duration = Math.round(leg.duration.value / 60);
        
        totalDistance += distance;
        totalDuration += duration;
        
        return {
          distance,
          duration,
          steps: leg.steps?.map(step => ({
            instruction: step.html_instructions?.replace(/<[^>]*>/g, ''),
            distance: step.distance.value / 1000,
            duration: Math.round(step.duration.value / 60)
          }))
        };
      });

      return {
        distance: totalDistance,
        duration: totalDuration,
        optimizedOrder,
        legs
      };

    } catch (error) {
      this.logger.error(`Error getting optimized route from Google Maps: ${error.message}`);
      throw error;
    }
  }

  /**
   * Geocode an address to coordinates
   */
  async geocodeAddress(
    address: string,
    config: GoogleMapsConfig
  ): Promise<GeocodeResult> {
    if (!config.enabled || !config.geocodingEnabled || !config.apiKey) {
      throw new Error('Google Maps Geocoding API not configured or enabled');
    }

    try {
      const params = new URLSearchParams({
        address: address,
        key: config.apiKey
      });

      const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
      
      const response = await firstValueFrom(
        this.httpService.get(url, { timeout: 10000 })
      );

      if (response.data.status !== 'OK') {
        throw new Error(`Google Maps Geocoding API error: ${response.data.status}`);
      }

      const result = response.data.results[0];
      const location = result.geometry.location;

      return {
        latitude: location.lat,
        longitude: location.lng,
        formattedAddress: result.formatted_address,
        addressComponents: result.address_components
      };

    } catch (error) {
      this.logger.error(`Error geocoding address: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reverse geocode coordinates to address
   */
  async reverseGeocode(
    latitude: number,
    longitude: number,
    config: GoogleMapsConfig
  ): Promise<GeocodeResult> {
    if (!config.enabled || !config.geocodingEnabled || !config.apiKey) {
      throw new Error('Google Maps Geocoding API not configured or enabled');
    }

    try {
      const params = new URLSearchParams({
        latlng: `${latitude},${longitude}`,
        key: config.apiKey
      });

      const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
      
      const response = await firstValueFrom(
        this.httpService.get(url, { timeout: 10000 })
      );

      if (response.data.status !== 'OK') {
        throw new Error(`Google Maps Reverse Geocoding API error: ${response.data.status}`);
      }

      const result = response.data.results[0];

      return {
        latitude,
        longitude,
        formattedAddress: result.formatted_address,
        addressComponents: result.address_components
      };

    } catch (error) {
      this.logger.error(`Error reverse geocoding coordinates: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get distance matrix for multiple origins and destinations
   */
  async getDistanceMatrix(
    origins: Array<{ lat: number; lng: number }>,
    destinations: Array<{ lat: number; lng: number }>,
    config: GoogleMapsConfig,
    options?: {
      departureTime?: Date;
      avoidTolls?: boolean;
      avoidHighways?: boolean;
    }
  ): Promise<DistanceMatrixResult> {
    if (!config.enabled || !config.directionsEnabled || !config.apiKey) {
      throw new Error('Google Maps Distance Matrix API not configured or enabled');
    }

    try {
      const originsStr = origins.map(o => `${o.lat},${o.lng}`).join('|');
      const destinationsStr = destinations.map(d => `${d.lat},${d.lng}`).join('|');

      const params = new URLSearchParams({
        origins: originsStr,
        destinations: destinationsStr,
        key: config.apiKey,
        units: 'metric',
        mode: 'driving'
      });

      // Add optional parameters
      if (options?.avoidTolls) params.append('avoid', 'tolls');
      if (options?.avoidHighways) params.append('avoid', 'highways');
      if (options?.departureTime && config.trafficEnabled) {
        params.append('departure_time', Math.floor(options.departureTime.getTime() / 1000).toString());
        params.append('traffic_model', 'best_guess');
      }

      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`;
      
      const response = await firstValueFrom(
        this.httpService.get(url, { timeout: 15000 })
      );

      if (response.data.status !== 'OK') {
        throw new Error(`Google Maps Distance Matrix API error: ${response.data.status}`);
      }

      const distances: number[][] = [];
      const durations: number[][] = [];

      response.data.rows.forEach((row, i) => {
        distances[i] = [];
        durations[i] = [];
        
        row.elements.forEach((element, j) => {
          if (element.status === 'OK') {
            distances[i][j] = element.distance.value / 1000; // Convert to km
            durations[i][j] = Math.round(element.duration.value / 60); // Convert to minutes
          } else {
            distances[i][j] = -1; // Indicate unavailable route
            durations[i][j] = -1;
          }
        });
      });

      return {
        origins: response.data.origin_addresses,
        destinations: response.data.destination_addresses,
        distances,
        durations
      };

    } catch (error) {
      this.logger.error(`Error getting distance matrix from Google Maps: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate Google Maps configuration
   */
  async validateConfiguration(config: GoogleMapsConfig): Promise<{
    isValid: boolean;
    errors: string[];
    quotaRemaining?: number;
  }> {
    const errors: string[] = [];

    if (!config.apiKey) {
      errors.push('Google Maps API key is required');
    }

    if (!config.enabled) {
      return { isValid: false, errors: ['Google Maps integration is disabled'] };
    }

    // Test API key with a simple geocoding request
    try {
      await this.geocodeAddress('1600 Amphitheatre Parkway, Mountain View, CA', config);
    } catch (error) {
      errors.push(`API key validation failed: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get current traffic conditions for a route
   */
  async getTrafficConditions(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    config: GoogleMapsConfig
  ): Promise<{
    normalDuration: number;
    currentDuration: number;
    trafficDelay: number;
    trafficCondition: 'light' | 'moderate' | 'heavy' | 'severe';
  }> {
    if (!config.enabled || !config.trafficEnabled || !config.apiKey) {
      throw new Error('Google Maps traffic data not available');
    }

    try {
      // Get normal duration without traffic
      const normalRoute = await this.getDirections(origin, destination, config);
      
      // Get current duration with traffic
      const currentRoute = await this.getDirections(origin, destination, config, {
        departureTime: new Date()
      });

      const trafficDelay = currentRoute.duration - normalRoute.duration;
      const delayPercentage = (trafficDelay / normalRoute.duration) * 100;

      let trafficCondition: 'light' | 'moderate' | 'heavy' | 'severe';
      if (delayPercentage < 10) trafficCondition = 'light';
      else if (delayPercentage < 25) trafficCondition = 'moderate';
      else if (delayPercentage < 50) trafficCondition = 'heavy';
      else trafficCondition = 'severe';

      return {
        normalDuration: normalRoute.duration,
        currentDuration: currentRoute.duration,
        trafficDelay,
        trafficCondition
      };

    } catch (error) {
      this.logger.error(`Error getting traffic conditions: ${error.message}`);
      throw error;
    }
  }
}