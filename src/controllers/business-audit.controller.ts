// src/controllers/business-audit.controller.ts
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
  import { AuditLogService } from '../services/audit-log.service';
  import { AuditAction, ResourceType, AuditSeverity } from '../schemas/audit-log.schema';
  
  @ApiTags('Business Audit Logs - Admin')
  @Controller('business/audit-logs')
  @UseGuards(BusinessAuthGuard)
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class BusinessAuditController {
    private readonly logger = new Logger(BusinessAuditController.name);
  
    constructor(
      private readonly auditLogService: AuditLogService
    ) {}
  
    @Get()
    @ApiOperation({ summary: 'Get audit logs for the business' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'userId', required: false, description: 'Filter by specific user ID' })
    @ApiQuery({ name: 'action', required: false, description: 'Filter by action type' })
    @ApiQuery({ name: 'resourceType', required: false, description: 'Filter by resource type' })
    @ApiQuery({ name: 'severity', required: false, description: 'Filter by severity level' })
    @ApiQuery({ name: 'startDate', required: false, description: 'Start date (YYYY-MM-DD)' })
    @ApiQuery({ name: 'endDate', required: false, description: 'End date (YYYY-MM-DD)' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
    @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10, max: 100)' })
    @ApiResponse({ status: 200, description: 'Audit logs retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getAuditLogs(
      @Query('businessId') businessId: string,
      @Query('userId') userId?: string,
      @Query('action') action?: AuditAction,
      @Query('resourceType') resourceType?: ResourceType,
      @Query('severity') severity?: AuditSeverity,
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
  
        this.logger.log(`Getting audit logs for business: ${businessId}`);
  
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
        const limitNum = limit ? Math.min(parseInt(limit), 100) : 10; // Max 100 items per page
  
        if (pageNum < 1) {
          throw new BadRequestException('Page must be greater than 0');
        }
  
        if (limitNum < 1) {
          throw new BadRequestException('Limit must be greater than 0');
        }
  
        const filters = {
          userId,
          action,
          resourceType,
          severity,
          startDate: parsedStartDate,
          endDate: parsedEndDate,
          page: pageNum,
          limit: limitNum
        };
  
        const result = await this.auditLogService.getAuditLogs(businessId, filters);
  
        return {
          status: 'success',
          message: 'Audit logs retrieved successfully',
          data: {
            logs: result.logs,
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
        this.logger.error(`Error getting audit logs: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get audit logs');
      }
    }
  
    @Get('stats')
    @ApiOperation({ summary: 'Get audit log statistics for the business' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'days', required: false, description: 'Number of days to analyze (default: 30)' })
    @ApiResponse({ status: 200, description: 'Audit log statistics retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getAuditLogStats(
      @Query('businessId') businessId: string,
      @Query('days') days?: string,
      @Request() req?: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Getting audit log statistics for business: ${businessId}`);
  
        const daysNum = days ? parseInt(days) : 30;
        
        if (daysNum < 1 || daysNum > 365) {
          throw new BadRequestException('Days must be between 1 and 365');
        }
  
        const stats = await this.auditLogService.getAuditLogStats(businessId, daysNum);
  
        return {
          status: 'success',
          message: 'Audit log statistics retrieved successfully',
          data: {
            period: `${daysNum} days`,
            ...stats
          }
        };
      } catch (error) {
        this.logger.error(`Error getting audit log stats: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get audit log statistics');
      }
    }
  
    @Get('recent')
    @ApiOperation({ summary: 'Get recent audit logs for the business' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'limit', required: false, description: 'Number of recent logs (default: 20, max: 50)' })
    @ApiResponse({ status: 200, description: 'Recent audit logs retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getRecentAuditLogs(
      @Query('businessId') businessId: string,
      @Query('limit') limit?: string,
      @Request() req?: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Getting recent audit logs for business: ${businessId}`);
  
        const limitNum = limit ? Math.min(parseInt(limit), 50) : 20; // Max 50 items
  
        if (limitNum < 1) {
          throw new BadRequestException('Limit must be greater than 0');
        }
  
        const result = await this.auditLogService.getAuditLogs(businessId, {
          page: 1,
          limit: limitNum
        });
  
        return {
          status: 'success',
          message: 'Recent audit logs retrieved successfully',
          data: {
            logs: result.logs,
            total: result.total
          }
        };
      } catch (error) {
        this.logger.error(`Error getting recent audit logs: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get recent audit logs');
      }
    }
  
    @Get('security-events')
    @ApiOperation({ summary: 'Get security-related audit logs' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back (default: 7)' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
    @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 20)' })
    @ApiResponse({ status: 200, description: 'Security events retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getSecurityEvents(
      @Query('businessId') businessId: string,
      @Query('days') days?: string,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
      @Request() req?: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Getting security events for business: ${businessId}`);
  
        const daysNum = days ? parseInt(days) : 7;
        const pageNum = page ? parseInt(page) : 1;
        const limitNum = limit ? Math.min(parseInt(limit), 100) : 20;
  
        if (daysNum < 1 || daysNum > 90) {
          throw new BadRequestException('Days must be between 1 and 90');
        }
  
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysNum);
  
        // Security-related actions
        const securityActions = [
          AuditAction.LOGIN_FAILURE,
          AuditAction.UNAUTHORIZED_ACCESS_ATTEMPT,
          AuditAction.SECURITY_VIOLATION,
          AuditAction.API_KEY_GENERATED,
          AuditAction.API_KEY_REVOKED,
          AuditAction.USER_ROLE_CHANGED,
          AuditAction.USER_PERMISSION_CHANGED
        ];
  
        // Get logs with high severity or security actions
        const filters = {
          startDate,
          page: pageNum,
          limit: limitNum
        };
  
        const result = await this.auditLogService.getAuditLogs(businessId, filters);
  
        // Filter for security events
        const securityLogs = result.logs.filter(log => 
          log.severity === AuditSeverity.HIGH || 
          log.severity === AuditSeverity.CRITICAL ||
          securityActions.includes(log.action)
        );
  
        return {
          status: 'success',
          message: 'Security events retrieved successfully',
          data: {
            logs: securityLogs,
            period: `${daysNum} days`,
            total: securityLogs.length,
            criticalCount: securityLogs.filter(log => log.severity === AuditSeverity.CRITICAL).length,
            highCount: securityLogs.filter(log => log.severity === AuditSeverity.HIGH).length
          }
        };
      } catch (error) {
        this.logger.error(`Error getting security events: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get security events');
      }
    }
  
    @Get('user-activity')
    @ApiOperation({ summary: 'Get audit logs for a specific user' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'userId', required: true, description: 'User ID to get activity for' })
    @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back (default: 30)' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
    @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 20)' })
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
        const limitNum = limit ? Math.min(parseInt(limit), 100) : 20;
  
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
  
        const result = await this.auditLogService.getAuditLogs(businessId, filters);
  
        // Calculate activity summary
        const activitySummary = {
          totalActions: result.total,
          loginCount: result.logs.filter(log => log.action === AuditAction.LOGIN_SUCCESS).length,
          dataModifications: result.logs.filter(log => 
            log.action.includes('CREATED') || 
            log.action.includes('UPDATED') || 
            log.action.includes('DELETED')
          ).length,
          failedAttempts: result.logs.filter(log => !log.success).length
        };
  
        return {
          status: 'success',
          message: 'User activity retrieved successfully',
          data: {
            logs: result.logs,
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
  
    @Get('export')
    @ApiOperation({ summary: 'Export audit logs as CSV' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'startDate', required: false, description: 'Start date (YYYY-MM-DD)' })
    @ApiQuery({ name: 'endDate', required: false, description: 'End date (YYYY-MM-DD)' })
    @ApiQuery({ name: 'action', required: false, description: 'Filter by action type' })
    @ApiQuery({ name: 'severity', required: false, description: 'Filter by severity level' })
    @ApiResponse({ status: 200, description: 'Audit logs exported successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async exportAuditLogs(
      @Query('businessId') businessId: string,
      @Query('startDate') startDate?: string,
      @Query('endDate') endDate?: string,
      @Query('action') action?: AuditAction,
      @Query('severity') severity?: AuditSeverity,
      @Request() req?: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Exporting audit logs for business: ${businessId}`);
  
        // Parse dates
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
          parsedEndDate.setHours(23, 59, 59, 999);
        }
  
        // Get all logs matching criteria (with reasonable limit)
        const filters = {
          action,
          severity,
          startDate: parsedStartDate,
          endDate: parsedEndDate,
          page: 1,
          limit: 10000 // Maximum export limit
        };
  
        const result = await this.auditLogService.getAuditLogs(businessId, filters);
  
        // Log the export action
        await this.auditLogService.createAuditLog({
          businessId,
          userId: req.business?.adminUserId,
          action: AuditAction.DATA_EXPORT,
          resourceType: ResourceType.SYSTEM,
          ipAddress: this.extractIpAddress(req),
          userAgent: req.get('User-Agent'),
          metadata: {
            exportType: 'audit_logs',
            recordCount: result.logs.length,
            filters: filters
          }
        });
  
        return {
          status: 'success',
          message: 'Audit logs exported successfully',
          data: {
            logs: result.logs,
            total: result.total,
            exportedAt: new Date(),
            filters: filters
          }
        };
      } catch (error) {
        this.logger.error(`Error exporting audit logs: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to export audit logs');
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