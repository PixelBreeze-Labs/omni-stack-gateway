// src/controllers/business-activity.controller.ts
import { 
    Controller, 
    Get, 
    Query,
    UseGuards,
    Request,
    Logger,
    BadRequestException,
    InternalServerErrorException
  } from '@nestjs/common';
  import { 
    ApiTags, 
    ApiOperation, 
    ApiHeader,
    ApiQuery, 
    ApiResponse
  } from '@nestjs/swagger';
  import { BusinessAuthGuard } from '../guards/business-auth.guard';
  import { AppActivityService } from '../services/app-activity.service';
  import { ActivityType, ActivityStatus } from '../schemas/app-activity.schema';
  
  @ApiTags('Business Activities - Admin')
  @Controller('business/activities')
  @UseGuards(BusinessAuthGuard)
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class BusinessActivityController {
    private readonly logger = new Logger(BusinessActivityController.name);
  
    constructor(
      private readonly appActivityService: AppActivityService
    ) {}
  
    @Get()
    @ApiOperation({ summary: 'Get activities for the business' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'userId', required: false, description: 'Filter by specific user ID' })
    @ApiQuery({ name: 'type', required: false, description: 'Filter by activity type' })
    @ApiQuery({ name: 'department', required: false, description: 'Filter by department' })
    @ApiQuery({ name: 'team', required: false, description: 'Filter by team' })
    @ApiQuery({ name: 'projectId', required: false, description: 'Filter by project ID' })
    @ApiQuery({ name: 'status', required: false, description: 'Filter by activity status' })
    @ApiQuery({ name: 'startDate', required: false, description: 'Start date (YYYY-MM-DD)' })
    @ApiQuery({ name: 'endDate', required: false, description: 'End date (YYYY-MM-DD)' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
    @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 25, max: 100)' })
    @ApiResponse({ status: 200, description: 'Activities retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getActivities(
      @Query('businessId') businessId: string,
      @Query('userId') userId?: string,
      @Query('type') type?: ActivityType,
      @Query('department') department?: string,
      @Query('team') team?: string,
      @Query('projectId') projectId?: string,
      @Query('status') status?: ActivityStatus,
      @Query('startDate') startDate?: string,
      @Query('endDate') endDate?: string,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
      @Request() req?: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Getting activities for business: ${businessId}`);
  
        // Parse and validate dates
        let parsedStartDate: Date | undefined;
        let parsedEndDate: Date | undefined;
  
        if (startDate) {
          parsedStartDate = new Date(startDate);
          if (isNaN(parsedStartDate.getTime())) {
            throw new BadRequestException('Invalid start date format. Use YYYY-MM-DD.');
          }
        }
  
        if (endDate) {
          parsedEndDate = new Date(endDate);
          if (isNaN(parsedEndDate.getTime())) {
            throw new BadRequestException('Invalid end date format. Use YYYY-MM-DD.');
          }
          // Set to end of day
          parsedEndDate.setHours(23, 59, 59, 999);
        }
  
        // Parse pagination
        const pageNum = page ? parseInt(page) : 1;
        const limitNum = limit ? Math.min(parseInt(limit), 100) : 25; // Max 100 items per page
  
        if (pageNum < 1) {
          throw new BadRequestException('Page must be greater than 0');
        }
  
        if (limitNum < 1) {
          throw new BadRequestException('Limit must be greater than 0');
        }
  
        const filters = {
          userId,
          type,
          department,
          team,
          projectId,
          startDate: parsedStartDate,
          endDate: parsedEndDate,
          page: pageNum,
          limit: limitNum
        };
  
        const result = await this.appActivityService.getActivities(businessId, filters);
  
        return {
          status: 'success',
          message: 'Activities retrieved successfully',
          data: {
            activities: result.activities,
            pagination: {
              page: result.page,
              limit: result.limit,
              total: result.total,
              totalPages: result.totalPages,
              hasNextPage: result.page < result.totalPages,
              hasPrevPage: result.page > 1
            }
          }
        };
      } catch (error) {
        this.logger.error(`Error getting activities: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get activities');
      }
    }
  
    @Get('summary')
    @ApiOperation({ summary: 'Get activity summary for the business dashboard' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'days', required: false, description: 'Number of days to analyze (default: 7)' })
    @ApiResponse({ status: 200, description: 'Activity summary retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getActivitySummary(
      @Query('businessId') businessId: string,
      @Query('days') days?: string,
      @Request() req?: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Getting activity summary for business: ${businessId}`);
  
        const daysNum = days ? parseInt(days) : 7;
        
        if (daysNum < 1 || daysNum > 90) {
          throw new BadRequestException('Days must be between 1 and 90');
        }
  
        const summary = await this.appActivityService.getActivitySummary(businessId, daysNum);
  
        return {
          status: 'success',
          message: 'Activity summary retrieved successfully',
          data: {
            period: `${daysNum} days`,
            ...summary
          }
        };
      } catch (error) {
        this.logger.error(`Error getting activity summary: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get activity summary');
      }
    }
  
    @Get('recent')
    @ApiOperation({ summary: 'Get recent activities for the business' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'limit', required: false, description: 'Number of recent activities (default: 20, max: 50)' })
    @ApiResponse({ status: 200, description: 'Recent activities retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getRecentActivities(
      @Query('businessId') businessId: string,
      @Query('limit') limit?: string,
      @Request() req?: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Getting recent activities for business: ${businessId}`);
  
        const limitNum = limit ? Math.min(parseInt(limit), 50) : 20; // Max 50 items
  
        if (limitNum < 1) {
          throw new BadRequestException('Limit must be greater than 0');
        }
  
        const result = await this.appActivityService.getActivities(businessId, {
          page: 1,
          limit: limitNum
        });
  
        return {
          status: 'success',
          message: 'Recent activities retrieved successfully',
          data: {
            activities: result.activities,
            total: result.total
          }
        };
      } catch (error) {
        this.logger.error(`Error getting recent activities: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get recent activities');
      }
    }
  
    @Get('user-activity')
    @ApiOperation({ summary: 'Get activities for a specific user' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'userId', required: true, description: 'User ID to get activity for' })
    @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back (default: 30)' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
    @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 25)' })
    @ApiResponse({ status: 200, description: 'User activity retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getUserActivity(
      @Query('businessId') businessId: string,
      @Query('userId') userId: string,
      @Query('days') days?: string,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
      @Request() req?: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!userId) {
          throw new BadRequestException('User ID is required');
        }
  
        this.logger.log(`Getting user activity for user: ${userId} in business: ${businessId}`);
  
        const daysNum = days ? parseInt(days) : 30;
        const pageNum = page ? parseInt(page) : 1;
        const limitNum = limit ? Math.min(parseInt(limit), 100) : 25;
  
        if (daysNum < 1 || daysNum > 365) {
          throw new BadRequestException('Days must be between 1 and 365');
        }
  
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysNum);
  
        const filters = {
          userId,
          startDate,
          page: pageNum,
          limit: limitNum
        };
  
        const result = await this.appActivityService.getActivities(businessId, filters);
  
        // Calculate activity summary
        const activitySummary = {
          totalActivities: result.total,
          timesheetActivities: result.activities.filter(activity => 
            activity.type.includes('timesheet')).length,
          taskActivities: result.activities.filter(activity => 
            activity.type.includes('task')).length,
          clientActivities: result.activities.filter(activity => 
            activity.type.includes('client')).length,
          mediaActivities: result.activities.filter(activity => 
            activity.type.includes('photo') || activity.type.includes('document')).length
        };
  
        return {
          status: 'success',
          message: 'User activity retrieved successfully',
          data: {
            activities: result.activities,
            summary: activitySummary,
            period: `${daysNum} days`,
            pagination: {
              page: result.page,
              limit: result.limit,
              total: result.total,
              totalPages: result.totalPages
            }
          }
        };
      } catch (error) {
        this.logger.error(`Error getting user activity: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get user activity');
      }
    }
  
    @Get('by-type')
    @ApiOperation({ summary: 'Get activities grouped by type' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'days', required: false, description: 'Number of days to analyze (default: 7)' })
    @ApiResponse({ status: 200, description: 'Activities by type retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getActivitiesByType(
      @Query('businessId') businessId: string,
      @Query('days') days?: string,
      @Request() req?: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Getting activities by type for business: ${businessId}`);
  
        const daysNum = days ? parseInt(days) : 7;
        
        if (daysNum < 1 || daysNum > 90) {
          throw new BadRequestException('Days must be between 1 and 90');
        }
  
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysNum);
  
        const result = await this.appActivityService.getActivities(businessId, {
          startDate,
          page: 1,
          limit: 1000 // Get more for analysis
        });
  
        // Group by activity type
        const activityByType = result.activities.reduce((acc, activity) => {
          const type = activity.type;
          if (!acc[type]) {
            acc[type] = {
              type,
              count: 0,
              activities: []
            };
          }
          acc[type].count++;
          acc[type].activities.push(activity);
          return acc;
        }, {});
  
        return {
          status: 'success',
          message: 'Activities by type retrieved successfully',
          data: {
            period: `${daysNum} days`,
            breakdown: Object.values(activityByType),
            totalActivities: result.total
          }
        };
      } catch (error) {
        this.logger.error(`Error getting activities by type: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get activities by type');
      }
    }
  
    @Get('live')
    @ApiOperation({ summary: 'Get live activity feed (last 24 hours)' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'limit', required: false, description: 'Number of activities (default: 50, max: 100)' })
    @ApiResponse({ status: 200, description: 'Live activity feed retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getLiveActivityFeed(
      @Query('businessId') businessId: string,
      @Query('limit') limit?: string,
      @Request() req?: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Getting live activity feed for business: ${businessId}`);
  
        const limitNum = limit ? Math.min(parseInt(limit), 100) : 50;
  
        if (limitNum < 1) {
          throw new BadRequestException('Limit must be greater than 0');
        }
  
        // Get activities from last 24 hours
        const startDate = new Date();
        startDate.setHours(startDate.getHours() - 24);
  
        const result = await this.appActivityService.getActivities(businessId, {
          startDate,
          page: 1,
          limit: limitNum
        });
  
        return {
          status: 'success',
          message: 'Live activity feed retrieved successfully',
          data: {
            activities: result.activities,
            total: result.total,
            lastUpdated: new Date(),
            period: '24 hours'
          }
        };
      } catch (error) {
        this.logger.error(`Error getting live activity feed: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get live activity feed');
      }
    }
  
    /**
     * Extract IP address from request
     */
    private extractIpAddress(req: any): string {
      return (
        req.headers['x-forwarded-for'] ||
        req.headers['x-real-ip'] ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        'unknown'
      ).split(',')[0].trim();
    }
  }