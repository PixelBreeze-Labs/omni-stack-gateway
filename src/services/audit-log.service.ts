// src/services/audit-log.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditAction, ResourceType, AuditSeverity } from '../schemas/audit-log.schema';
import { Request } from 'express';
import { Types } from 'mongoose';
import { User } from '../schemas/user.schema';

export interface CreateAuditLogDto {
  businessId: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
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
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
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
        userName: dto.userName,
        userEmail: dto.userEmail,
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
    const userInfo = this.extractUserInfo(req);
    
    await this.createAuditLog({
      businessId,
      userId,
      userName: userInfo.name,
      userEmail: userInfo.email,
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
   * Authentication-specific audit logs - UPDATED SIGNATURE
   */
  async logAuthentication(
    action: AuditAction,
    resourceType: ResourceType, // 🆕 Added resourceType parameter
    email: string,
    success: boolean,
    ipAddress: string,
    userAgent?: string,
    businessId?: string,
    userId?: string,
    userName?: string, // 🆕 Added userName parameter
    errorMessage?: string
  ): Promise<void> {
    await this.createAuditLog({
      businessId: businessId || 'system',
      userId,
      userName,
      userEmail: email,
      action,
      resourceType, // 🆕 Now using the resourceType parameter
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
    userName: string, // 🆕 Added userName parameter
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
      userName, // 🆕 Store userName
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
    userName: string, // 🆕 Added userName parameter
    resourceType: ResourceType,
    resourceId: string,
    resourceName: string,
    req?: Request
  ): Promise<void> {
    await this.createAuditLog({
      businessId,
      userId,
      userName, // 🆕 Store userName
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
    userName: string, // 🆕 Added userName parameter
    action: AuditAction,
    resourceType: ResourceType,
    affectedCount: number,
    req?: Request
  ): Promise<void> {
    await this.createAuditLog({
      businessId,
      userId,
      userName, // 🆕 Store userName
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
    userName: string, // 🆕 Added userName parameter
    action: AuditAction,
    description: string,
    req?: Request,
    severity: AuditSeverity = AuditSeverity.HIGH
  ): Promise<void> {
    await this.createAuditLog({
      businessId,
      userId,
      userName, // 🆕 Store userName
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
   * 🆕 Extract user information from request
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
 * Get audit logs for a business with filters - 🆕 ENHANCED WITH USER LOOKUP
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
  
    // Build match query for MongoDB
    const matchQuery: any = {
      businessId: new Types.ObjectId(businessId),
      isDeleted: false,
    };
  
    if (userId) matchQuery.userId = userId;
    if (action) matchQuery.action = action;
    if (resourceType) matchQuery.resourceType = resourceType;
    if (severity) matchQuery.severity = severity;
  
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = startDate;
      if (endDate) matchQuery.createdAt.$lte = endDate;
    }
  
    const skip = (page - 1) * limit;
  
    // Get logs and total count
    const [logs, total] = await Promise.all([
      this.auditLogModel.find(matchQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.auditLogModel.countDocuments(matchQuery)
    ]);
  
    // FOR EACH LOG - LOOKUP USER AND ATTACH NAME
    const enhancedLogs = await Promise.all(
      logs.map(async (log) => {
        const logObj = log.toObject();
        
        if (logObj.userId) {
          try {
            // You need to inject User model in constructor
            const user = await this.userModel.findById(logObj.userId, 'name surname email');
            if (user) {
              logObj.userName = user.name || 
                `${user.name || ''} ${user.surname || ''}`.trim() || 
                user.email?.split('@')[0] || 
                'Unknown User';

            logObj.userEmail = user.email;
            }
          } catch (error) {
            // If user lookup fails, just use email or fallback
            logObj.userName = logObj.userEmail?.split('@')[0] || 'Unknown User';
          }
        }
        
        return logObj;
      })
    );
  
    return {
      logs: enhancedLogs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 🆕 OPTIONAL: Get audit logs with user population from users collection
   * Use this version if you want to populate user data from a separate users collection
   */
  async getAuditLogsWithUserPopulation(
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

    // Build match query for MongoDB
    const matchQuery: any = {
      businessId: new Types.ObjectId(businessId),
      isDeleted: false,
    };

    if (userId) matchQuery.userId = userId;
    if (action) matchQuery.action = action;
    if (resourceType) matchQuery.resourceType = resourceType;
    if (severity) matchQuery.severity = severity;

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = startDate;
      if (endDate) matchQuery.createdAt.$lte = endDate;
    }

    const skip = (page - 1) * limit;

    // Aggregation pipeline with user lookup
    const pipeline = [
      { $match: matchQuery },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          logs: [
            { $skip: skip },
            { $limit: limit },
            // 🔄 Lookup user data from users collection
            {
              $lookup: {
                from: 'users', // Make sure this matches your users collection name
                let: { userIdStr: '$userId' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: [{ $toString: '$_id' }, '$userIdStr']
                      }
                    }
                  },
                  { 
                    $project: { 
                      name: 1, 
                      surname: 1, 
                      email: 1,
                    } 
                  }
                ],
                as: 'userDetails'
              }
            },
            // 🔄 Merge user data into main document
            {
              $addFields: {
                userName: {
                  $cond: {
                    if: { $gt: [{ $size: '$userDetails' }, 0] },
                    then: {
                      $let: {
                        vars: { user: { $arrayElemAt: ['$userDetails', 0] } },
                        in: {
                          $cond: {
                            if: '$user.name',
                            then: '$user.name',
                            else: {
                              $concat: [
                                { $ifNull: ['$user.name', ''] },
                                ' ',
                                { $ifNull: ['$user.surname', ''] }
                              ]
                            }
                          }
                        }
                      }
                    },
                    else: '$userName' // Keep existing userName if no user found
                  }
                },
                userEmail: {
                  $cond: {
                    if: { $gt: [{ $size: '$userDetails' }, 0] },
                    then: { $arrayElemAt: ['$userDetails.email', 0] },
                    else: '$userEmail' // Keep existing userEmail if no user found
                  }
                }
              }
            },
            // 🧹 Remove temporary userDetails field
            {
              $unset: 'userDetails'
            }
          ],
          totalCount: [
            { $count: "count" }
          ]
        }
      }
    ];

     // @ts-ignore
    const [result] = await this.auditLogModel.aggregate(pipeline);
    
    const logs = result.logs || [];
    const total = result.totalCount[0]?.count || 0;

    return {
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
 * 🆕 Get recent audit logs with user information - ENHANCED WITH USER LOOKUP
 */
async getRecentAuditLogs(businessId: string, limit: number = 20) {
    const matchQuery = {
      businessId: new Types.ObjectId(businessId),
      isDeleted: false,
    };
  
    // Get logs first
    const logs = await this.auditLogModel
      .find(matchQuery)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  
    // FOR EACH LOG - LOOKUP USER AND ATTACH NAME & EMAIL
    const enhancedLogs = await Promise.all(
      logs.map(async (log) => {
        const logObj = log.toObject();
        
        if (logObj.userId) {
          try {
            // Lookup user details from users collection
            const user = await this.userModel.findById(logObj.userId, 'name surname email');
            if (user) {
              logObj.userName = user.name || 
                `${user.name || ''} ${user.surname || ''}`.trim() || 
                user.email?.split('@')[0] || 
                'Unknown User';
  
              logObj.userEmail = user.email;
            }
          } catch (error) {
            // If user lookup fails, use fallback
            logObj.userName = logObj.userEmail?.split('@')[0] || 'Unknown User';
          }
        }
        
        return logObj;
      })
    );
  
    return {
      logs: enhancedLogs,
      total: enhancedLogs.length,
    };
  }
  

  /**
 * Get security events - ENHANCED WITH USER LOOKUP
 */
async getSecurityEvents(businessId: string, days: number = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
  
    const matchQuery = {
      businessId: new Types.ObjectId(businessId),
      isDeleted: false,
      createdAt: { $gte: startDate },
      $or: [
        { severity: { $in: [AuditSeverity.HIGH, AuditSeverity.CRITICAL] } },
        { 'metadata.securityEvent': true },
        { action: { $in: [
          AuditAction.LOGIN_FAILURE,
          AuditAction.UNAUTHORIZED_ACCESS_ATTEMPT,
          AuditAction.SECURITY_VIOLATION,
          AuditAction.API_KEY_REVOKED,
        ]}},
      ],
    };
  
    const [logs, criticalCount, highCount] = await Promise.all([
      this.auditLogModel.find(matchQuery).sort({ createdAt: -1 }).limit(50).exec(),
      this.auditLogModel.countDocuments({ ...matchQuery, severity: AuditSeverity.CRITICAL }),
      this.auditLogModel.countDocuments({ ...matchQuery, severity: AuditSeverity.HIGH }),
    ]);
  
    // 🆕 ENHANCE LOGS WITH USER INFORMATION
    const enhancedLogs = await Promise.all(
      logs.map(async (log) => {
        const logObj = log.toObject();
        
        if (logObj.userId) {
          try {
            const user = await this.userModel.findById(logObj.userId, 'name surname email');
            if (user) {
              logObj.userName = user.name || 
                `${user.name || ''} ${user.surname || ''}`.trim() || 
                user.email?.split('@')[0] || 
                'Unknown User';
  
              logObj.userEmail = user.email;
            }
          } catch (error) {
            logObj.userName = logObj.userEmail?.split('@')[0] || 'Unknown User';
          }
        }
        
        return logObj;
      })
    );
  
    return {
      logs: enhancedLogs,
      criticalCount,
      highCount,
      total: enhancedLogs.length,
    };
  }

  /**
 * Get user activity - ENHANCED WITH USER LOOKUP
 */
async getUserActivity(businessId: string, userId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
  
    const matchQuery = {
      businessId: new Types.ObjectId(businessId),
      userId,
      isDeleted: false,
      createdAt: { $gte: startDate },
    };
  
    const [logs, totalActions, loginCount, dataModifications, failedAttempts] = await Promise.all([
      this.auditLogModel.find(matchQuery).sort({ createdAt: -1 }).limit(100).exec(),
      this.auditLogModel.countDocuments(matchQuery),
      this.auditLogModel.countDocuments({ ...matchQuery, action: AuditAction.LOGIN_SUCCESS }),
      this.auditLogModel.countDocuments({ 
        ...matchQuery, 
        action: { $in: [
          AuditAction.CLIENT_CREATED,
          AuditAction.CLIENT_UPDATED,
          AuditAction.PROJECT_CREATED,
          AuditAction.PROJECT_UPDATED,
        ]}
      }),
      this.auditLogModel.countDocuments({ ...matchQuery, success: false }),
    ]);
  
    // 🆕 ENHANCE LOGS WITH USER INFORMATION
    const enhancedLogs = await Promise.all(
      logs.map(async (log) => {
        const logObj = log.toObject();
        
        if (logObj.userId) {
          try {
            const user = await this.userModel.findById(logObj.userId, 'name surname email');
            if (user) {
              logObj.userName = user.name || 
                `${user.name || ''} ${user.surname || ''}`.trim() || 
                user.email?.split('@')[0] || 
                'Unknown User';
  
              logObj.userEmail = user.email;
            }
          } catch (error) {
            logObj.userName = logObj.userEmail?.split('@')[0] || 'Unknown User';
          }
        }
        
        return logObj;
      })
    );
  
    return {
      logs: enhancedLogs,
      summary: {
        totalActions,
        loginCount,
        dataModifications,
        failedAttempts,
      },
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
          businessId: new Types.ObjectId(businessId), // 🔧 Convert to ObjectId
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