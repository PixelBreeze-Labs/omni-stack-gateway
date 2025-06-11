// src/schemas/app-project.schema.ts (Updated)
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

// Define the WeatherDelay interface
interface WeatherDelay {
  date: Date;
  hours: number;
  reason: string;
  weatherType: string;
  notes?: string;
  createdAt: Date;
}

interface ClientInfo {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

// User assignment interface for detailed tracking
interface UserAssignment {
  userId: string;
  role?: string; // 'project_manager', 'team_leader', 'member', 'supervisor'
  assignedAt: Date;
  assignedBy: string; // User ID who made the assignment
  isActive: boolean;
  metadata?: {
    hourlyRate?: number;
    specializations?: string[];
    accessLevel?: string;
    notes?: string;
    [key: string]: any;
  };
}

// Team assignment interface
interface TeamAssignment {
  teamId: string; // References business.teams[].id
  teamName: string; // Cached for quick access
  assignedAt: Date;
  assignedBy: string;
  isActive: boolean;
  role?: string; // 'primary', 'support', 'specialist'
  metadata?: {
    estimatedHours?: number;
    primaryResponsibilities?: string[];
    notes?: string;
    [key: string]: any;
  };
}

@Schema({ timestamps: true })
export class AppProject extends Document {
  @Prop({ required: true })
  name: string;
  
  @Prop()
  description: string;
  
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;
  
  @Prop({ type: String })
  clientId: string;
  
  @Prop({ type: String })
  status: string;
  
  @Prop({ type: Object, default: {} })
  externalIds: {
    venueBoostProjectId?: string;
    [key: string]: string;
  };

  // SIMPLE USER ASSIGNMENTS (for quick queries)
  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }], default: [] })
  assignedUsers: string[];

  // DETAILED USER ASSIGNMENTS (with metadata)
  @Prop({ 
    type: [{
      userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
      role: { type: String }, // 'project_manager', 'team_leader', 'member', 'supervisor'
      assignedAt: { type: Date, default: Date.now },
      assignedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
      isActive: { type: Boolean, default: true },
      metadata: { type: MongooseSchema.Types.Mixed, default: {} }
    }], 
    default: [] 
  })
  userAssignments: UserAssignment[];

  // SIMPLE TEAM ASSIGNMENTS (for quick queries)
  @Prop({ type: [String], default: [] }) // Array of team IDs from business.teams[]
  assignedTeams: string[];

  // DETAILED TEAM ASSIGNMENTS (with metadata)
  @Prop({ 
    type: [{
      teamId: { type: String, required: true }, // References business.teams[].id
      teamName: { type: String, required: true }, // Cached team name
      assignedAt: { type: Date, default: Date.now },
      assignedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
      isActive: { type: Boolean, default: true },
      role: { type: String }, // 'primary', 'support', 'specialist'
      metadata: { type: MongooseSchema.Types.Mixed, default: {} }
    }], 
    default: [] 
  })
  teamAssignments: TeamAssignment[];
  
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: {
    status?: string;
    projectType?: string;
    lastSyncedAt?: Date;
    estimatedHours?: number;
    estimatedBudget?: number;
    startDate?: Date;
    endDate?: Date;
    location?: {
      latitude: number;
      longitude: number;
      address?: string;
      city?: string;
      state?: string;
      country?: string;
    };
    clientInfo?: ClientInfo;
    weatherDelays?: WeatherDelay[];
    totalWeatherDelayHours?: number;
    
    // PROJECT ASSIGNMENT SUMMARY (for quick stats)
    assignmentSummary?: {
      totalUsers: number;
      totalTeams: number;
      projectManagerId?: string;
      teamLeaderIds?: string[];
      lastAssignmentUpdate: Date;
    };
    
    [key: string]: any;
  };
  
  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;
  
  @Prop({ type: Date })
  deletedAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;

  @Prop({ type: Date })
  createdAt?: Date;
}

export const AppProjectSchema = SchemaFactory.createForClass(AppProject);

// Add indexes for assignments
AppProjectSchema.index({ businessId: 1 });
AppProjectSchema.index({ assignedUsers: 1 });
AppProjectSchema.index({ assignedTeams: 1 });
AppProjectSchema.index({ 'userAssignments.userId': 1 });
AppProjectSchema.index({ 'userAssignments.role': 1 });
AppProjectSchema.index({ 'userAssignments.isActive': 1 });
AppProjectSchema.index({ 'teamAssignments.teamId': 1 });
AppProjectSchema.index({ 'teamAssignments.isActive': 1 });
AppProjectSchema.index({ 'externalIds.venueBoostProjectId': 1 });
AppProjectSchema.index({ status: 1 });
AppProjectSchema.index({ isDeleted: 1 });