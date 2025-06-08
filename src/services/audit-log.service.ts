// src/services/audit-log.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditAction, ResourceType, AuditSeverity } from '../schemas/audit-log.schema';
import { Request } from 'express';

export interface CreateAuditLogDto {
  businessId: string;
  userId?: string;
  action: AuditAction;
  resourceType: ResourceType;
  resourceId?: string;
  resourceName?: string;
  oldValues?: any;
  newValues?: any;
  changedFields?: string[];
  success?: boolean;
  errorCode?: string;
  errorMessage?: string;
  severity?: AuditSeverity;
  tags?: string[];
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  sessionId?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLog>,
  ) {}

  /**
   * Main method to create audit log entry
   */
  async createAuditLog(dto: CreateAuditLogDto): Promise<void> {
    try {
      // Set default values
      const auditLog = new this.auditLogModel({
        businessId: dto.businessId,
        userId: dto.userId,
        action: dto.action,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        resourceName: dto.resourceName,
        oldValues: dto.oldValues,
        newValues: dto.newValues,
        changedFields: dto.changedFields,
        ipAddress: dto.ipAddress || 'unknown',
        userAgent: dto.userAgent,
        requestId: dto.requestId,
        sessionId: dto.sessionId,
        success: dto.success !== undefined ? dto.success : true,
        errorCode: dto.errorCode,
        errorMessage: dto.errorMessage,
        severity: dto.severity || this.determineSeverity(dto.action),
        tags: dto.tags || [],
        metadata: dto.metadata || {},
        isPersonalData: this.isPersonalDataAction(dto.action, dto.resourceType),
      });

      await auditLog.save();
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error.message}`, error.stack);
      // Don't throw error to avoid breaking main functionality
    }
  }

  /**
   * Helper method to create audit log from Express request
   */
  async createAuditLogFromRequest(
    req: Request & { user?: any; business?: any; employee?: any },
    action: AuditAction,
    resourceType: ResourceType,
    additionalData: Partial<CreateAuditLogDto> = {}
  ): Promise<void> {
    const businessId = this.extractBusinessId(req);
    const userId = this.extractUserId(req);
    
    await this.createAuditLog({
      businessId,
      userId,
      action,
      resourceType,
      ipAddress: this.extractIpAddress(req),
      userAgent: req.get('User-Agent'),
      requestId: req.headers['x-request-id'] as string,
      sessionId: this.extractSessionId(req),
      ...additionalData,
    });
  }

  /**
   * Authentication-specific audit logs
   */
  async logAuthentication(
    action: AuditAction,
    email: string,
    success: boolean,
    ipAddress: string,
    userAgent?: string,
    businessId?: string,
    userId?: string,
    errorMessage?: string
  ): Promise<void> {
    await this.createAuditLog({
      businessId: businessId || 'system',
      userId,
      action,
      resourceType: ResourceType.USER,
      success,
      errorMessage,
      severity: success ? AuditSeverity.LOW : AuditSeverity.HIGH,
      ipAddress,
      userAgent,
      metadata: {
        email,
        loginAttempt: true,
      },
    });
  }

  /**
   * Data modification audit logs
   */
  async logDataModification(
    businessId: string,
    userId: string,
    action: AuditAction,
    resourceType: ResourceType,
    resourceId: string,
    resourceName: string,
    oldValues?: any,
    newValues?: any,
    req?: Request
  ): Promise<void> {
    const changedFields = this.getChangedFields(oldValues, newValues);
    
    await this.createAuditLog({
      businessId,
      userId,
      action,
      resourceType,
      resourceId,
      resourceName,
      oldValues,
      newValues,
      changedFields,
      ipAddress: req ? this.extractIpAddress(req) : undefined,
      userAgent: req?.get('User-Agent'),
      severity: this.isHighRiskAction(action) ? AuditSeverity.HIGH : AuditSeverity.MEDIUM,
    });
  }

  /**
   * Data access audit logs (for GDPR compliance)
   */
  async logDataAccess(
    businessId: string,
    userId: string,
    resourceType: ResourceType,
    resourceId: string,
    resourceName: string,
    req?: Request
  ): Promise<void> {
    await this.createAuditLog({
      businessId,
      userId,
      action: AuditAction.CLIENT_DATA_VIEWED,
      resourceType,
      resourceId,
      resourceName,
      severity: AuditSeverity.LOW,
      ipAddress: req ? this.extractIpAddress(req) : undefined,
      userAgent: req?.get('User-Agent'),
      metadata: {
        dataAccess: true,
        gdprRelevant: true,
      },
    });
  }

  /**
   * Bulk operation audit logs
   */
  async logBulkOperation(
    businessId: string,
    userId: string,
    action: AuditAction,
    resourceType: ResourceType,
    affectedCount: number,
    req?: Request
  ): Promise<void> {
    await this.createAuditLog({
      businessId,
      userId,
      action,
      resourceType,
      severity: AuditSeverity.HIGH,
      ipAddress: req ? this.extractIpAddress(req) : undefined,
      userAgent: req?.get('User-Agent'),
      metadata: {
        bulkOperation: true,
        affectedCount,
      },
    });
  }

  /**
   * Security event audit logs
   */
  async logSecurityEvent(
    businessId: string,
    userId: string,
    action: AuditAction,
    description: string,
    req?: Request,
    severity: AuditSeverity = AuditSeverity.HIGH
  ): Promise<void> {
    await this.createAuditLog({
      businessId,
      userId,
      action,
      resourceType: ResourceType.SYSTEM,
      severity,
      ipAddress: req ? this.extractIpAddress(req) : undefined,
      userAgent: req?.get('User-Agent'),
      metadata: {
        securityEvent: true,
        description,
      },
    });
  }

  /**
   * Extract business ID from request
   */
  private extractBusinessId(req: Request & { user?: any; business?: any }): string {
    // From business API key authentication
    if (req.business?.id) {
      return req.business.id;
    }
    
    // From JWT token
    if (req.user?.businessId) {
      return req.user.businessId;
    }
    
    // From query parameter (business admin endpoints)
    if (req.query?.businessId) {
      return req.query.businessId as string;
    }
    
    return 'unknown';
  }

  /**
   * Extract user ID from request
   */
  private extractUserId(req: Request & { user?: any; business?: any }): string | undefined {
    // From JWT token
    if (req.user?.sub) {
      return req.user.sub;
    }
    
    // From business API key - find admin user
    if (req.business?.adminUserId) {
      return req.business.adminUserId;
    }
    
    return undefined;
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
   * Extract session ID from request
   */
  private extractSessionId(req: Request & { user?: any }): string | undefined {
    return req.user?.sessionId || req.headers['x-session-id'] as string;
  }

  /**
   * Determine severity based on action
   */
  private determineSeverity(action: AuditAction): AuditSeverity {
    const highRiskActions = [
      AuditAction.USER_DELETED,
      AuditAction.USER_ROLE_CHANGED,
      AuditAction.API_KEY_GENERATED,
      AuditAction.API_KEY_REVOKED,
      AuditAction.BULK_DELETE,
      AuditAction.BULK_UPDATE,
      AuditAction.DATA_EXPORT,
      AuditAction.LOGIN_FAILURE,
      AuditAction.UNAUTHORIZED_ACCESS_ATTEMPT,
      AuditAction.SECURITY_VIOLATION,
    ];

    const mediumRiskActions = [
      AuditAction.USER_CREATED,
      AuditAction.USER_UPDATED,
      AuditAction.CLIENT_CREATED,
      AuditAction.CLIENT_UPDATED,
      AuditAction.PROJECT_CREATED,
      AuditAction.PROJECT_UPDATED,
      AuditAction.BUSINESS_CONFIG_UPDATED,
      AuditAction.PASSWORD_CHANGE,
    ];

    if (highRiskActions.includes(action)) {
      return AuditSeverity.HIGH;
    } else if (mediumRiskActions.includes(action)) {
      return AuditSeverity.MEDIUM;
    } else {
      return AuditSeverity.LOW;
    }
  }

  /**
   * Check if action involves personal data (GDPR)
   */
  private isPersonalDataAction(action: AuditAction, resourceType: ResourceType): boolean {
    const personalDataResources = [ResourceType.CLIENT, ResourceType.USER, ResourceType.EMPLOYEE];
    const personalDataActions = [
      AuditAction.CLIENT_DATA_VIEWED,
      AuditAction.CLIENT_DATA_EXPORTED,
      AuditAction.DATA_EXPORT,
    ];

    return personalDataResources.includes(resourceType) || personalDataActions.includes(action);
  }

  /**
   * Check if action is high risk
   */
  private isHighRiskAction(action: AuditAction): boolean {
    const highRiskActions = [
      AuditAction.USER_DELETED,
      AuditAction.USER_ROLE_CHANGED,
      AuditAction.BULK_DELETE,
      AuditAction.BULK_UPDATE,
      AuditAction.API_KEY_REVOKED,
    ];

    return highRiskActions.includes(action);
  }

  /**
   * Get changed fields between old and new values
   */
  private getChangedFields(oldValues: any, newValues: any): string[] {
    if (!oldValues || !newValues) {
      return [];
    }

    const changedFields: string[] = [];
    const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);

    for (const key of allKeys) {
      if (JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])) {
        changedFields.push(key);
      }
    }

    return changedFields;
  }

  /**
   * Get audit logs for a business with filters
   */
  async getAuditLogs(
    businessId: string,
    filters: {
      userId?: string;
      action?: AuditAction;
      resourceType?: ResourceType;
      severity?: AuditSeverity;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    } = {}
  ) {
    const {
      userId,
      action,
      resourceType,
      severity,
      startDate,
      endDate,
      page = 1,
      limit = 10,
    } = filters;

    const query: any = {
      businessId,
      isDeleted: false,
    };

    if (userId) query.userId = userId;
    if (action) query.action = action;
    if (resourceType) query.resourceType = resourceType;
    if (severity) query.severity = severity;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.auditLogModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.auditLogModel.countDocuments(query),
    ]);

    return {
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get audit log statistics
   */
  async getAuditLogStats(businessId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const pipeline = [
      {
        $match: {
          businessId,
          isDeleted: false,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: null,
          totalLogs: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' },
          successfulActions: {
            $sum: { $cond: ['$success', 1, 0] },
          },
          failedActions: {
            $sum: { $cond: ['$success', 0, 1] },
          },
          severityBreakdown: {
            $push: '$severity',
          },
          actionBreakdown: {
            $push: '$action',
          },
        },
      },
    ];

    const [result] = await this.auditLogModel.aggregate(pipeline);

    if (!result) {
      return {
        totalLogs: 0,
        uniqueUsers: 0,
        successfulActions: 0,
        failedActions: 0,
        severityBreakdown: {},
        actionBreakdown: {},
      };
    }

    // Count occurrences
    const severityBreakdown = result.severityBreakdown.reduce((acc, severity) => {
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {});

    const actionBreakdown = result.actionBreakdown.reduce((acc, action) => {
      acc[action] = (acc[action] || 0) + 1;
      return acc;
    }, {});

    return {
      totalLogs: result.totalLogs,
      uniqueUsers: result.uniqueUsers.length,
      successfulActions: result.successfulActions,
      failedActions: result.failedActions,
      severityBreakdown,
      actionBreakdown,
    };
  }
}