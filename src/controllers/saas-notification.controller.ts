// src/controllers/saas-notification.controller.ts
import { 
    Controller, 
    Get, 
    Put, 
    Delete,
    Body, 
    Param, 
    Query, 
    Headers, 
    UnauthorizedException, 
    NotFoundException, 
    Logger, 
    InternalServerErrorException,
    BadRequestException
  } from '@nestjs/common';
  import { ApiTags, ApiOperation, ApiHeader, ApiParam, ApiBody, ApiResponse, ApiQuery } from '@nestjs/swagger';
  import { SaasNotificationService } from '../services/saas-notification.service';
  import { BusinessService } from '../services/business.service';
  import { NotificationType, NotificationStatus } from '../schemas/saas-notification.schema';
  
  // DTOs
  export class NotificationFiltersDto {
    type?: NotificationType;
    status?: NotificationStatus;
    priority?: string;
    page?: number;
    limit?: number;
    fromDate?: string;
    toDate?: string;
  }
  
  export class MarkAsReadDto {
    notificationIds?: string[];
  }
  
  @ApiTags('SaaS Notifications')
  @Controller('notifications')
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class SaasNotificationController {
    private readonly logger = new Logger(SaasNotificationController.name);
  
    constructor(
      private readonly notificationService: SaasNotificationService,
      private readonly businessService: BusinessService
    ) {}
  
    @Get('business/:businessId')
    @ApiOperation({ summary: 'Get business notifications' })
    @ApiParam({ name: 'businessId', description: 'Business ID' })
    @ApiQuery({ name: 'type', required: false, enum: NotificationType, description: 'Filter by notification type' })
    @ApiQuery({ name: 'status', required: false, enum: NotificationStatus, description: 'Filter by status' })
    @ApiQuery({ name: 'priority', required: false, description: 'Filter by priority' })
    @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
    @ApiQuery({ name: 'fromDate', required: false, description: 'Filter from date (ISO string)' })
    @ApiQuery({ name: 'toDate', required: false, description: 'Filter to date (ISO string)' })
    @ApiResponse({ status: 200, description: 'Business notifications retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async getBusinessNotifications(
      @Param('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Query('type') type?: NotificationType,
      @Query('status') status?: NotificationStatus,
      @Query('priority') priority?: string,
      @Query('page') page?: number,
      @Query('limit') limit?: number,
      @Query('fromDate') fromDate?: string,
      @Query('toDate') toDate?: string
    ) {
      try {
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const pageNum = page || 1;
        const limitNum = Math.min(limit || 20, 100); // Max 100 items per page
        const skip = (pageNum - 1) * limitNum;
  
        // Build query filters
        const query: any = { businessId };
        
        if (type) query.type = type;
        if (status) query.status = status;
        if (priority) query.priority = priority;
        
        if (fromDate || toDate) {
          query.createdAt = {};
          if (fromDate) query.createdAt.$gte = new Date(fromDate);
          if (toDate) query.createdAt.$lte = new Date(toDate);
        }
  
        // Get notifications and total count
        const [notifications, total] = await Promise.all([
          this.notificationService.getBusinessNotifications(businessId, {
            skip,
            limit: limitNum,
            type,
            status: status as string
          }),
          this.notificationService.getBusinessNotificationCount(businessId, query)
        ]);
  
        // Get statistics
        const stats = await this.notificationService.getBusinessNotificationStats(businessId);
  
        return {
          notifications,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
            hasNext: pageNum * limitNum < total,
            hasPrev: pageNum > 1
          },
          stats,
          success: true
        };
  
      } catch (error) {
        this.logger.error(`Error getting business notifications: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get notifications');
      }
    }
  
    @Get('user/:userId')
    @ApiOperation({ summary: 'Get user notifications' })
    @ApiParam({ name: 'userId', description: 'User ID' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID for validation' })
    @ApiQuery({ name: 'type', required: false, enum: NotificationType, description: 'Filter by notification type' })
    @ApiQuery({ name: 'status', required: false, enum: NotificationStatus, description: 'Filter by status' })
    @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
    @ApiResponse({ status: 200, description: 'User notifications retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async getUserNotifications(
      @Param('userId') userId: string,
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Query('type') type?: NotificationType,
      @Query('status') status?: NotificationStatus,
      @Query('page') page?: number,
      @Query('limit') limit?: number
    ) {
      try {
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const pageNum = page || 1;
        const limitNum = Math.min(limit || 20, 100);
        const skip = (pageNum - 1) * limitNum;
  
        const notifications = await this.notificationService.getUserNotifications(userId, {
          skip,
          limit: limitNum,
          type,
          status: status as string
        });
  
        return {
          notifications,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: notifications.length
          },
          success: true
        };
  
      } catch (error) {
        this.logger.error(`Error getting user notifications: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get user notifications');
      }
    }
  
    @Put(':notificationId/read')
    @ApiOperation({ summary: 'Mark notification as read' })
    @ApiParam({ name: 'notificationId', description: 'Notification ID' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID for validation' })
    @ApiResponse({ status: 200, description: 'Notification marked as read' })
    @ApiResponse({ status: 404, description: 'Notification not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async markAsRead(
      @Param('notificationId') notificationId: string,
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string
    ) {
      try {
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const notification = await this.notificationService.markAsRead(notificationId);
        
        if (!notification) {
          throw new NotFoundException('Notification not found');
        }
  
        return {
          notification,
          success: true,
          message: 'Notification marked as read'
        };
  
      } catch (error) {
        this.logger.error(`Error marking notification as read: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to mark notification as read');
      }
    }
  
    @Put('business/:businessId/read-all')
    @ApiOperation({ summary: 'Mark all business notifications as read' })
    @ApiParam({ name: 'businessId', description: 'Business ID' })
    @ApiBody({ 
      description: 'Optional: specific notification IDs to mark as read',
      schema: {
        type: 'object',
        properties: {
          notificationIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional array of specific notification IDs. If not provided, marks all as read.'
          }
        }
      },
      required: false
    })
    @ApiResponse({ status: 200, description: 'Notifications marked as read' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async markAllAsRead(
      @Param('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Body() body?: MarkAsReadDto
    ) {
      try {
        await this.validateBusinessApiKey(businessId, apiKey);
  
        if (body?.notificationIds && body.notificationIds.length > 0) {
          // Mark specific notifications as read
          const results = await Promise.all(
            body.notificationIds.map(id => this.notificationService.markAsRead(id))
          );
          
          return {
            updated: results.filter(n => n !== null).length,
            success: true,
            message: `${results.length} notifications marked as read`
          };
        } else {
          // Mark all business notifications as read
          const result = await this.notificationService.markAllBusinessNotificationsAsRead(businessId);
          
          return {
            updated: result,
            success: true,
            message: 'All notifications marked as read'
          };
        }
  
      } catch (error) {
        this.logger.error(`Error marking notifications as read: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to mark notifications as read');
      }
    }
  
    @Delete(':notificationId')
    @ApiOperation({ summary: 'Delete notification' })
    @ApiParam({ name: 'notificationId', description: 'Notification ID' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID for validation' })
    @ApiResponse({ status: 200, description: 'Notification deleted successfully' })
    @ApiResponse({ status: 404, description: 'Notification not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async deleteNotification(
      @Param('notificationId') notificationId: string,
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string
    ) {
      try {
        await this.validateBusinessApiKey(businessId, apiKey);
  
        await this.notificationService.deleteNotification(notificationId);
  
        return {
          success: true,
          message: 'Notification deleted successfully'
        };
  
      } catch (error) {
        this.logger.error(`Error deleting notification: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to delete notification');
      }
    }
  
    @Get('business/:businessId/stats')
    @ApiOperation({ summary: 'Get notification statistics for business' })
    @ApiParam({ name: 'businessId', description: 'Business ID' })
    @ApiResponse({ status: 200, description: 'Notification statistics retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async getNotificationStats(
      @Param('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string
    ) {
      try {
        await this.validateBusinessApiKey(businessId, apiKey);
  
        const stats = await this.notificationService.getBusinessNotificationStats(businessId);
  
        return {
          stats,
          success: true
        };
  
      } catch (error) {
        this.logger.error(`Error getting notification stats: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get notification statistics');
      }
    }
  
    private async validateBusinessApiKey(businessId: string, apiKey: string) {
      if (!apiKey) {
        throw new UnauthorizedException('Business API key missing');
      }
      
      const business = await this.businessService.findByIdAndApiKey(businessId, apiKey);
      if (!business) {
        throw new UnauthorizedException('Invalid API key for this business');
      }
      
      return business;
    }
  }