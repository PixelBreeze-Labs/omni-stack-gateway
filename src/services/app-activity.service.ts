// src/services/app-activity.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppActivity, ActivityType, ActivityStatus } from '../schemas/app-activity.schema';
import { Request } from 'express';
import { Types } from 'mongoose';
import { User } from '../schemas/user.schema';

export interface CreateActivityDto {
 businessId: string;
 userId: string;
 userName: string;
 userEmail: string;
 type: ActivityType;
 action: string;
 description?: string;
 location?: {
   lat: number;
   lng: number;
   address?: string;
 };
 department?: string;
 team?: string;
 projectId?: string;
 projectName?: string;
 deviceType?: string;
 ipAddress?: string;
 resourceType?: string;
 resourceId?: string;
 resourceName?: string;
 status?: ActivityStatus;
 durationMinutes?: number;
 data?: any;
}

@Injectable()
export class AppActivityService {
 private readonly logger = new Logger(AppActivityService.name);

 constructor(
   @InjectModel(AppActivity.name)
   private readonly activityModel: Model<AppActivity>,
   @InjectModel(User.name)
   private readonly userModel: Model<User>,
 ) {}

 /**
  * Main method to create activity entry
  */
 async createActivity(dto: CreateActivityDto): Promise<void> {
   try {
     // Set expiration date (30 days from now)
     const expiresAt = new Date();
     expiresAt.setDate(expiresAt.getDate() + 30);

     const activity = new this.activityModel({
       businessId: dto.businessId,
       userId: dto.userId,
       userName: dto.userName,
       userEmail: dto.userEmail,
       type: dto.type,
       action: dto.action,
       description: dto.description,
       timestamp: new Date(),
       location: dto.location,
       department: dto.department,
       team: dto.team,
       projectId: dto.projectId,
       projectName: dto.projectName,
       deviceType: dto.deviceType,
       ipAddress: dto.ipAddress || 'unknown',
       resourceType: dto.resourceType,
       resourceId: dto.resourceId,
       resourceName: dto.resourceName,
       status: dto.status || ActivityStatus.COMPLETED,
       durationMinutes: dto.durationMinutes,
       data: dto.data || {},
       expiresAt,
     });

     await activity.save();
   } catch (error) {
     this.logger.error(`Failed to create activity: ${error.message}`, error.stack);
     // Don't throw error to avoid breaking main functionality
   }
 }

 /**
  * Helper method to create activity from Express request
  */
 async createActivityFromRequest(
   req: Request & { user?: any; business?: any; employee?: any },
   type: ActivityType,
   action: string,
   additionalData: Partial<CreateActivityDto> = {}
 ): Promise<void> {
   const businessId = this.extractBusinessId(req);
   const userId = this.extractUserId(req);
   const userInfo = this.extractUserInfo(req);
   
   await this.createActivity({
     businessId,
     userId,
     userName: userInfo.name,
     userEmail: userInfo.email,
     type,
     action,
     ipAddress: this.extractIpAddress(req),
     deviceType: this.extractDeviceType(req),
     ...additionalData,
   });
 }

 /**
  * Log timesheet activities
  */
 async logTimesheetActivity(
   businessId: string,
   userId: string,
   userName: string,
   userEmail: string,
   type: ActivityType,
   shiftId?: string,
   breakType?: string,
   overtimeHours?: number,
   location?: { lat: number; lng: number; address?: string },
   req?: Request
 ): Promise<void> {
   const actionMap = {
     [ActivityType.TIMESHEET_CLOCK_IN]: `${userName} clocked in`,
     [ActivityType.TIMESHEET_CLOCK_OUT]: `${userName} clocked out`,
     [ActivityType.TIMESHEET_BREAK_START]: `${userName} started ${breakType || 'break'}`,
     [ActivityType.TIMESHEET_BREAK_END]: `${userName} ended ${breakType || 'break'}`,
     [ActivityType.OVERTIME_START]: `${userName} started overtime`,
   };

   await this.createActivity({
     businessId,
     userId,
     userName,
     userEmail,
     type,
     action: actionMap[type],
     location,
     ipAddress: req ? this.extractIpAddress(req) : undefined,
     deviceType: req ? this.extractDeviceType(req) : undefined,
     data: {
       shiftId,
       breakType,
       overtimeHours,
     },
   });
 }

 /**
  * Log task activities
  */
 async logTaskActivity(
   businessId: string,
   userId: string,
   userName: string,
   userEmail: string,
   type: ActivityType,
   taskId: string,
   taskName: string,
   projectId?: string,
   projectName?: string,
   estimatedHours?: number,
   req?: Request
 ): Promise<void> {
   const actionMap = {
     [ActivityType.TASK_CREATE]: `${userName} created task: ${taskName}`,
     [ActivityType.TASK_COMPLETE]: `${userName} completed task: ${taskName}`,
     [ActivityType.TASK_UPDATE]: `${userName} updated task: ${taskName}`,
   };

   await this.createActivity({
     businessId,
     userId,
     userName,
     userEmail,
     type,
     action: actionMap[type],
     projectId,
     projectName,
     resourceType: 'task',
     resourceId: taskId,
     resourceName: taskName,
     ipAddress: req ? this.extractIpAddress(req) : undefined,
     deviceType: req ? this.extractDeviceType(req) : undefined,
     data: {
       taskId,
       estimatedHours,
     },
   });
 }

 /**
  * Log client activities
  */
 async logClientActivity(
   businessId: string,
   userId: string,
   userName: string,
   userEmail: string,
   type: ActivityType,
   clientId: string,
   clientName: string,
   contactMethod?: string,
   req?: Request
 ): Promise<void> {
   const actionMap = {
     [ActivityType.CLIENT_CONTACT]: `${userName} contacted ${clientName}`,
     [ActivityType.CLIENT_MEETING]: `${userName} met with ${clientName}`,
     [ActivityType.FEEDBACK_RECEIVED]: `Received feedback from ${clientName}`,
     [ActivityType.COMPLAINT_RECEIVED]: `Received complaint from ${clientName}`,
   };

   await this.createActivity({
     businessId,
     userId,
     userName,
     userEmail,
     type,
     action: actionMap[type],
     resourceType: 'client',
     resourceId: clientId,
     resourceName: clientName,
     ipAddress: req ? this.extractIpAddress(req) : undefined,
     deviceType: req ? this.extractDeviceType(req) : undefined,
     data: {
       clientId,
       clientName,
       contactMethod,
     },
   });
 }

 /**
  * Log media activities
  */
 async logMediaActivity(
   businessId: string,
   userId: string,
   userName: string,
   userEmail: string,
   type: ActivityType,
   fileName: string,
   fileSize?: number,
   fileType?: string,
   req?: Request
 ): Promise<void> {
   const actionMap = {
     [ActivityType.PHOTO_UPLOAD]: `${userName} uploaded photo: ${fileName}`,
     [ActivityType.DOCUMENT_UPLOAD]: `${userName} uploaded document: ${fileName}`,
     [ActivityType.REPORT_GENERATE]: `${userName} generated report: ${fileName}`,
     [ActivityType.FILE_DELETE]: `${userName} deleted file: ${fileName}`,
   };

   await this.createActivity({
     businessId,
     userId,
     userName,
     userEmail,
     type,
     action: actionMap[type],
     resourceType: 'media',
     resourceName: fileName,
     ipAddress: req ? this.extractIpAddress(req) : undefined,
     deviceType: req ? this.extractDeviceType(req) : undefined,
     data: {
       fileName,
       fileSize,
       fileType,
     },
   });
 }

 /**
  * Log location activities
  */
 async logLocationActivity(
   businessId: string,
   userId: string,
   userName: string,
   userEmail: string,
   type: ActivityType,
   location: { lat: number; lng: number; address?: string },
   previousLocation?: { lat: number; lng: number },
   travelDistance?: number,
   req?: Request
 ): Promise<void> {
   const actionMap = {
     [ActivityType.LOCATION_UPDATE]: `${userName} updated location`,
     [ActivityType.SITE_ARRIVAL]: `${userName} arrived at ${location.address || 'site'}`,
     [ActivityType.SITE_DEPARTURE]: `${userName} left ${location.address || 'site'}`,
     [ActivityType.TRAVEL_START]: `${userName} started traveling`,
     [ActivityType.TRAVEL_END]: `${userName} finished traveling`,
   };

   await this.createActivity({
     businessId,
     userId,
     userName,
     userEmail,
     type,
     action: actionMap[type],
     location,
     ipAddress: req ? this.extractIpAddress(req) : undefined,
     deviceType: req ? this.extractDeviceType(req) : undefined,
     data: {
       previousLocation,
       travelDistance,
     },
   });
 }

 /**
  * Extract business ID from request
  */
 private extractBusinessId(req: Request & { user?: any; business?: any }): string {
   if (req.business?.id) {
     return req.business.id;
   }
   
   if (req.user?.businessId) {
     return req.user.businessId;
   }
   
   if (req.query?.businessId) {
     return req.query.businessId as string;
   }
   
   return 'unknown';
 }

 /**
  * Extract user ID from request
  */
 private extractUserId(req: Request & { user?: any; business?: any }): string | undefined {
   if (req.user?.sub) {
     return req.user.sub;
   }
   
   if (req.business?.adminUserId) {
     return req.business.adminUserId;
   }
   
   return undefined;
 }

 /**
  * Extract user information from request
  */
 private extractUserInfo(req: Request & { user?: any; business?: any }): { name?: string; email?: string } {
   return {
     name: req.user?.name || req.user?.firstName || req.business?.adminUserName,
     email: req.user?.email || req.business?.adminUserEmail,
   };
 }

 /**
  * Extract IP address from request
  */
 private extractIpAddress(req: Request): string {
   return (
     req.headers['x-forwarded-for'] as string ||
     req.headers['x-real-ip'] as string ||
     req.connection?.remoteAddress ||
     req.socket?.remoteAddress ||
     'unknown'
   ).split(',')[0].trim();
 }

 /**
  * Extract device type from request
  */
 private extractDeviceType(req: Request): string {
   const userAgent = req.get('User-Agent') || '';
   
   if (/Mobile|Android|iPhone|iPad/.test(userAgent)) {
     return 'mobile';
   } else if (/Tablet/.test(userAgent)) {
     return 'tablet';
   } else {
     return 'desktop';
   }
 }

 /**
  * Get activities for a business with filters
  */
 async getActivities(
   businessId: string,
   filters: {
     userId?: string;
     type?: ActivityType;
     department?: string;
     team?: string;
     projectId?: string;
     startDate?: Date;
     endDate?: Date;
     page?: number;
     limit?: number;
   } = {}
 ) {
   const {
     userId,
     type,
     department,
     team,
     projectId,
     startDate,
     endDate,
     page = 1,
     limit = 25,
   } = filters;

   const matchQuery: any = {
     businessId: new Types.ObjectId(businessId),
   };

   if (userId) matchQuery.userId = userId;
   if (type) matchQuery.type = type;
   if (department) matchQuery.department = department;
   if (team) matchQuery.team = team;
   if (projectId) matchQuery.projectId = projectId;

   if (startDate || endDate) {
     matchQuery.timestamp = {};
     if (startDate) matchQuery.timestamp.$gte = startDate;
     if (endDate) matchQuery.timestamp.$lte = endDate;
   }

   const skip = (page - 1) * limit;

   const [activities, total] = await Promise.all([
     this.activityModel.find(matchQuery)
       .sort({ timestamp: -1 })
       .skip(skip)
       .limit(limit)
       .exec(),
     this.activityModel.countDocuments(matchQuery)
   ]);

   return {
     activities,
     total,
     page,
     limit,
     totalPages: Math.ceil(total / limit),
   };
 }

 /**
  * Get activity summary for dashboard
  */
 async getActivitySummary(businessId: string, days: number = 7) {
   const startDate = new Date();
   startDate.setDate(startDate.getDate() - days);

   const pipeline = [
     {
       $match: {
         businessId: new Types.ObjectId(businessId),
         timestamp: { $gte: startDate },
       },
     },
     {
       $group: {
         _id: null,
         totalActivities: { $sum: 1 },
         activeUsers: { $addToSet: '$userId' },
         activityBreakdown: {
           $push: '$type',
         },
         teamPerformance: {
           $push: { team: '$team', type: '$type' },
         },
       },
     },
   ];

   const [result] = await this.activityModel.aggregate(pipeline);

   if (!result) {
     return {
       totalActivities: 0,
       activeUsers: 0,
       activityBreakdown: [],
       teamPerformance: [],
     };
   }

   // Process activity breakdown
   const activityBreakdown = result.activityBreakdown.reduce((acc, type) => {
     const existing = acc.find(item => item.type === type);
     if (existing) {
       existing.count++;
     } else {
       acc.push({ type, count: 1 });
     }
     return acc;
   }, []);

   // Process team performance
   const teamPerformance = result.teamPerformance
     .filter(item => item.team)
     .reduce((acc, item) => {
       const existing = acc.find(t => t.name === item.team);
       if (existing) {
         existing.value++;
       } else {
         acc.push({ name: item.team, value: 1 });
       }
       return acc;
     }, []);

   return {
     totalActivities: result.totalActivities,
     activeUsers: result.activeUsers.length,
     activityBreakdown,
     teamPerformance,
     mostActiveType: activityBreakdown.sort((a, b) => b.count - a.count)[0]?.type,
   };
 }
}