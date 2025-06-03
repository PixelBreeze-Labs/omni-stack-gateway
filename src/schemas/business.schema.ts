// src/schemas/business.schema.ts (Updated with Teams)
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Currency } from '../enums/currency.enum';

export enum AgentFeatureFlag {
    AUTO_ASSIGNMENT_AGENT = 'auto_assignment_agent',
    COMPLIANCE_MONITORING_AGENT = 'compliance_monitoring_agent',
    REPORT_GENERATION_AGENT = 'report_generation_agent',
    CLIENT_COMMUNICATION_AGENT = 'client_communication_agent',
    RESOURCE_REQUEST_AGENT = 'resource_request_agent',
    SHIFT_OPTIMIZATION_AGENT = 'shift_optimization_agent'
}

export enum BusinessOperationType {
    FIELD_SERVICE = 'field_service',
    IN_HOUSE = 'in_house',
    HYBRID = 'hybrid'
}

export interface RouteAeraConfiguration {
    name: string;
    type: 'circle' | 'polygon';
    coordinates: Array<{ lat: number; lng: number }>;
    radius?: number; // for circle type, in meters
    allowedTeams?: string[]; // team IDs that can service this area
  }

  export interface RoutePlanningConfiguration {
    enabled: boolean;
    defaultOptimizationParams: {
      prioritizeTime: boolean;
      prioritizeFuel: boolean;
      prioritizeCustomerPreference: boolean;
      maxRouteTime: number; // minutes
      maxStopsPerRoute: number;
      allowOvertime: boolean;
      considerTraffic: boolean;
      considerWeather: boolean;
      skillMatching: boolean;
      balanceWorkload: boolean;
    };
    integrations: {
      googleMaps: { 
        apiKey?: string; 
        enabled: boolean;
        geocodingEnabled: boolean;
        directionsEnabled: boolean;
        trafficEnabled: boolean;
      };
      weatherApi: { 
        enabled: boolean;
        considerInRouting: boolean;
        delayThresholds: {
          rain: number; // mm
          snow: number; // cm
          wind: number; // km/h
          temperature: { min: number; max: number }; // celsius
        };
      };
    };
    workingHours: { 
      start: string; // HH:MM
      end: string;   // HH:MM
      timezone: string;
      allowEarlyStart: boolean;
      allowLateFinish: boolean;
    };
    serviceRadius: number; // km - maximum distance from base
    allowOvertimeRoutes: boolean;
    maxDailyTasksPerTeam: number;
    automaticOptimization: {
      enabled: boolean;
      scheduleTime: string; // HH:MM - when to run daily optimization
      advanceDays: number; // how many days ahead to optimize
    };
    notifications: {
      routeAssigned: boolean;
      routeStarted: boolean;
      taskCompleted: boolean;
      delays: boolean;
      weatherAlerts: boolean;
    };
    serviceAreas: RouteAeraConfiguration[];
  }
  
  // Enhanced Team interface for route planning
  export interface EnhancedTeam {
    id: string;
    name: string;
    
    // Enhanced location and tracking
    currentLocation?: { 
      lat: number; 
      lng: number; 
      timestamp: Date;
      accuracy?: number; // meters
      isManualUpdate?: boolean;
    };
    
    // Working schedule
    workingHours: { 
      start: string; // HH:MM
      end: string;   // HH:MM
      timezone: string;
      breakDuration?: number; // minutes
      lunchBreak?: {
        start: string; // HH:MM
        end: string;   // HH:MM
      };
    };
    
    // Vehicle information for route planning
    vehicleInfo: {
      type: string; // 'van', 'truck', 'car', 'motorcycle', 'bicycle'
      licensePlate?: string;
      capacity: number; // maximum items/weight
      fuelType: 'gasoline' | 'diesel' | 'electric' | 'hybrid';
      avgFuelConsumption: number; // L/100km or kWh/100km
      maxRange: number; // km
      currentFuelLevel?: number; // percentage
      maintenanceStatus: 'good' | 'needs_service' | 'out_of_service';
      gpsEnabled: boolean;
    };
    
    // Service capabilities
    serviceAreas: Array<{
      name: string;
      type: 'circle' | 'polygon';
      coordinates: Array<{ lat: number; lng: number }>;
      radius?: number; // for circle type, in meters
      priority: number; // 1-5, higher = preferred
    }>;
    
    skills: string[];
    equipment: string[];
    certifications: string[];
    
    // Team status and availability
    isActive: boolean;
    isAvailableForRouting: boolean;
    maxDailyTasks: number;
    maxRouteDistance: number; // km
    
    // Performance metrics
    performanceMetrics: {
      averageTasksPerDay: number;
      onTimePerformance: number; // percentage
      customerRating: number; // 1-5
      fuelEfficiency: number; // actual vs target
      lastPerformanceUpdate: Date;
    };
    
    // Emergency and contact info
    emergencyContact: {
      name: string;
      phone: string;
      relationship: string;
    };
    
    lastLocationUpdate?: Date;
    
    // Metadata and creation info
    metadata: any;
    createdAt?: Date;
    updatedAt?: Date;
  }

export enum BusinessType {
    // Companies
    CORPORATION = 'corporation',
    PRIVATE_COMPANY = 'private_company',
    PUBLIC_COMPANY = 'public_company',
    LLC = 'llc',

    // Partnerships
    PARTNERSHIP = 'partnership',
    LIMITED_PARTNERSHIP = 'limited_partnership',
    GENERAL_PARTNERSHIP = 'general_partnership',

    // Individual Ownership
    SOLE_PROPRIETORSHIP = 'sole_proprietorship',
    SOLO_OWNERSHIP = 'solo_ownership',
    FREELANCER = 'freelancer',

    // Special Types
    STARTUP = 'startup',
    NONPROFIT = 'nonprofit',
    COOPERATIVE = 'cooperative',

    // Regional Types
    PLC = 'plc',                    // Public Limited Company (UK)
    LTD = 'ltd',                    // Limited Company (UK)
    GMBH = 'gmbh',                  // German Company Type
    SARL = 'sarl',                  // French Company Type

    // Other Categories
    FRANCHISE = 'franchise',
    FAMILY_BUSINESS = 'family_business',
    JOINT_VENTURE = 'joint_venture',
    OTHER = 'other'
}

// Business Industry Categories for Skills
export enum BusinessIndustry {
    RESTAURANT = 'restaurant',
    HOTEL = 'hotel',
    RETAIL = 'retail',
    HEALTHCARE = 'healthcare',
    MANUFACTURING = 'manufacturing',
    CONSTRUCTION = 'construction',
    CLEANING_SERVICE = 'cleaning_service',
    TRANSPORTATION = 'transportation',
    EDUCATION = 'education',
    TECHNOLOGY = 'technology',
    FINANCE = 'finance',
    REAL_ESTATE = 'real_estate',
    ENTERTAINMENT = 'entertainment',
    FITNESS = 'fitness',
    BEAUTY_WELLNESS = 'beauty_wellness',
    AUTOMOTIVE = 'automotive',
    AGRICULTURE = 'agriculture',
    OTHER = 'other'
}

// Business Sub-categories for more specific skills
export enum BusinessSubCategory {
    // Restaurant subcategories
    FINE_DINING = 'fine_dining',
    FAST_FOOD = 'fast_food',
    CASUAL_DINING = 'casual_dining',
    CAFE = 'cafe',
    BAR_PUB = 'bar_pub',
    FOOD_TRUCK = 'food_truck',
    CATERING = 'catering',
    
    // Hotel subcategories
    LUXURY_HOTEL = 'luxury_hotel',
    BOUTIQUE_HOTEL = 'boutique_hotel',
    BUSINESS_HOTEL = 'business_hotel',
    RESORT = 'resort',
    MOTEL = 'motel',
    BED_BREAKFAST = 'bed_breakfast',
    
    // Retail subcategories
    GROCERY_STORE = 'grocery_store',
    CLOTHING_STORE = 'clothing_store',
    ELECTRONICS_STORE = 'electronics_store',
    DEPARTMENT_STORE = 'department_store',
    SPECIALTY_STORE = 'specialty_store',
    
    // Add more as needed
    OTHER = 'other'
}

export enum SubscriptionStatus {
    ACTIVE = 'active',
    PAST_DUE = 'past_due',
    CANCELED = 'canceled',
    INCOMPLETE = 'incomplete',
    TRIALING = 'trialing'
}

// Skill requirement levels
export enum SkillRequirementLevel {
    REQUIRED = 'required',           // Must have this skill
    PREFERRED = 'preferred',         // Nice to have
    OPTIONAL = 'optional',           // Can be learned on the job
    RESTRICTED = 'restricted'        // Only certain roles can have this
}

// Skill data structure for business requirements
export interface BusinessSkillRequirement {
    name: string;
    level: SkillRequirementLevel;
    minimumProficiency: 'novice' | 'intermediate' | 'advanced' | 'expert';
    applicableRoles: string[];       // Which roles need this skill
    department?: string;             // Department-specific skill
    description?: string;
    customWeight?: number;           // How important is this skill (1-10)
}

@Schema({ timestamps: true })
export class Business extends Document {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Client' })
    clientId: string;

    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
    adminUserId: string;

    @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }] })
    userIds: string[];

    @Prop({
        type: String,
        enum: BusinessType,
        required: true
    })
    type: BusinessType;

    // NEW: Industry and subcategory for skill inference
    @Prop({
        type: String,
        enum: BusinessIndustry,
        required: true
    })
    industry: BusinessIndustry;

    @Prop({
        type: String,
        enum: BusinessSubCategory,
        default: BusinessSubCategory.OTHER
    })
    subCategory: BusinessSubCategory;

    @Prop({ type: MongooseSchema.Types.Mixed })
    routePlanningConfig: RoutePlanningConfiguration;

    @Prop({ required: true })
    email: string;

    @Prop()
    phone?: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Address' })
    addressId?: string;

    @Prop({ type: String, enum: Currency, default: Currency.USD })
    currency: Currency;

    @Prop({ type: String, default: '' })
    apiKey: string;

    // Stripe Related Fields
    @Prop()
    stripeCustomerId?: string;

    @Prop()
    stripeSubscriptionId?: string;

    @Prop({
        type: String,
        enum: SubscriptionStatus,
        default: SubscriptionStatus.INCOMPLETE
    })
    subscriptionStatus: SubscriptionStatus;

    @Prop({ type: Date })
    subscriptionEndDate?: Date;

    @Prop({ type: MongooseSchema.Types.Mixed })
    subscriptionDetails?: {
        planId: string;
        priceId: string;
        interval: 'month' | 'year';
        amount: number;
        currency: Currency;
    };

    @Prop({ type: String, enum: BusinessOperationType, default: BusinessOperationType.HYBRID })
    operationType: BusinessOperationType;

    @Prop({ type: [String], enum: Object.values(AgentFeatureFlag), default: [] })
    includedFeatures: AgentFeatureFlag[];

    // Employee capability flags
    @Prop({ type: Boolean, default: true })
    allow_clockinout: boolean;

    @Prop({ type: Boolean, default: true })
    has_app_access: boolean;

    @Prop({ type: Boolean, default: true })
    allow_checkin: boolean;

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ type: Map, of: String, default: {} })
    metadata: Map<string, any>;

    // For VAT/Tax purposes
    @Prop()
    taxId?: string;

    @Prop()
    vatNumber?: string;

    // Soft delete fields
    @Prop({ default: false })
    isDeleted: boolean;

    @Prop({ type: Date })
    deletedAt?: Date;

    @Prop({ type: MongooseSchema.Types.Mixed })
    externalIds?: {
        venueBoostId?: string;
        [key: string]: string;
    };

    // NEW: Skills Management
    @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
    skillRequirements: BusinessSkillRequirement[];

    @Prop({ type: [String], default: [] })
    customSkills: string[];                    // Custom skills defined by business

    @Prop({ type: Boolean, default: true })
    autoInferSkills: boolean;                  // Auto-infer skills based on industry/role

    @Prop({ type: Boolean, default: true })
    requireSkillApproval: boolean;             // Require manual approval of inferred skills

    @Prop({ type: MongooseSchema.Types.Mixed })
    skillsConfiguration: {
        enablePerformanceTracking?: boolean;    // Track skills through task performance
        enablePeerReviews?: boolean;            // Allow peer skill assessments
        enableSelfAssessment?: boolean;         // Allow employees to self-assess
        skillDecayMonths?: number;              // How many months before skills "decay" without use
        mandatorySkillsReview?: boolean;        // Require periodic review of all skills
        reviewFrequencyMonths?: number;         // How often to review skills
    };

    @Prop({ 
        type: [{
          id: { type: String, required: true },
          name: { type: String, required: true },
          requiredSkills: { type: [String], default: [] },
          optionalSkills: { type: [String], default: [] },
          skillWeights: { type: MongooseSchema.Types.Mixed, default: {} },
          metadata: { type: MongooseSchema.Types.Mixed, default: {} },
          createdAt: { type: Date, default: Date.now },
          updatedAt: { type: Date, default: Date.now }
        }], 
        default: [] 
      })
      departments: {
        id: string;
        name: string;
        requiredSkills: string[];
        optionalSkills: string[];
        skillWeights: Record<string, number>;
        metadata: any;
        createdAt?: Date;
        updatedAt?: Date;
      }[];

    // NEW: Teams Management (simple structure - just name and metadata)
    @Prop({ 
        type: [{
          id: { type: String, required: true },
          name: { type: String, required: true },
          metadata: { type: MongooseSchema.Types.Mixed, default: {} },
          createdAt: { type: Date, default: Date.now },
          updatedAt: { type: Date, default: Date.now }
        }], 
        default: [] 
      })
      @Prop({ 
    type: [{
      id: { type: String, required: true },
      name: { type: String, required: true },
      
      // Enhanced location and tracking
      currentLocation: {
        lat: { type: Number },
        lng: { type: Number },
        timestamp: { type: Date },
        accuracy: { type: Number },
        isManualUpdate: { type: Boolean, default: false }
      },
      
      // Working schedule
      workingHours: {
        start: { type: String, required: true }, // HH:MM
        end: { type: String, required: true },   // HH:MM
        timezone: { type: String, required: true },
        breakDuration: { type: Number, default: 30 }, // minutes
        lunchBreak: {
          start: { type: String }, // HH:MM
          end: { type: String }     // HH:MM
        }
      },
      
      // Vehicle information
      vehicleInfo: {
        type: { type: String, required: true },
        licensePlate: { type: String },
        capacity: { type: Number, required: true },
        fuelType: { 
          type: String, 
          enum: ['gasoline', 'diesel', 'electric', 'hybrid'],
          required: true 
        },
        avgFuelConsumption: { type: Number, required: true },
        maxRange: { type: Number, required: true },
        currentFuelLevel: { type: Number },
        maintenanceStatus: { 
          type: String, 
          enum: ['good', 'needs_service', 'out_of_service'],
          default: 'good'
        },
        gpsEnabled: { type: Boolean, default: true }
      },
      
      // Service capabilities
      serviceAreas: [{
        name: { type: String, required: true },
        type: { type: String, enum: ['circle', 'polygon'], required: true },
        coordinates: [{ 
          lat: { type: Number, required: true }, 
          lng: { type: Number, required: true } 
        }],
        radius: { type: Number },
        priority: { type: Number, min: 1, max: 5, default: 3 }
      }],
      
      skills: { type: [String], default: [] },
      equipment: { type: [String], default: [] },
      certifications: { type: [String], default: [] },
      
      // Team status
      isActive: { type: Boolean, default: true },
      isAvailableForRouting: { type: Boolean, default: true },
      maxDailyTasks: { type: Number, default: 8 },
      maxRouteDistance: { type: Number, default: 200 }, // km
      
      // Performance metrics
      performanceMetrics: {
        averageTasksPerDay: { type: Number, default: 0 },
        onTimePerformance: { type: Number, default: 100 },
        customerRating: { type: Number, default: 5 },
        fuelEfficiency: { type: Number, default: 100 },
        lastPerformanceUpdate: { type: Date, default: Date.now }
      },
      
      // Emergency contact
      emergencyContact: {
        name: { type: String },
        phone: { type: String },
        relationship: { type: String }
      },
      
      lastLocationUpdate: { type: Date },
      metadata: { type: MongooseSchema.Types.Mixed, default: {} },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    }], 
    default: [] 
  })
  teams: EnhancedTeam[];

  // NEW: Route Planning Statistics and Caching
  @Prop({ type: MongooseSchema.Types.Mixed })
  routePlanningStats: {
    totalRoutesCreated: number;
    totalTasksOptimized: number;
    totalDistanceSaved: number; // km
    totalTimeSaved: number; // hours
    totalFuelSaved: number; // liters or kWh
    averageOptimizationScore: number;
    lastOptimizationDate: Date;
    monthlyStats: Array<{
      month: string; // YYYY-MM
      routesCreated: number;
      tasksCompleted: number;
      distanceSaved: number;
      timeSaved: number;
      fuelSaved: number;
    }>;
  };

  // NEW: Base Location for Distance Calculations
  @Prop({ type: MongooseSchema.Types.Mixed })
  baseLocation: {
    latitude: number;
    longitude: number;
    address: string;
    name: string; // e.g., "Main Office", "Warehouse"
    timezone: string;
  };

}

export const BusinessSchema = SchemaFactory.createForClass(Business);

// Add indexes
BusinessSchema.index({ clientId: 1 });
BusinessSchema.index({ adminUserId: 1 });
BusinessSchema.index({ stripeCustomerId: 1 });
BusinessSchema.index({ subscriptionStatus: 1 });
BusinessSchema.index({ industry: 1 });
BusinessSchema.index({ subCategory: 1 });
BusinessSchema.index({ 'skillRequirements.name': 1 });
BusinessSchema.index({ 'teams.name': 1 });
BusinessSchema.index({ 'routePlanningConfig.enabled': 1 });
BusinessSchema.index({ 'teams.isAvailableForRouting': 1 });
BusinessSchema.index({ 'teams.currentLocation.lat': 1, 'teams.currentLocation.lng': 1 });
BusinessSchema.index({ 'teams.skills': 1 });
BusinessSchema.index({ 'teams.vehicleInfo.type': 1 });
BusinessSchema.index({ 'baseLocation.latitude': 1, 'baseLocation.longitude': 1 });

BusinessSchema.virtual('address', {
    ref: 'Address',
    localField: 'addressId',
    foreignField: '_id',
    justOne: true
});