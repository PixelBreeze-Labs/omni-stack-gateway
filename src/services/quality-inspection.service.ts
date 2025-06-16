// src/services/quality-inspection.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business, QualityInspectionConfiguration } from '../schemas/business.schema';
import { QualityInspection } from '../schemas/quality-inspection.schema';
import { Employee } from '../schemas/employee.schema';
import { User } from '../schemas/user.schema';

import { SaasNotificationService } from './saas-notification.service';
import { AuditLogService } from './audit-log.service';
import { AuditAction, AuditSeverity, ResourceType } from '../schemas/audit-log.schema';
import { DeliveryChannel, NotificationPriority, NotificationType } from '../schemas/saas-notification.schema';
import { StaffluentOneSignalService } from './staffluent-onesignal.service';

// DTOs for inspection creation
export interface CreateDetailedInspectionDto {
    appProjectId: string;
    appClientId: string;
    constructionSiteId?: string;
    location: string;
    inspectionCategory?: string;
    checklistItems: any[];
    photos?: string[];
    signature?: string;
    notes?: string;
  }
  
  export interface CreateSimpleInspectionDto {
    appProjectId: string;
    appClientId: string;
    constructionSiteId?: string;
    location: string;
    overallRating: number;
    remarks: string;
    improvementSuggestions?: string;
    notes?: string;
  }
  
  export interface UpdateInspectionDto {
    location?: string;
    inspectionCategory?: string;
    checklistItems?: any[];
    photos?: string[];
    signature?: string;
    notes?: string;
    overallRating?: number;
    remarks?: string;
    improvementSuggestions?: string;
  }

  // DTOs for reviewer actions
export interface ApproveInspectionDto {
    notes?: string;
    reviewComments?: string;
  }
  
  export interface RejectInspectionDto {
    reason: string;
    feedback: string;
    requiredChanges?: string[];
  }
  
  export interface RequestRevisionDto {
    feedback: string;
    requiredChanges: string[];
    priority?: 'low' | 'medium' | 'high';
  }

  // DTOs for final approver actions
export interface FinalApprovalDto {
    notes?: string;
    clientNotificationRequired?: boolean;
    scheduledCompletionDate?: Date;
  }
  
  export interface OverrideDecisionDto {
    decision: 'approve' | 'reject';
    reason: string;
    justification: string;
    overridePreviousReview?: boolean;
  }

  // DTOs for client actions
export interface ClientReviewDto {
    feedback: string;
    rating?: number; // 1-5 client satisfaction rating
    concerns?: string[];
    requestedChanges?: string[];
  }
  
  export interface ClientApprovalDto {
    approved: boolean;
    clientSignature?: string;
    notes?: string;
    satisfactionRating?: number; // 1-5
  }
  
  export interface ClientRejectionDto {
    reason: string;
    requestedChanges: string[];
    priority?: 'low' | 'medium' | 'high';
    scheduledRevisitDate?: Date;
  }
  
  
@Injectable()
export class QualityInspectionService {
  private readonly logger = new Logger(QualityInspectionService.name);

  constructor(
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(QualityInspection.name) private qualityInspectionModel: Model<QualityInspection>,
    @InjectModel(Employee.name) private employeeModel: Model<Employee>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly notificationService: SaasNotificationService,
    private readonly auditLogService: AuditLogService,
    private readonly oneSignalService: StaffluentOneSignalService,
  ) {}

  /**
   * Update quality inspection configuration for a business
   */
  async updateQualityInspectionConfig(
    businessId: string, 
    config: QualityInspectionConfiguration
  ): Promise<{ success: boolean; message: string; config: QualityInspectionConfiguration }> {
    try {
      this.logger.log(`Updating quality inspection config for business: ${businessId}`);

      // Find business
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      // Validate configuration
      this.validateConfiguration(config);

      // Update business with new configuration
      const updatedBusiness = await this.businessModel.findByIdAndUpdate(
        businessId,
        { 
          $set: { 
            qualityInspectionConfig: config,
            updatedAt: new Date()
          } 
        },
        { new: true }
      );

      this.logger.log(`Successfully updated quality inspection config for business: ${businessId}`);

      return {
        success: true,
        message: 'Quality inspection configuration updated successfully',
        config: updatedBusiness.qualityInspectionConfig
      };
    } catch (error) {
      this.logger.error(`Error updating quality inspection config: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get quality inspection configuration for a business
   */
  async getQualityInspectionConfig(businessId: string): Promise<QualityInspectionConfiguration> {
    try {
      this.logger.log(`Getting quality inspection config for business: ${businessId}`);

      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      // Return config or default values
      const config = business.qualityInspectionConfig || this.getDefaultConfiguration();

      return config;
    } catch (error) {
      this.logger.error(`Error getting quality inspection config: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Send notification for quality inspection updates
   */
  private async sendQualityInspectionNotification(
    inspection: QualityInspection,
    notificationType: 'inspection_created' | 'inspection_submitted' | 'inspection_approved' | 
                     'inspection_rejected' | 'inspection_revision_requested' | 'inspection_assigned' |
                     'final_approval_granted' | 'inspection_overridden' | 'client_review_submitted',
    recipientUserIds: string[],
    additionalData?: any
  ): Promise<{
    success: boolean;
    debugInfo?: any;
    oneSignalError?: string;
    oneSignalDetails?: any;
    emailResult?: any;
  }> {
    const debugInfo: any = {
      timestamp: new Date().toISOString(),
      inspectionId: inspection._id.toString(),
      businessId: inspection.businessId,
      notificationType,
      recipientCount: recipientUserIds.length,
      steps: []
    };

    try {
      // Step 1: Configuration check
      const configCheck = {
        oneSignalConfigured: this.oneSignalService.isConfigured(),
        oneSignalStatus: this.oneSignalService.getStatus(),
        environmentVars: {
          ONESIGNAL_STAFFLUENT_APP_ID: process.env.ONESIGNAL_STAFFLUENT_APP_ID ? 'SET' : 'MISSING',
          ONESIGNAL_STAFFLUENT_API_KEY: process.env.ONESIGNAL_STAFFLUENT_API_KEY ? 'SET' : 'MISSING'
        }
      };
      debugInfo.steps.push({ step: 'config_check', result: configCheck });

      // Step 2: Get business details
      const business = await this.businessModel.findById(inspection.businessId);
      if (!business) {
        debugInfo.steps.push({ step: 'business_lookup', result: 'FAILED - Business not found' });
        return { success: false, debugInfo, oneSignalError: 'Business not found' };
      }
      debugInfo.steps.push({ step: 'business_lookup', result: 'SUCCESS', businessName: business.name });

      // Step 3: Prepare notification content based on type
      let title: string;
      let body: string;
      let priority: NotificationPriority = NotificationPriority.MEDIUM;
      let buttons: Array<{ id: string; text: string }> = [];

      switch (notificationType) {
        case 'inspection_created':
          title = '📋 New Quality Inspection';
          body = `Quality inspection created for ${inspection.location}`;
          priority = NotificationPriority.MEDIUM;
          buttons = [
            { id: 'view_inspection', text: 'View Inspection' },
            { id: 'start_review', text: 'Start Review' }
          ];
          break;

        case 'inspection_submitted':
          title = '🔍 Inspection Submitted for Review';
          body = `Quality inspection at ${inspection.location} is ready for review`;
          priority = NotificationPriority.HIGH;
          buttons = [
            { id: 'review_inspection', text: 'Review Now' },
            { id: 'view_details', text: 'View Details' }
          ];
          break;

        case 'inspection_approved':
          title = '✅ Inspection Approved';
          body = `Quality inspection for ${inspection.location} has been approved`;
          priority = NotificationPriority.MEDIUM;
          buttons = [
            { id: 'view_inspection', text: 'View Inspection' },
            { id: 'final_approval', text: 'Final Approval' }
          ];
          break;

        case 'inspection_rejected':
          title = '❌ Inspection Rejected';
          body = `Quality inspection for ${inspection.location} requires attention`;
          priority = NotificationPriority.HIGH;
          buttons = [
            { id: 'view_feedback', text: 'View Feedback' },
            { id: 'revise_inspection', text: 'Revise' }
          ];
          break;

        case 'inspection_revision_requested':
          title = '🔄 Revision Requested';
          body = `Quality inspection for ${inspection.location} needs revision`;
          priority = NotificationPriority.HIGH;
          buttons = [
            { id: 'view_feedback', text: 'View Feedback' },
            { id: 'start_revision', text: 'Start Revision' }
          ];
          break;

        case 'inspection_assigned':
          title = '👤 Inspection Assigned';
          body = `You've been assigned to review inspection at ${inspection.location}`;
          priority = NotificationPriority.MEDIUM;
          buttons = [
            { id: 'start_review', text: 'Start Review' },
            { id: 'view_details', text: 'View Details' }
          ];
          break;

        case 'final_approval_granted':
          title = '🎉 Final Approval Granted';
          body = `Quality inspection for ${inspection.location} has received final approval`;
          priority = NotificationPriority.HIGH;
          buttons = [
            { id: 'view_inspection', text: 'View Inspection' },
            { id: 'notify_client', text: 'Notify Client' }
          ];
          break;

        case 'inspection_overridden':
          title = '⚠️ Inspection Decision Overridden';
          body = `Quality inspection decision for ${inspection.location} has been overridden`;
          priority = NotificationPriority.HIGH;
          buttons = [
            { id: 'view_details', text: 'View Details' },
            { id: 'review_override', text: 'Review Override' }
          ];
          break;

        case 'client_review_submitted':
          title = '💬 Client Review Submitted';
          body = `Client has submitted review for inspection at ${inspection.location}`;
          priority = NotificationPriority.MEDIUM;
          buttons = [
            { id: 'view_review', text: 'View Review' },
            { id: 'respond', text: 'Respond' }
          ];
          break;

        default:
          title = 'Quality Inspection Update';
          body = `Inspection at ${inspection.location} has been updated`;
          priority = NotificationPriority.MEDIUM;
      }

      const actionData = {
        type: 'quality_inspection',
        entityId: inspection._id.toString(),
        entityType: 'inspection',
        inspectionId: inspection._id.toString(),
        location: inspection.location,
        status: inspection.status,
        priority: NotificationPriority.MEDIUM,
        url: `https://app.staffluent.co/quality/inspections/${inspection._id}`
      };

      const notificationContent = { title, body, priority, actionData, buttons };
      debugInfo.steps.push({ step: 'notification_content_prepared', result: notificationContent });

      // Step 4: Create database notifications for each recipient
      const dbNotificationResults = [];
      for (const userId of recipientUserIds) {
        try {
          const user = await this.userModel.findById(userId);
          if (!user) {
            debugInfo.steps.push({ 
              step: `database_notification_failed_${userId}`, 
              result: { success: false, error: 'User not found' } 
            });
            continue;
          }

          const emailEnabled = user.metadata?.get('emailNotificationsEnabled') !== 'false';
          const userChannels: DeliveryChannel[] = [DeliveryChannel.APP];
          
          if (emailEnabled) {
            userChannels.push(DeliveryChannel.EMAIL);
          }

          const notification = await this.notificationService.createNotification({
            businessId: inspection.businessId,
            userId: userId,
            title,
            body,
            type: NotificationType.QUALITY_INSPECTION,
            priority,
            channels: [DeliveryChannel.APP],
            reference: {
              type: 'quality_inspection',
              id: inspection._id.toString()
            },
            actionData
          });

          dbNotificationResults.push({
            userId,
            success: true,
            notificationId: notification._id.toString(),
            channels: userChannels
          });

        } catch (dbError: any) {
          dbNotificationResults.push({
            userId,
            success: false,
            error: dbError.message
          });
        }
      }

      debugInfo.steps.push({ 
        step: 'database_notifications_created', 
        result: { 
          total: recipientUserIds.length,
          successful: dbNotificationResults.filter(r => r.success).length,
          failed: dbNotificationResults.filter(r => !r.success).length,
          details: dbNotificationResults
        } 
      });

      // Step 5: Send OneSignal notification
      let oneSignalError: string | undefined;
      let oneSignalDetails: any;

      try {
        if (this.oneSignalService.isConfigured()) {
          const oneSignalPayload = {
            userIds: recipientUserIds,
            data: {
              type: 'quality_inspection',
              inspectionId: inspection._id.toString(),
              notificationType,
              location: inspection.location,
              status: inspection.status,
              ...actionData,
              ...additionalData
            },
            url: actionData.url,
            priority: this.mapNotificationPriorityToOneSignal(priority),
            buttons: buttons
          };

          debugInfo.steps.push({ 
            step: 'onesignal_payload_prepared', 
            result: { 
              businessId: inspection.businessId,
              title, 
              body, 
              payload: oneSignalPayload,
              recipientCount: recipientUserIds.length
            } 
          });

          const oneSignalResult = await this.oneSignalService.sendToBusinessUsersWeb(
            inspection.businessId,
            title,
            body,
            {
              userIds: recipientUserIds,
              data: oneSignalPayload.data,
              url: oneSignalPayload.url,
              priority: oneSignalPayload.priority,
              buttons: oneSignalPayload.buttons
            }
          );

          oneSignalDetails = oneSignalResult;
          debugInfo.steps.push({ 
            step: 'onesignal_notification_sent', 
            result: { success: true, oneSignalResult } 
          });
          
          this.logger.log(`OneSignal notification sent for inspection ${inspection._id}: ${oneSignalResult?.id}`);
        } else {
          oneSignalError = 'OneSignal not configured - missing APP_ID or API_KEY';
          debugInfo.steps.push({ 
            step: 'onesignal_skipped', 
            result: { reason: oneSignalError, config: configCheck } 
          });
          this.logger.warn('OneSignal not configured - skipping push notification');
        }
      } catch (oneSignalErr: any) {
        oneSignalError = oneSignalErr.message;
        oneSignalDetails = {
          error: oneSignalErr.message,
          response: oneSignalErr.response?.data,
          status: oneSignalErr.response?.status,
          statusText: oneSignalErr.response?.statusText
        };

        debugInfo.steps.push({ 
          step: 'onesignal_notification_failed', 
          result: oneSignalDetails 
        });

        this.logger.error(`OneSignal notification failed for inspection ${inspection._id}: ${oneSignalErr.message}`);
      }

      // Final summary
      debugInfo.summary = {
        databaseNotifications: dbNotificationResults.filter(r => r.success).length + '/' + dbNotificationResults.length,
        oneSignalNotification: oneSignalError ? 'FAILED' : (oneSignalDetails ? 'SUCCESS' : 'SKIPPED'),
        overallSuccess: true
      };

      this.logger.log(`Sent quality inspection ${notificationType} notification for inspection ${inspection._id} to ${recipientUserIds.length} users`);

      return { 
        success: true, 
        debugInfo,
        oneSignalError, 
        oneSignalDetails
      };

    } catch (error: any) {
      debugInfo.steps.push({ 
        step: 'major_error', 
        result: { 
          error: error.message, 
          stack: error.stack?.split('\n').slice(0, 5).join('\n') 
        } 
      });

      this.logger.error(`Error sending quality inspection notification: ${error.message}`, error.stack);
      return { 
        success: false, 
        debugInfo,
        oneSignalError: `Major error: ${error.message}` 
      };
    }
  }


  /**
   * Map notification priority to OneSignal priority
   */
  private mapNotificationPriorityToOneSignal(priority: NotificationPriority): number {
    switch (priority) {
      case NotificationPriority.LOW:
        return 3;
      case NotificationPriority.MEDIUM:
        return 5;
      case NotificationPriority.HIGH:
        return 7;
      case NotificationPriority.URGENT:
        return 10;
      default:
        return 5;
    }
  }


   /**
   * Get users to notify based on inspection stage and business configuration
   */
   private async getNotificationRecipients(
    inspection: QualityInspection,
    notificationType: string
  ): Promise<string[]> {
    const business = await this.businessModel.findById(inspection.businessId);
    if (!business) return [];

    const config = business.qualityInspectionConfig || this.getDefaultConfiguration();
    let targetRoles: string[] = [];
    let specificUsers: string[] = [];

    switch (notificationType) {
      case 'inspection_created':
        // Notify reviewers and managers
        targetRoles = [...config.canReview, config.finalApprover];
        break;

      case 'inspection_submitted':
        // Notify reviewers
        targetRoles = config.canReview;
        break;

      case 'inspection_approved':
        // Notify final approver and inspector
        targetRoles = [config.finalApprover];
        specificUsers = [inspection.inspectorId];
        break;

      case 'inspection_rejected':
      case 'inspection_revision_requested':
        // Notify inspector
        specificUsers = [inspection.inspectorId];
        break;

      case 'inspection_assigned':
        // Notify assigned reviewer
        if (inspection.reviewerId) {
          specificUsers = [inspection.reviewerId];
        }
        break;

      case 'final_approval_granted':
        // Notify inspector and business admin
        specificUsers = [inspection.inspectorId];
        if (business.adminUserId) {
          specificUsers.push(business.adminUserId);
        }
        break;

      case 'inspection_overridden':
        // Notify inspector, reviewer, and admin
        specificUsers = [inspection.inspectorId];
        if (inspection.reviewerId) {
          specificUsers.push(inspection.reviewerId);
        }
        if (business.adminUserId) {
          specificUsers.push(business.adminUserId);
        }
        break;

      case 'client_review_submitted':
        // Notify business admin and project managers
        targetRoles = ['project_manager', 'operations_manager'];
        if (business.adminUserId) {
          specificUsers.push(business.adminUserId);
        }
        break;
    }

    // Find users by roles
    const roleUserIds: string[] = [];
    if (targetRoles.length > 0) {
      const employees = await this.employeeModel.find({
        businessId: inspection.businessId,
        isDeleted: { $ne: true },
        $or: [
          { 'metadata.role': { $in: targetRoles } },
          { 'metadata.qualityRole': { $in: targetRoles } }
        ]
      });

      roleUserIds.push(...employees.map(emp => emp.user_id).filter(id => id));
    }

    // Combine specific users and role-based users, remove duplicates
    const allUserIds = [...new Set([...specificUsers, ...roleUserIds])];
    
    // Filter out invalid user IDs
    return allUserIds.filter(userId => userId && userId !== 'null' && userId !== 'undefined');
  }

  /**
 * Send notification to user when assigned quality role
 */
private async sendQualityRoleAssignmentNotification(
  userId: string,
  businessId: string,
  role: string,
  businessName: string
): Promise<void> {
  try {
    // Get user details
    const user = await this.userModel.findById(userId);
    if (!user) {
      this.logger.warn(`User not found for quality role notification: ${userId}`);
      return;
    }

    // Check user's notification preferences
    const emailEnabled = user.metadata?.get('emailNotificationsEnabled') !== 'false'; // Default true

    const title = `Quality Role Assigned`;
    const body = `You have been assigned the ${role.replace('_', ' ')} quality role in ${businessName}.`;
    const priority = NotificationPriority.MEDIUM;

    // Create action data for deep linking
    const actionData = {
      type: 'quality_assignment',
      entityId: userId,
      entityType: 'quality_role',
      role: role,
      url: `https://app.staffluent.co`
    };

    // Determine channels
    const channels: DeliveryChannel[] = [DeliveryChannel.APP]; // Always send in-app

    // Send notification
    await this.notificationService.createNotification({
      businessId,
      userId,
      title,
      body,
      type: NotificationType.SYSTEM,
      priority,
      channels: [DeliveryChannel.APP], // Send in-app first
      reference: {
        type: 'quality_role_assignment',
        id: userId
      },
      actionData
    });


    this.logger.log(`Sent quality role assignment notification to user ${userId} via channels: ${channels.join(', ')}`);

  } catch (error) {
    this.logger.error(`Error sending quality role assignment notification: ${error.message}`, error.stack);
  }
}

/**
 * Assign quality role to a user in a business
 */
async assignQualityRole(
  businessId: string, 
  userId: string, 
  role: string,
  adminUserId?: string,
  req?: any
): Promise<{ success: boolean; message: string; qualityTeam?: any[]; error?: any }> {
  const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
  const userAgent = req?.get('User-Agent');
  const startTime = Date.now();

  try {
    this.logger.log(`Assigning quality role ${role} to user ${userId} in business: ${businessId}`);

    // Validate inputs
    if (!businessId || !userId || !role) {
      return {
        success: false,
        message: 'Missing required parameters: businessId, userId, and role are required',
        error: {
          code: 'MISSING_PARAMETERS',
          details: {
            businessId: !businessId ? 'required' : 'provided',
            userId: !userId ? 'required' : 'provided',
            role: !role ? 'required' : 'provided'
          }
        }
      };
    }

    // Validate role first
    try {
      this.validateRole(role);
    } catch (roleError) {
      // Log validation error
      await this.auditLogService.createAuditLog({
        businessId,
        userId: adminUserId,
        action: AuditAction.USER_ROLE_CHANGED,
        resourceType: ResourceType.USER,
        resourceId: userId,
        resourceName: `Quality role assignment: ${role}`,
        success: false,
        errorMessage: roleError.message,
        severity: AuditSeverity.MEDIUM,
        ipAddress,
        userAgent,
        metadata: {
          targetUserId: userId,
          attemptedRole: role,
          validRoles: [
            'team_leader',
            'quality_staff', 
            'site_supervisor',
            'project_manager',
            'operations_manager'
          ],
          errorReason: 'invalid_role',
          operationDuration: Date.now() - startTime
        }
      });

      return {
        success: false,
        message: roleError.message,
        error: {
          code: 'INVALID_ROLE',
          details: { providedRole: role, validRoles: [
            'team_leader',
            'quality_staff', 
            'site_supervisor',
            'project_manager',
            'operations_manager'
          ]}
        }
      };
    }

    // Find business
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      // Log business not found
      await this.auditLogService.createAuditLog({
        businessId,
        userId: adminUserId,
        action: AuditAction.USER_ROLE_CHANGED,
        resourceType: ResourceType.USER,
        resourceId: userId,
        resourceName: `Quality role assignment: ${role}`,
        success: false,
        errorMessage: 'Business not found',
        severity: AuditSeverity.HIGH,
        ipAddress,
        userAgent,
        metadata: {
          targetUserId: userId,
          role: role,
          errorReason: 'business_not_found',
          operationDuration: Date.now() - startTime
        }
      });

      return {
        success: false,
        message: 'Business not found',
        error: {
          code: 'BUSINESS_NOT_FOUND',
          details: { businessId }
        }
      };
    }

    // Find employee by user_id and businessId
    const employee = await this.employeeModel.findOne({ 
      user_id: userId, 
      businessId,
      isDeleted: { $ne: true }
    });

    if (!employee) {
      // Log employee not found
      await this.auditLogService.createAuditLog({
        businessId,
        userId: adminUserId,
        action: AuditAction.USER_ROLE_CHANGED,
        resourceType: ResourceType.USER,
        resourceId: userId,
        resourceName: `Quality role assignment: ${role}`,
        success: false,
        errorMessage: 'Employee not found in this business',
        severity: AuditSeverity.HIGH,
        ipAddress,
        userAgent,
        metadata: {
          targetUserId: userId,
          role: role,
          errorReason: 'employee_not_found',
          searchCriteria: 'user_id + businessId + not deleted',
          operationDuration: Date.now() - startTime
        }
      });

      return {
        success: false,
        message: 'Employee not found in this business',
        error: {
          code: 'EMPLOYEE_NOT_FOUND',
          details: { 
            userId, 
            businessId,
            searchCriteria: 'user_id + businessId + not deleted'
          }
        }
      };
    }

    // Get current metadata or initialize empty object
    const currentMetadata = employee.metadata || new Map();
    const oldRole = currentMetadata.get('qualityRole');
    
    // Prepare permissions object
    const permissions = this.getDefaultPermissions(role);
    
    // Create updated metadata object
    const updatedMetadata = new Map(currentMetadata);
    updatedMetadata.set('qualityRole', role);
    updatedMetadata.set('qualityAssignedDate', new Date());
    updatedMetadata.set('qualityPermissions', permissions);

    // Update employee's quality role in metadata
    const updateResult = await this.employeeModel.findOneAndUpdate(
      { user_id: userId, businessId },
      { 
        $set: { 
          metadata: updatedMetadata
        } 
      },
      { 
        new: true,
        runValidators: true 
      }
    );

    // Check if update was successful
    if (!updateResult) {
      // Log update failure
      await this.auditLogService.createAuditLog({
        businessId,
        userId: adminUserId,
        action: AuditAction.USER_ROLE_CHANGED,
        resourceType: ResourceType.USER,
        resourceId: userId,
        resourceName: `Quality role assignment: ${role}`,
        success: false,
        errorMessage: 'Failed to update employee record',
        severity: AuditSeverity.HIGH,
        ipAddress,
        userAgent,
        metadata: {
          targetUserId: userId,
          role: role,
          oldRole: oldRole,
          errorReason: 'update_failed',
          operationDuration: Date.now() - startTime
        }
      });

      return {
        success: false,
        message: 'Failed to update employee - no matching record found during update',
        error: {
          code: 'UPDATE_FAILED_NO_MATCH',
          details: { 
            userId, 
            businessId
          }
        }
      };
    }

    // Get user details for audit log
    const user = await this.userModel.findById(userId);
    const userName = user?.name || employee.name || 'Unknown User';
    const userEmail = user?.email || employee.email || 'Unknown Email';

    // Log successful quality role assignment
    await this.auditLogService.createAuditLog({
      businessId,
      userId: adminUserId,
      action: AuditAction.USER_ROLE_CHANGED,
      resourceType: ResourceType.USER,
      resourceId: userId,
      resourceName: `${userName} - Quality Role Assignment`,
      success: true,
      severity: AuditSeverity.MEDIUM,
      ipAddress,
      userAgent,
      oldValues: { qualityRole: oldRole },
      newValues: { qualityRole: role },
      changedFields: ['qualityRole', 'qualityAssignedDate', 'qualityPermissions'],
      metadata: {
        targetUserId: userId,
        targetUserName: userName,
        targetUserEmail: userEmail,
        employeeId: employee._id.toString(),
        role: role,
        oldRole: oldRole,
        permissions: permissions,
        assignedDate: new Date(),
        businessName: business.name,
        operationDuration: Date.now() - startTime
      }
    });

    // Send notification to the assigned user
    await this.sendQualityRoleAssignmentNotification(
      userId,
      businessId,
      role,
      business.name
    );

    this.logger.log(`Successfully assigned quality role ${role} to employee: ${employee._id}`);

    // Get updated quality team
    const qualityTeam = await this.getQualityTeam(businessId);
    
    return {
      success: true,
      message: `Successfully assigned ${role.replace('_', ' ')} role to ${userName}`,
      qualityTeam
    };

  } catch (error) {
    // Log unexpected errors
    await this.auditLogService.createAuditLog({
      businessId,
      userId: adminUserId,
      action: AuditAction.USER_ROLE_CHANGED,
      resourceType: ResourceType.USER,
      resourceId: userId,
      resourceName: `Quality role assignment: ${role}`,
      success: false,
      errorMessage: 'Unexpected error during quality role assignment',
      severity: AuditSeverity.HIGH,
      ipAddress,
      userAgent,
      metadata: {
        targetUserId: userId,
        role: role,
        errorReason: 'unexpected_error',
        errorName: error.name,
        errorMessage: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        operationDuration: Date.now() - startTime
      }
    });

    this.logger.error(`Error assigning quality role: ${error.message}`, error.stack);
    
    // Return detailed error information
    return {
      success: false,
      message: `Failed to assign quality role: ${error.message}`,
      error: {
        code: 'INTERNAL_ERROR',
        details: {
          errorName: error.name,
          errorMessage: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
          parameters: { businessId, userId, role }
        }
      }
    };
  }
}

/**
 * Helper method to extract IP address from request
 */
private extractIpAddress(req: any): string {
  return (
    req?.headers?.['x-forwarded-for'] ||
    req?.headers?.['x-real-ip'] ||
    req?.connection?.remoteAddress ||
    req?.socket?.remoteAddress ||
    'unknown'
  ).split(',')[0].trim();
}

/**
 * Send notification to user when quality role is removed
 */
private async sendQualityRoleRemovalNotification(
  userId: string,
  businessId: string,
  removedRole: string,
  businessName: string
): Promise<void> {
  try {
    // Get user details
    const user = await this.userModel.findById(userId);
    if (!user) {
      this.logger.warn(`User not found for quality role removal notification: ${userId}`);
      return;
    }

    const title = `Quality Role Removed`;
    const body = `Your ${removedRole.replace('_', ' ')} quality role has been removed in ${businessName}.`;
    const priority = NotificationPriority.MEDIUM;

    // Create action data
    const actionData = {
      type: 'quality_role_removal',
      entityId: userId,
      entityType: 'quality_role',
      removedRole: removedRole,
      url: `https://app.staffluent.co`
    };

    // Send notification
    await this.notificationService.createNotification({
      businessId,
      userId,
      title,
      body,
      type: NotificationType.SYSTEM,
      priority,
      channels: [DeliveryChannel.APP],
      reference: {
        type: 'quality_role_removal',
        id: userId
      },
      actionData
    });

    this.logger.log(`Sent quality role removal notification to user ${userId}`);

  } catch (error) {
    this.logger.error(`Error sending quality role removal notification: ${error.message}`, error.stack);
  }
}

/**
 * Remove quality role from a user in a business
 */
async removeQualityRole(
  businessId: string,
  userId: string,
  adminUserId?: string,
  req?: any
): Promise<{ success: boolean; message: string; qualityTeam?: any[]; error?: any }> {
  const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
  const userAgent = req?.get('User-Agent');
  const startTime = Date.now();

  try {
    this.logger.log(`Removing quality role from user ${userId} in business: ${businessId}`);

    // Find business
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      await this.auditLogService.createAuditLog({
        businessId,
        userId: adminUserId,
        action: AuditAction.QUALITY_ROLE_REMOVED,
        resourceType: ResourceType.USER,
        resourceId: userId,
        resourceName: `Quality role removal`,
        success: false,
        errorMessage: 'Business not found',
        severity: AuditSeverity.HIGH,
        ipAddress,
        userAgent,
        metadata: {
          targetUserId: userId,
          errorReason: 'business_not_found',
          operationDuration: Date.now() - startTime
        }
      });

      return {
        success: false,
        message: 'Business not found',
        error: {
          code: 'BUSINESS_NOT_FOUND',
          details: { businessId }
        }
      };
    }

    // Find employee
    const employee = await this.employeeModel.findOne({
      user_id: userId,
      businessId,
      isDeleted: { $ne: true }
    });

    if (!employee) {
      await this.auditLogService.createAuditLog({
        businessId,
        userId: adminUserId,
        action: AuditAction.QUALITY_ROLE_REMOVED,
        resourceType: ResourceType.USER,
        resourceId: userId,
        resourceName: `Quality role removal`,
        success: false,
        errorMessage: 'Employee not found',
        severity: AuditSeverity.HIGH,
        ipAddress,
        userAgent,
        metadata: {
          targetUserId: userId,
          errorReason: 'employee_not_found',
          operationDuration: Date.now() - startTime
        }
      });

      return {
        success: false,
        message: 'Employee not found in this business',
        error: {
          code: 'EMPLOYEE_NOT_FOUND',
          details: { userId, businessId }
        }
      };
    }

    // Get current metadata
    const currentMetadata = employee.metadata || new Map();
    const oldRole = currentMetadata.get('qualityRole');

    if (!oldRole) {
      return {
        success: false,
        message: 'User does not have a quality role assigned',
        error: {
          code: 'NO_QUALITY_ROLE',
          details: { userId, businessId }
        }
      };
    }

    // Remove quality role from metadata
    const updatedMetadata = new Map(currentMetadata);
    updatedMetadata.delete('qualityRole');
    updatedMetadata.delete('qualityAssignedDate');
    updatedMetadata.delete('qualityPermissions');

    // Update employee
    const updateResult = await this.employeeModel.findOneAndUpdate(
      { user_id: userId, businessId },
      { 
        $set: { 
          metadata: updatedMetadata
        } 
      },
      { 
        new: true,
        runValidators: true 
      }
    );

    if (!updateResult) {
      await this.auditLogService.createAuditLog({
        businessId,
        userId: adminUserId,
        action: AuditAction.QUALITY_ROLE_REMOVED,
        resourceType: ResourceType.USER,
        resourceId: userId,
        resourceName: `Quality role removal`,
        success: false,
        errorMessage: 'Failed to update employee record',
        severity: AuditSeverity.HIGH,
        ipAddress,
        userAgent,
        metadata: {
          targetUserId: userId,
          oldRole: oldRole,
          errorReason: 'update_failed',
          operationDuration: Date.now() - startTime
        }
      });

      return {
        success: false,
        message: 'Failed to remove quality role',
        error: {
          code: 'UPDATE_FAILED',
          details: { userId, businessId }
        }
      };
    }

    // Get user details for audit log
    const user = await this.userModel.findById(userId);
    const userName = user?.name || employee.name || 'Unknown User';
    const userEmail = user?.email || employee.email || 'Unknown Email';

    // Log successful quality role removal
    await this.auditLogService.createAuditLog({
      businessId,
      userId: adminUserId,
      action: AuditAction.QUALITY_ROLE_REMOVED,
      resourceType: ResourceType.USER,
      resourceId: userId,
      resourceName: `${userName} - Quality Role Removal`,
      success: true,
      severity: AuditSeverity.MEDIUM,
      ipAddress,
      userAgent,
      oldValues: { 
        qualityRole: oldRole,
        hasQualityPermissions: true
      },
      newValues: { 
        qualityRole: null,
        hasQualityPermissions: false
      },
      changedFields: ['qualityRole', 'qualityPermissions'],
      metadata: {
        targetUserId: userId,
        targetUserName: userName,
        targetUserEmail: userEmail,
        employeeId: employee._id.toString(),
        removedRole: oldRole,
        removalDate: new Date(),
        businessName: business.name,
        operationDuration: Date.now() - startTime
      }
    });

    // Send notification to the user
    await this.sendQualityRoleRemovalNotification(
      userId,
      businessId,
      oldRole,
      business.name
    );

    this.logger.log(`Successfully removed quality role ${oldRole} from employee: ${employee._id}`);

    // Get updated quality team
    const qualityTeam = await this.getQualityTeam(businessId);

    return {
      success: true,
      message: `Successfully removed ${oldRole.replace('_', ' ')} role from ${userName}`,
      qualityTeam
    };

  } catch (error) {
    // Log unexpected errors
    await this.auditLogService.createAuditLog({
      businessId,
      userId: adminUserId,
      action: AuditAction.QUALITY_ROLE_REMOVED,
      resourceType: ResourceType.USER,
      resourceId: userId,
      resourceName: `Quality role removal`,
      success: false,
      errorMessage: 'Unexpected error during quality role removal',
      severity: AuditSeverity.HIGH,
      ipAddress,
      userAgent,
      metadata: {
        targetUserId: userId,
        errorReason: 'unexpected_error',
        errorName: error.name,
        errorMessage: error.message,
        operationDuration: Date.now() - startTime
      }
    });

    this.logger.error(`Error removing quality role: ${error.message}`, error.stack);

    return {
      success: false,
      message: `Failed to remove quality role: ${error.message}`,
      error: {
        code: 'INTERNAL_ERROR',
        details: {
          errorName: error.name,
          errorMessage: error.message,
          parameters: { businessId, userId }
        }
      }
    };
  }
}

  /**
 * Get quality team for a business
 */
async getQualityTeam(businessId: string): Promise<any[]> {
    try {
      this.logger.log(`Getting quality team for business: ${businessId}`);
  
      // Find business
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }
  
      // Find all employees with quality roles assigned
      const qualityEmployees = await this.employeeModel.find({
        businessId,
        isDeleted: { $ne: true },
        'metadata.qualityRole': { $exists: true }
      }).populate('user_id', 'name surname email');
  
      // Format the quality team response
      const qualityTeam = qualityEmployees.map(employee => {
        const user = employee.user_id as any;
        return {
          employeeId: employee._id,
          userId: user?._id,
          name: employee.name,
          email: employee.email,
          user: user ? {
            _id: user._id,
            name: user.name,
            surname: user.surname,
            email: user.email,
            fullName: user.surname ? `${user.name} ${user.surname}` : user.name
          } : null,
          qualityRole: employee.metadata?.get('qualityRole'),
          qualityAssignedDate: employee.metadata?.get('qualityAssignedDate'),
          qualityPermissions: employee.metadata?.get('qualityPermissions'),
          mainRole: employee.metadata?.get('role') || 'business_staff', // ← Fixed: from metadata
          isActive: true
        };
      });
  
      return qualityTeam;
    } catch (error) {
      this.logger.error(`Error getting quality team: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Validate quality inspection configuration
   */
  private validateConfiguration(config: QualityInspectionConfiguration): void {
    if (!config.canInspect || !Array.isArray(config.canInspect) || config.canInspect.length === 0) {
      throw new BadRequestException('canInspect must be a non-empty array');
    }

    if (!config.canReview || !Array.isArray(config.canReview) || config.canReview.length === 0) {
      throw new BadRequestException('canReview must be a non-empty array');
    }

    if (!config.finalApprover || typeof config.finalApprover !== 'string') {
      throw new BadRequestException('finalApprover must be a non-empty string');
    }

    // Validate boolean fields
    if (typeof config.allowSelfReview !== 'boolean') {
      throw new BadRequestException('allowSelfReview must be a boolean');
    }

    if (typeof config.requireClientSignoff !== 'boolean') {
      throw new BadRequestException('requireClientSignoff must be a boolean');
    }

    if (typeof config.requirePhotos !== 'boolean') {
      throw new BadRequestException('requirePhotos must be a boolean');
    }

    if (typeof config.requireSignature !== 'boolean') {
      throw new BadRequestException('requireSignature must be a boolean');
    }

    if (typeof config.useDetailedInspections !== 'boolean') {
      throw new BadRequestException('useDetailedInspections must be a boolean');
    }
  }

  /**
   * Validate role
   */
  private validateRole(role: string): void {
    const validRoles = [
      'team_leader',
      'quality_staff', 
      'site_supervisor',
      'project_manager',
      'operations_manager'
    ];

    if (!validRoles.includes(role)) {
      throw new BadRequestException(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }
  }

  /**
   * Get default configuration
   */
  private getDefaultConfiguration(): QualityInspectionConfiguration {
    return {
      canInspect: ['team_leader', 'quality_staff'],
      canReview: ['team_leader', 'project_manager'],
      finalApprover: 'operations_manager',
      allowSelfReview: true,
      requireClientSignoff: false,
      requirePhotos: true,
      requireSignature: true,
      useDetailedInspections: true
    };
  }

  /**
   * Get default permissions for a role
   */
  private getDefaultPermissions(role: string): any {
    const permissions = {
      team_leader: {
        canCreate: true,
        canReview: true,
        canApprove: false,
        canOverride: false,
        canViewAll: false,
        canExport: false,
        canDelete: false,
        restrictToOwnProjects: true
      },
      quality_staff: {
        canCreate: true,
        canReview: false,
        canApprove: false,
        canOverride: false,
        canViewAll: false,
        canExport: false,
        canDelete: false,
        restrictToOwnProjects: true
      },
      site_supervisor: {
        canCreate: true,
        canReview: true,
        canApprove: false,
        canOverride: false,
        canViewAll: true,
        canExport: false,
        canDelete: false,
        restrictToOwnProjects: false
      },
      project_manager: {
        canCreate: false,
        canReview: true,
        canApprove: true,
        canOverride: false,
        canViewAll: true,
        canExport: true,
        canDelete: false,
        restrictToOwnProjects: false
      },
      operations_manager: {
        canCreate: false,
        canReview: true,
        canApprove: true,
        canOverride: true,
        canViewAll: true,
        canExport: true,
        canDelete: true,
        restrictToOwnProjects: false
      }
    };

    return permissions[role] || permissions.quality_staff;
  }

  /**
   * Create detailed inspection (construction with photos/signature) - WITH NOTIFICATIONS
   */
  async createDetailedInspection(
    businessId: string,
    inspectorId: string,
    inspectionData: CreateDetailedInspectionDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Creating detailed inspection for business: ${businessId}, inspector: ${inspectorId}`);

      // Validate inspector has permission
      await this.validateInspectorPermissions(businessId, inspectorId, 'detailed');

      // Calculate passed/failed items from checklist
      const totalItems = inspectionData.checklistItems?.length || 0;
      const passedItems = inspectionData.checklistItems?.filter(item => item.status === 'pass').length || 0;
      const failedItems = inspectionData.checklistItems?.filter(item => item.status === 'fail').length || 0;
      const hasCriticalIssues = inspectionData.checklistItems?.some(item => 
        item.status === 'fail' && item.critical === true
      ) || false;

      // Create inspection record
      const inspection = await this.qualityInspectionModel.create({
        businessId,
        appProjectId: inspectionData.appProjectId,
        appClientId: inspectionData.appClientId,
        constructionSiteId: inspectionData.constructionSiteId,
        inspectorId,
        type: 'detailed',
        status: 'draft',
        location: inspectionData.location,
        inspectionCategory: inspectionData.inspectionCategory,
        passedItems,
        failedItems,
        totalItems,
        hasPhotos: (inspectionData.photos?.length || 0) > 0,
        hasSignature: !!inspectionData.signature,
        hasCriticalIssues,
        inspectionDate: new Date(),
        metadata: {
          checklistItems: JSON.stringify(inspectionData.checklistItems || []),
          photos: JSON.stringify(inspectionData.photos || []),
          signature: inspectionData.signature || '',
          notes: inspectionData.notes || ''
        }
      });

      // Send notification to relevant users
      const recipients = await this.getNotificationRecipients(inspection, 'inspection_created');
      if (recipients.length > 0) {
        await this.sendQualityInspectionNotification(
          inspection,
          'inspection_created',
          recipients,
          {
            inspectionType: 'detailed',
            totalItems,
            passedItems,
            failedItems,
            hasCriticalIssues
          }
        );
      }

      this.logger.log(`Successfully created detailed inspection: ${inspection._id}`);

      return {
        success: true,
        message: 'Detailed inspection created successfully',
        inspection
      };
    } catch (error) {
      this.logger.error(`Error creating detailed inspection: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Create simple inspection (basic quality review)
   */
  async createSimpleInspection(
    businessId: string,
    inspectorId: string,
    inspectionData: CreateSimpleInspectionDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Creating simple inspection for business: ${businessId}, inspector: ${inspectorId}`);
  
      // Validate inspector has permission
      await this.validateInspectorPermissions(businessId, inspectorId, 'simple');
  
      // Create inspection record
      const inspection = await this.qualityInspectionModel.create({
        businessId,
        appProjectId: inspectionData.appProjectId,
        appClientId: inspectionData.appClientId,
        constructionSiteId: inspectionData.constructionSiteId,
        inspectorId,
        type: 'simple',
        status: 'draft',
        location: inspectionData.location,
        overallRating: inspectionData.overallRating,
        hasPhotos: false,
        hasSignature: false,
        hasCriticalIssues: inspectionData.overallRating <= 2, // Rating 1-2 considered critical
        inspectionDate: new Date(),
        metadata: {
          remarks: inspectionData.remarks,
          improvementSuggestions: inspectionData.improvementSuggestions || '',
          notes: inspectionData.notes || ''
        }
      });
  
      this.logger.log(`Successfully created simple inspection: ${inspection._id}`);
  
      return {
        success: true,
        message: 'Simple inspection created successfully',
        inspection
      };
    } catch (error) {
      this.logger.error(`Error creating simple inspection: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Get inspections for a specific inspector
   */
  async getMyInspections(
    inspectorId: string,
    businessId: string,
    filters: {
      status?: string;
      constructionSiteId?: string;
      type?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ inspections: any[]; total: number; page: number; totalPages: number }> {
    try {
      this.logger.log(`Getting inspections for inspector: ${inspectorId}`);
  
      const { status, type, constructionSiteId, page = 1, limit = 10 } = filters;
      const skip = (page - 1) * limit;
  
      // Build filter
      const filter: any = {
        inspectorId,
        businessId,
        isDeleted: { $ne: true }
      };
  
      if (status) filter.status = status;
      if (type) filter.type = type;
      if (constructionSiteId) filter.constructionSiteId = constructionSiteId;

      // Get total count
      const total = await this.qualityInspectionModel.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);
  
      // Get inspections
      const inspections = await this.qualityInspectionModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('appProjectId', 'name')
        .populate('appClientId', 'name')
        .populate('constructionSiteId', 'name location status type')
        .populate('reviewerId', 'name surname email')
        .populate('approverId', 'name surname email');
  
      return {
        inspections,
        total,
        page,
        totalPages
      };
    } catch (error) {
      this.logger.error(`Error getting inspector inspections: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Update inspection
   */
  async updateInspection(
    inspectionId: string,
    inspectorId: string,
    updates: UpdateInspectionDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Updating inspection: ${inspectionId} by inspector: ${inspectorId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel.findById(inspectionId);
      if (!inspection) {
        throw new NotFoundException('Inspection not found');
      }
  
      // Verify inspector owns this inspection
      if (inspection.inspectorId !== inspectorId) {
        throw new BadRequestException('You can only update your own inspections');
      }
  
      // Verify inspection is still editable
      if (inspection.status !== 'draft' && inspection.status !== 'rejected') {
        throw new BadRequestException('Cannot update inspection in current status');
      }
  
      // Prepare update data
      const updateData: any = {};
      const metadataUpdates: any = { ...inspection.metadata };
  
      // Update basic fields
      if (updates.location) updateData.location = updates.location;
      if (updates.inspectionCategory) updateData.inspectionCategory = updates.inspectionCategory;
      if (updates.overallRating) updateData.overallRating = updates.overallRating;
  
      // Update metadata
      if (updates.checklistItems) {
        // Recalculate stats for detailed inspections
        const totalItems = updates.checklistItems.length;
        const passedItems = updates.checklistItems.filter(item => item.status === 'pass').length;
        const failedItems = updates.checklistItems.filter(item => item.status === 'fail').length;
        const hasCriticalIssues = updates.checklistItems.some(item => 
          item.status === 'fail' && item.critical === true
        );
  
        updateData.totalItems = totalItems;
        updateData.passedItems = passedItems;
        updateData.failedItems = failedItems;
        updateData.hasCriticalIssues = hasCriticalIssues;
        metadataUpdates.checklistItems = JSON.stringify(updates.checklistItems);
      }
  
      if (updates.photos) {
        updateData.hasPhotos = updates.photos.length > 0;
        metadataUpdates.photos = JSON.stringify(updates.photos);
      }
  
      if (updates.signature) {
        updateData.hasSignature = true;
        metadataUpdates.signature = updates.signature;
      }
  
      if (updates.notes) metadataUpdates.notes = updates.notes;
      if (updates.remarks) metadataUpdates.remarks = updates.remarks;
      if (updates.improvementSuggestions) metadataUpdates.improvementSuggestions = updates.improvementSuggestions;
  
      updateData.metadata = metadataUpdates;
  
      // Update inspection
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        updateData,
        { new: true }
      );
  
      this.logger.log(`Successfully updated inspection: ${inspectionId}`);
  
      return {
        success: true,
        message: 'Inspection updated successfully',
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error updating inspection: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Submit inspection for review - WITH NOTIFICATIONS
   */
  async submitInspectionForReview(
    inspectionId: string,
    inspectorId: string
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Submitting inspection for review: ${inspectionId} by inspector: ${inspectorId}`);

      // Find inspection
      const inspection = await this.qualityInspectionModel.findById(inspectionId);
      if (!inspection) {
        throw new NotFoundException('Inspection not found');
      }

      // Verify inspector owns this inspection
      if (inspection.inspectorId !== inspectorId) {
        throw new BadRequestException('You can only submit your own inspections');
      }

      // Verify inspection is in draft status
      if (inspection.status !== 'draft') {
        throw new BadRequestException('Only draft inspections can be submitted for review');
      }

      // Get business config to check requirements
      const business = await this.businessModel.findById(inspection.businessId);
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      const config = business.qualityInspectionConfig || this.getDefaultConfiguration();

      // Validate inspection completeness based on config
      if (config.requirePhotos && inspection.type === 'detailed' && !inspection.hasPhotos) {
        throw new BadRequestException('Photos are required for this inspection');
      }

      if (config.requireSignature && inspection.type === 'detailed' && !inspection.hasSignature) {
        throw new BadRequestException('Signature is required for this inspection');
      }

      // Update inspection status
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        { 
          status: 'pending',
          metadata: {
            ...inspection.metadata,
            submittedForReviewAt: new Date().toISOString()
          }
        },
        { new: true }
      );

      // Send notification to reviewers
      const recipients = await this.getNotificationRecipients(updatedInspection, 'inspection_submitted');
      if (recipients.length > 0) {
        await this.sendQualityInspectionNotification(
          updatedInspection,
          'inspection_submitted',
          recipients,
          {
            inspectorName: inspectorId, // You might want to get actual name
            submittedAt: new Date().toISOString(),
            requiresPhotos: config.requirePhotos,
            requiresSignature: config.requireSignature
          }
        );
      }

      this.logger.log(`Successfully submitted inspection for review: ${inspectionId}`);

      return {
        success: true,
        message: 'Inspection submitted for review successfully',
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error submitting inspection for review: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Validate inspector permissions
   */
  private async validateInspectorPermissions(
    businessId: string,
    inspectorId: string,
    inspectionType: 'detailed' | 'simple'
  ): Promise<void> {
    // Get business config
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }
  
    const config = business.qualityInspectionConfig || this.getDefaultConfiguration();
  
    // Find employee/inspector
    const employee = await this.employeeModel.findOne({
      user_id: inspectorId,
      businessId,
      isDeleted: { $ne: true }
    });
  
    if (!employee) {
      throw new NotFoundException('Inspector not found in business');
    }
  
    // Get inspector's quality role
    const qualityRole = employee.metadata?.get('qualityRole');
    const mainRole = employee.metadata?.get('role') || 'business_staff';
  
    // Check if inspector has permission to create inspections
    const canInspect = config.canInspect.includes(qualityRole) || config.canInspect.includes(mainRole);
  
    if (!canInspect) {
      throw new BadRequestException('You do not have permission to create inspections');
    }
  
    // Check specific inspection type requirements
    if (inspectionType === 'detailed' && !config.useDetailedInspections) {
      throw new BadRequestException('Detailed inspections are not enabled for this business');
    }
  }

  /**
 * Get inspections assigned for review
 */
async getInspectionsForReview(
    reviewerId: string,
    businessId: string,
    filters: {
      status?: string;
      type?: string;
      priority?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ inspections: any[]; total: number; page: number; totalPages: number }> {
    try {
      this.logger.log(`Getting inspections for review by: ${reviewerId}`);
  
      // Validate reviewer has permission
      await this.validateReviewerPermissions(businessId, reviewerId);
  
      const { status = 'pending', type, priority, page = 1, limit = 10 } = filters;
      const skip = (page - 1) * limit;
  
      // Build filter for inspections pending review
      const filter: any = {
        businessId,
        status: { $in: ['pending', 'under_review'] },
        isDeleted: { $ne: true }
      };
  
      // Add additional filters
      if (status && status !== 'pending') filter.status = status;
      if (type) filter.type = type;
      if (priority) filter['metadata.priority'] = priority;
  
      // Get business config to check self-review policy
      const business = await this.businessModel.findById(businessId);
      const config = business?.qualityInspectionConfig || this.getDefaultConfiguration();
  
      // If self-review is not allowed, exclude own inspections
      if (!config.allowSelfReview) {
        filter.inspectorId = { $ne: reviewerId };
      }
  
      // Get total count
      const total = await this.qualityInspectionModel.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);
  
      // Get inspections
      const inspections = await this.qualityInspectionModel
        .find(filter)
        .sort({ 
          'metadata.priority': -1, // High priority first
          createdAt: 1 // Oldest first
        })
        .skip(skip)
        .limit(limit)
        .populate('inspectorId', 'name surname email')
        .populate('appProjectId', 'name description')
        .populate('appClientId', 'name type')
        .populate('constructionSiteId', 'name location status type')
        .populate('reviewerId', 'name surname email');
  
      return {
        inspections,
        total,
        page,
        totalPages
      };
    } catch (error) {
      this.logger.error(`Error getting inspections for review: ${error.message}`, error.stack);
      throw error;
    }
  }
  
 /**
   * Approve inspection - WITH NOTIFICATIONS
   */
 async approveInspection(
  inspectionId: string,
  reviewerId: string,
  approvalData: ApproveInspectionDto
): Promise<{ success: boolean; message: string; inspection: any }> {
  try {
    this.logger.log(`Approving inspection: ${inspectionId} by reviewer: ${reviewerId}`);

    // Find inspection
    const inspection = await this.qualityInspectionModel.findById(inspectionId);
    if (!inspection) {
      throw new NotFoundException('Inspection not found');
    }

    // Validate reviewer has permission
    await this.validateReviewerPermissions(inspection.businessId, reviewerId);

    // Verify inspection can be reviewed
    if (!['pending', 'under_review'].includes(inspection.status)) {
      throw new BadRequestException('Inspection cannot be reviewed in current status');
    }

    // Check self-review policy
    const business = await this.businessModel.findById(inspection.businessId);
    const config = business?.qualityInspectionConfig || this.getDefaultConfiguration();

    if (!config.allowSelfReview && inspection.inspectorId === reviewerId) {
      throw new BadRequestException('Self-review is not allowed');
    }

    // Update inspection
    const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
      inspectionId,
      {
        status: 'approved',
        reviewerId,
        reviewedDate: new Date(),
        metadata: {
          ...inspection.metadata,
          reviewNotes: approvalData.notes || '',
          reviewComments: approvalData.reviewComments || '',
          reviewAction: 'approved',
          reviewedAt: new Date().toISOString(),
          reviewerId: reviewerId
        }
      },
      { new: true }
    );

    // Send notification to inspector and final approvers
    const recipients = await this.getNotificationRecipients(updatedInspection, 'inspection_approved');
    if (recipients.length > 0) {
      await this.sendQualityInspectionNotification(
        updatedInspection,
        'inspection_approved',
        recipients,
        {
          reviewerName: reviewerId, // You might want to get actual name
          reviewNotes: approvalData.notes,
          reviewComments: approvalData.reviewComments,
          approvedAt: new Date().toISOString()
        }
      );
    }

    this.logger.log(`Successfully approved inspection: ${inspectionId}`);

    return {
      success: true,
      message: 'Inspection approved successfully',
      inspection: updatedInspection
    };
  } catch (error) {
    this.logger.error(`Error approving inspection: ${error.message}`, error.stack);
    throw error;
  }
}

/**
 * Reject inspection - WITH NOTIFICATIONS
 */
async rejectInspection(
  inspectionId: string,
  reviewerId: string,
  rejectionData: RejectInspectionDto
): Promise<{ success: boolean; message: string; inspection: any }> {
  try {
    this.logger.log(`Rejecting inspection: ${inspectionId} by reviewer: ${reviewerId}`);

    // Find inspection
    const inspection = await this.qualityInspectionModel.findById(inspectionId);
    if (!inspection) {
      throw new NotFoundException('Inspection not found');
    }

    // Validate reviewer has permission
    await this.validateReviewerPermissions(inspection.businessId, reviewerId);

    // Verify inspection can be reviewed
    if (!['pending', 'under_review'].includes(inspection.status)) {
      throw new BadRequestException('Inspection cannot be reviewed in current status');
    }

    // Check self-review policy
    const business = await this.businessModel.findById(inspection.businessId);
    const config = business?.qualityInspectionConfig || this.getDefaultConfiguration();

    if (!config.allowSelfReview && inspection.inspectorId === reviewerId) {
      throw new BadRequestException('Self-review is not allowed');
    }

    // Validate rejection data
    if (!rejectionData.reason || !rejectionData.feedback) {
      throw new BadRequestException('Reason and feedback are required for rejection');
    }

    // Update inspection
    const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
      inspectionId,
      {
        status: 'rejected',
        reviewerId,
        reviewedDate: new Date(),
        metadata: {
          ...inspection.metadata,
          rejectionReason: rejectionData.reason,
          rejectionFeedback: rejectionData.feedback,
          requiredChanges: rejectionData.requiredChanges || [],
          reviewAction: 'rejected',
          reviewedAt: new Date().toISOString(),
          reviewerId: reviewerId
        }
      },
      { new: true }
    );

    // Send notification to inspector
    const recipients = await this.getNotificationRecipients(updatedInspection, 'inspection_rejected');
    if (recipients.length > 0) {
      await this.sendQualityInspectionNotification(
        updatedInspection,
        'inspection_rejected',
        recipients,
        {
          reviewerName: reviewerId, // You might want to get actual name
          rejectionReason: rejectionData.reason,
          rejectionFeedback: rejectionData.feedback,
          requiredChanges: rejectionData.requiredChanges,
          rejectedAt: new Date().toISOString()
        }
      );
    }

    this.logger.log(`Successfully rejected inspection: ${inspectionId}`);

    return {
      success: true,
      message: 'Inspection rejected successfully',
      inspection: updatedInspection
    };
  } catch (error) {
    this.logger.error(`Error rejecting inspection: ${error.message}`, error.stack);
    throw error;
  }
}
  
  /**
   * Request inspection revision
   */
  async requestInspectionRevision(
    inspectionId: string,
    reviewerId: string,
    revisionData: RequestRevisionDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Requesting revision for inspection: ${inspectionId} by reviewer: ${reviewerId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel.findById(inspectionId);
      if (!inspection) {
        throw new NotFoundException('Inspection not found');
      }
  
      // Validate reviewer has permission
      await this.validateReviewerPermissions(inspection.businessId, reviewerId);
  
      // Verify inspection can be reviewed
      if (!['pending', 'under_review'].includes(inspection.status)) {
        throw new BadRequestException('Inspection cannot be reviewed in current status');
      }
  
      // Check self-review policy
      const business = await this.businessModel.findById(inspection.businessId);
      const config = business?.qualityInspectionConfig || this.getDefaultConfiguration();
  
      if (!config.allowSelfReview && inspection.inspectorId === reviewerId) {
        throw new BadRequestException('Self-review is not allowed');
      }
  
      // Validate revision data
      if (!revisionData.feedback || !revisionData.requiredChanges?.length) {
        throw new BadRequestException('Feedback and required changes are required for revision request');
      }
  
      // Update inspection - set back to draft for inspector to fix
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        {
          status: 'draft',
          reviewerId,
          reviewedDate: new Date(),
          metadata: {
            ...inspection.metadata,
            revisionFeedback: revisionData.feedback,
            requiredChanges: revisionData.requiredChanges,
            revisionPriority: revisionData.priority || 'medium',
            reviewAction: 'revision_requested',
            reviewedAt: new Date().toISOString(),
            reviewerId: reviewerId,
            revisionCount: (inspection.metadata?.revisionCount || 0) + 1
          }
        },
        { new: true }
      );
  
      this.logger.log(`Successfully requested revision for inspection: ${inspectionId}`);
  
      return {
        success: true,
        message: 'Inspection revision requested successfully',
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error requesting inspection revision: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Assign inspection to reviewer (for workflow management)
   */
  async assignInspectionToReviewer(
    inspectionId: string,
    reviewerId: string,
    assignedBy: string
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Assigning inspection ${inspectionId} to reviewer: ${reviewerId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel.findById(inspectionId);
      if (!inspection) {
        throw new NotFoundException('Inspection not found');
      }
  
      // Validate assignedBy has permission (could be admin or operations manager)
      await this.validateReviewerPermissions(inspection.businessId, assignedBy);
  
      // Verify inspection is pending
      if (inspection.status !== 'pending') {
        throw new BadRequestException('Only pending inspections can be assigned');
      }
  
      // Update inspection
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        {
          status: 'under_review',
          reviewerId,
          metadata: {
            ...inspection.metadata,
            assignedToReviewerAt: new Date().toISOString(),
            assignedBy: assignedBy
          }
        },
        { new: true }
      );
  
      this.logger.log(`Successfully assigned inspection to reviewer: ${reviewerId}`);
  
      return {
        success: true,
        message: 'Inspection assigned to reviewer successfully',
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error assigning inspection to reviewer: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Validate reviewer permissions
   */
  private async validateReviewerPermissions(
    businessId: string,
    reviewerId: string
  ): Promise<void> {
    // Get business config
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }
  
    const config = business.qualityInspectionConfig || this.getDefaultConfiguration();
  
    // Find employee/reviewer
    const employee = await this.employeeModel.findOne({
      user_id: reviewerId,
      businessId,
      isDeleted: { $ne: true }
    });
  
    if (!employee) {
      throw new NotFoundException('Reviewer not found in business');
    }
  
    // Get reviewer's quality role and main role
    const qualityRole = employee.metadata?.get('qualityRole');
    const mainRole = employee.metadata?.get('role') || 'business_staff';
  
    // Check if reviewer has permission to review inspections
    const canReview = config.canReview.includes(qualityRole) || config.canReview.includes(mainRole);
  
    if (!canReview) {
      throw new BadRequestException('You do not have permission to review inspections');
    }
  }

  /**
 * Get inspections requiring final approval
 */
async getInspectionsForFinalApproval(
    approverId: string,
    businessId: string,
    filters: {
      status?: string;
      type?: string;
      priority?: string;
      hasCriticalIssues?: boolean;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ inspections: any[]; total: number; page: number; totalPages: number }> {
    try {
      this.logger.log(`Getting inspections for final approval by: ${approverId}`);
  
      // Validate approver has permission
      await this.validateFinalApproverPermissions(businessId, approverId);
  
      const { 
        status = 'approved', 
        type, 
        priority, 
        hasCriticalIssues, 
        page = 1, 
        limit = 10 
      } = filters;
      const skip = (page - 1) * limit;
  
      // Build filter for inspections requiring final approval
      const filter: any = {
        businessId,
        status: 'approved', // Only approved inspections need final approval
        isDeleted: { $ne: true },
        completedDate: { $exists: false } // Not yet finally completed
      };
  
      // Add additional filters
      if (type) filter.type = type;
      if (priority) filter['metadata.priority'] = priority;
      if (hasCriticalIssues !== undefined) filter.hasCriticalIssues = hasCriticalIssues;
  
      // Get total count
      const total = await this.qualityInspectionModel.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);
  
      // Get inspections - prioritize critical issues and oldest first
      const inspections = await this.qualityInspectionModel
        .find(filter)
        .sort({ 
          hasCriticalIssues: -1, // Critical issues first
          'metadata.priority': -1, // High priority first
          reviewedDate: 1 // Oldest reviewed first
        })
        .skip(skip)
        .limit(limit)
        .populate('inspectorId', 'name surname email')
        .populate('reviewerId', 'name surname email')
        .populate('appProjectId', 'name description status')
        .populate('appClientId', 'name type contact_person')
        .populate('constructionSiteId', 'name location status type')
        .populate('approverId', 'name surname email');
  
      return {
        inspections,
        total,
        page,
        totalPages
      };
    } catch (error) {
      this.logger.error(`Error getting inspections for final approval: ${error.message}`, error.stack);
      throw error;
    }
  }
  
    /**
   * Give final approval to inspection - WITH NOTIFICATIONS
   */
    async giveInspectionFinalApproval(
      inspectionId: string,
      approverId: string,
      approvalData: FinalApprovalDto
    ): Promise<{ success: boolean; message: string; inspection: any }> {
      try {
        this.logger.log(`Giving final approval to inspection: ${inspectionId} by approver: ${approverId}`);
  
        // Find inspection
        const inspection = await this.qualityInspectionModel.findById(inspectionId);
        if (!inspection) {
          throw new NotFoundException('Inspection not found');
        }
  
        // Validate approver has permission
        await this.validateFinalApproverPermissions(inspection.businessId, approverId);
  
        // Verify inspection can receive final approval
        if (inspection.status !== 'approved') {
          throw new BadRequestException('Only approved inspections can receive final approval');
        }
  
        if (inspection.completedDate) {
          throw new BadRequestException('Inspection has already received final approval');
        }
  
        // Update inspection with final approval
        const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
          inspectionId,
          {
            status: 'complete',
            approverId,
            approvedDate: new Date(),
            completedDate: new Date(),
            metadata: {
              ...inspection.metadata,
              finalApprovalNotes: approvalData.notes || '',
              clientNotificationRequired: approvalData.clientNotificationRequired || false,
              scheduledCompletionDate: approvalData.scheduledCompletionDate,
              finalApprovedAt: new Date().toISOString(),
              finalApproverId: approverId,
              finalApprovalAction: 'approved'
            }
          },
          { new: true }
        );
  
        // Send notification to inspector and relevant stakeholders
        const recipients = await this.getNotificationRecipients(updatedInspection, 'final_approval_granted');
        if (recipients.length > 0) {
          await this.sendQualityInspectionNotification(
            updatedInspection,
            'final_approval_granted',
            recipients,
            {
              approverName: approverId, // You might want to get actual name
              finalApprovalNotes: approvalData.notes,
              clientNotificationRequired: approvalData.clientNotificationRequired,
              scheduledCompletionDate: approvalData.scheduledCompletionDate,
              finalApprovedAt: new Date().toISOString()
            }
          );
        }
  
        this.logger.log(`Successfully gave final approval to inspection: ${inspectionId}`);
  
        // If client notification is required, mark it for notification
        if (approvalData.clientNotificationRequired) {
          this.logger.log(`Client notification required for inspection: ${inspectionId}`);
        }
  
        return {
          success: true,
          message: 'Final approval given successfully',
          inspection: updatedInspection
        };
      } catch (error) {
        this.logger.error(`Error giving final approval: ${error.message}`, error.stack);
        throw error;
      }
    }
  
  /**
   * Override previous review decision
   */
  async overrideInspectionDecision(
    inspectionId: string,
    approverId: string,
    overrideData: OverrideDecisionDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Overriding inspection decision: ${inspectionId} by approver: ${approverId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel.findById(inspectionId);
      if (!inspection) {
        throw new NotFoundException('Inspection not found');
      }
  
      // Validate approver has permission
      await this.validateFinalApproverPermissions(inspection.businessId, approverId);
  
      // Verify approver has override permission
      const hasOverridePermission = await this.validateOverridePermission(inspection.businessId, approverId);
      if (!hasOverridePermission) {
        throw new BadRequestException('You do not have permission to override decisions');
      }
  
      // Validate override data
      if (!overrideData.reason || !overrideData.justification) {
        throw new BadRequestException('Reason and justification are required for override');
      }
  
      // Determine new status based on override decision
      const newStatus = overrideData.decision === 'approve' ? 'complete' : 'rejected';
      const updateData: any = {
        status: newStatus,
        approverId,
        metadata: {
          ...inspection.metadata,
          overrideReason: overrideData.reason,
          overrideJustification: overrideData.justification,
          overridePreviousReview: overrideData.overridePreviousReview || false,
          overriddenAt: new Date().toISOString(),
          overriddenBy: approverId,
          originalStatus: inspection.status,
          originalReviewerId: inspection.reviewerId
        }
      };
  
      // Set appropriate date fields
      if (overrideData.decision === 'approve') {
        updateData.approvedDate = new Date();
        updateData.completedDate = new Date();
        updateData.metadata.finalApprovalAction = 'override_approved';
      } else {
        updateData.metadata.finalApprovalAction = 'override_rejected';
      }
  
      // Update inspection
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        updateData,
        { new: true }
      );
  
      this.logger.log(`Successfully overrode inspection decision: ${inspectionId} to ${overrideData.decision}`);
  
      return {
        success: true,
        message: `Inspection decision overridden to ${overrideData.decision}`,
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error overriding inspection decision: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Get inspection approval history and analytics
   */
  async getApprovalAnalytics(
    businessId: string,
    approverId: string,
    dateRange?: { startDate: Date; endDate: Date }
  ): Promise<any> {
    try {
      this.logger.log(`Getting approval analytics for business: ${businessId}`);
  
      // Validate approver has permission
      await this.validateFinalApproverPermissions(businessId, approverId);
  
      // Build date filter
      const dateFilter: any = {};
      if (dateRange) {
        dateFilter.completedDate = {
          $gte: dateRange.startDate,
          $lte: dateRange.endDate
        };
      }
  
      // Base filter
      const baseFilter = {
        businessId,
        isDeleted: { $ne: true },
        ...dateFilter
      };
  
      // Get overall statistics
      const [
        totalInspections,
        completedInspections,
        pendingApproval,
        criticalIssues,
        overriddenDecisions
      ] = await Promise.all([
        this.qualityInspectionModel.countDocuments(baseFilter),
        this.qualityInspectionModel.countDocuments({ ...baseFilter, status: 'complete' }),
        this.qualityInspectionModel.countDocuments({ 
          businessId, 
          status: 'approved', 
          completedDate: { $exists: false } 
        }),
        this.qualityInspectionModel.countDocuments({ ...baseFilter, hasCriticalIssues: true }),
        this.qualityInspectionModel.countDocuments({ 
          ...baseFilter, 
          'metadata.overriddenBy': { $exists: true } 
        })
      ]);
  
      // Get inspections by type
      const inspectionsByType = await this.qualityInspectionModel.aggregate([
        { $match: baseFilter },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]);
  
      // Get average approval time
      const avgApprovalTime = await this.qualityInspectionModel.aggregate([
        { 
          $match: { 
            ...baseFilter, 
            status: 'complete',
            reviewedDate: { $exists: true },
            completedDate: { $exists: true }
          } 
        },
        {
          $addFields: {
            approvalTimeHours: {
              $divide: [
                { $subtract: ['$completedDate', '$reviewedDate'] },
                1000 * 60 * 60
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            avgHours: { $avg: '$approvalTimeHours' }
          }
        }
      ]);
  
      return {
        summary: {
          totalInspections,
          completedInspections,
          pendingApproval,
          criticalIssues,
          overriddenDecisions,
          completionRate: totalInspections > 0 ? Math.round((completedInspections / totalInspections) * 100) : 0
        },
        inspectionsByType: inspectionsByType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        averageApprovalTimeHours: avgApprovalTime[0]?.avgHours || 0,
        dateRange: dateRange || { startDate: null, endDate: null }
      };
    } catch (error) {
      this.logger.error(`Error getting approval analytics: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Validate final approver permissions
   */
  private async validateFinalApproverPermissions(
    businessId: string,
    approverId: string
  ): Promise<void> {
    // Get business config
    const business = await this.businessModel.findById(businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }
  
    const config = business.qualityInspectionConfig || this.getDefaultConfiguration();
  
    // Find employee/approver
    const employee = await this.employeeModel.findOne({
      user_id: approverId,
      businessId,
      isDeleted: { $ne: true }
    });
  
    if (!employee) {
      throw new NotFoundException('Approver not found in business');
    }
  
    // Get approver's quality role and main role
    const qualityRole = employee.metadata?.get('qualityRole');
    const mainRole = employee.metadata?.get('role') || 'business_staff';
  
    // Check if approver is the designated final approver
    const isFinalApprover = config.finalApprover === qualityRole || config.finalApprover === mainRole;
  
    if (!isFinalApprover) {
      throw new BadRequestException('You do not have permission to give final approval');
    }
  }
  
  /**
   * Validate override permission
   */
  private async validateOverridePermission(
    businessId: string,
    approverId: string
  ): Promise<boolean> {
    // Find employee/approver
    const employee = await this.employeeModel.findOne({
      user_id: approverId,
      businessId,
      isDeleted: { $ne: true }
    });
  
    if (!employee) {
      return false;
    }
  
    // Get approver's quality role
    const qualityRole = employee.metadata?.get('qualityRole');
    const mainRole = employee.metadata?.get('role') || 'business_staff';
  
    // Only operations managers and above can override decisions
    const canOverride = [
      'operations_manager', 
      'general_manager', 
      'business_admin'
    ].includes(qualityRole) || [
      'operations_manager', 
      'general_manager', 
      'business_admin'
    ].includes(mainRole);
  
    return canOverride;
  }


  /**
 * Get inspections for a specific client
 */
async getClientInspections(
    clientId: string,
    appProjectId?: string,
    filters: {
      status?: string;
      type?: string;
      dateRange?: { startDate: Date; endDate: Date };
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ inspections: any[]; total: number; page: number; totalPages: number }> {
    try {
      this.logger.log(`Getting inspections for client: ${clientId}`);
  
      const { status, type, dateRange, page = 1, limit = 10 } = filters;
      const skip = (page - 1) * limit;
  
      // Build filter for client inspections
      const filter: any = {
        appClientId: clientId,
        isDeleted: { $ne: true },
        status: { $in: ['complete', 'approved'] } // Only show completed or approved inspections to client
      };
  
      // Add project filter if specified
      if (appProjectId) filter.appProjectId = appProjectId;
  
      // Add additional filters
      if (status) filter.status = status;
      if (type) filter.type = type;
      
      // Add date range filter
      if (dateRange) {
        filter.completedDate = {
          $gte: dateRange.startDate,
          $lte: dateRange.endDate
        };
      }
  
      // Get total count
      const total = await this.qualityInspectionModel.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);
  
      // Get inspections - most recent first
      const inspections = await this.qualityInspectionModel
        .find(filter)
        .sort({ completedDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('inspectorId', 'name surname email')
        .populate('reviewerId', 'name surname email')
        .populate('approverId', 'name surname email')
        .populate('appProjectId', 'name description status')
        .populate('constructionSiteId', 'name location status type')
        .select('-metadata.checklistItems -metadata.photos') // Hide detailed technical data from client
        .lean();
  
      // Format inspections for client view (simplified data)
      const clientFormattedInspections = inspections.map(inspection => ({
        _id: inspection._id,
        type: inspection.type,
        status: inspection.status,
        location: inspection.location,
        inspectionCategory: inspection.inspectionCategory,
        overallRating: inspection.overallRating,
        passRate: inspection.totalItems > 0 ? Math.round((inspection.passedItems / inspection.totalItems) * 100) : null,
        hasCriticalIssues: inspection.hasCriticalIssues,
        inspectionDate: inspection.inspectionDate,
        completedDate: inspection.completedDate,
        project: inspection.appProjectId,
        inspector: inspection.inspectorId,
        reviewer: inspection.reviewerId,
        approver: inspection.approverId,
        clientFeedback: inspection.metadata?.clientFeedback,
        clientRating: inspection.metadata?.clientRating,
        summary: inspection.metadata?.remarks || inspection.metadata?.notes || 'No summary available'
      }));
  
      return {
        inspections: clientFormattedInspections,
        total,
        page,
        totalPages
      };
    } catch (error) {
      this.logger.error(`Error getting client inspections: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Get detailed inspection for client review
   */
  async getInspectionDetailsForClient(
    inspectionId: string,
    clientId: string
  ): Promise<any> {
    try {
      this.logger.log(`Getting inspection details for client: ${clientId}, inspection: ${inspectionId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel
        .findOne({
          _id: inspectionId,
          appClientId: clientId,
          isDeleted: { $ne: true }
        })
        .populate('inspectorId', 'name surname email')
        .populate('reviewerId', 'name surname email')
        .populate('approverId', 'name surname email')
        .populate('appProjectId', 'name description status')
        .lean();
  
      if (!inspection) {
        throw new NotFoundException('Inspection not found or access denied');
      }
  
      // Format for client view - show summary but hide technical details
      const clientView = {
        _id: inspection._id,
        type: inspection.type,
        status: inspection.status,
        location: inspection.location,
        inspectionCategory: inspection.inspectionCategory,
        overallRating: inspection.overallRating,
        passedItems: inspection.passedItems,
        failedItems: inspection.failedItems,
        totalItems: inspection.totalItems,
        passRate: inspection.totalItems > 0 ? Math.round((inspection.passedItems / inspection.totalItems) * 100) : null,
        hasCriticalIssues: inspection.hasCriticalIssues,
        inspectionDate: inspection.inspectionDate,
        completedDate: inspection.completedDate,
        project: inspection.appProjectId,
        inspector: inspection.inspectorId,
        reviewer: inspection.reviewerId,
        approver: inspection.approverId,
        
        // Summary information
        summary: inspection.metadata?.remarks || inspection.metadata?.notes || 'No summary available',
        improvementSuggestions: inspection.metadata?.improvementSuggestions,
        
        // Client-specific data
        clientFeedback: inspection.metadata?.clientFeedback,
        clientRating: inspection.metadata?.clientRating,
        clientApproved: inspection.metadata?.clientApproved,
        clientApprovedAt: inspection.metadata?.clientApprovedAt,
        
        // Photos (if any) - filtered for client viewing
        hasPhotos: inspection.hasPhotos,
        photoCount: inspection.metadata?.photos ? JSON.parse(inspection.metadata.photos).length : 0,
        
        // Status history (simplified)
        timeline: {
          created: inspection.createdAt,
          completed: inspection.completedDate,
          clientReviewed: inspection.metadata?.clientReviewedAt
        }
      };
  
      return clientView;
    } catch (error) {
      this.logger.error(`Error getting inspection details for client: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Client review of inspection
   */
  async reviewInspectionByClient(
    inspectionId: string,
    clientId: string,
    reviewData: ClientReviewDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Client reviewing inspection: ${inspectionId} by client: ${clientId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel.findOne({
        _id: inspectionId,
        appClientId: clientId,
        isDeleted: { $ne: true }
      });
  
      if (!inspection) {
        throw new NotFoundException('Inspection not found or access denied');
      }
  
      // Verify inspection is complete and can be reviewed by client
      if (inspection.status !== 'complete') {
        throw new BadRequestException('Only completed inspections can be reviewed by client');
      }
  
      // Validate review data
      if (!reviewData.feedback) {
        throw new BadRequestException('Feedback is required for client review');
      }
  
      // Update inspection with client review
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        {
          metadata: {
            ...inspection.metadata,
            clientFeedback: reviewData.feedback,
            clientRating: reviewData.rating,
            clientConcerns: reviewData.concerns || [],
            clientRequestedChanges: reviewData.requestedChanges || [],
            clientReviewedAt: new Date().toISOString(),
            clientReviewStatus: 'reviewed'
          }
        },
        { new: true }
      );
  
      this.logger.log(`Successfully recorded client review for inspection: ${inspectionId}`);
  
      return {
        success: true,
        message: 'Client review recorded successfully',
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error recording client review: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Client approval of inspection
   */
  async approveInspectionByClient(
    inspectionId: string,
    clientId: string,
    approvalData: ClientApprovalDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Client ${approvalData.approved ? 'approving' : 'handling'} inspection: ${inspectionId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel.findOne({
        _id: inspectionId,
        appClientId: clientId,
        isDeleted: { $ne: true }
      });
  
      if (!inspection) {
        throw new NotFoundException('Inspection not found or access denied');
      }
  
      // Verify inspection is complete
      if (inspection.status !== 'complete') {
        throw new BadRequestException('Only completed inspections can be approved by client');
      }
  
      // Update inspection with client approval
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        {
          metadata: {
            ...inspection.metadata,
            clientApproved: approvalData.approved,
            clientSignature: approvalData.clientSignature,
            clientApprovalNotes: approvalData.notes,
            clientSatisfactionRating: approvalData.satisfactionRating,
            clientApprovedAt: new Date().toISOString(),
            clientReviewStatus: approvalData.approved ? 'approved' : 'pending_changes'
          }
        },
        { new: true }
      );
  
      const message = approvalData.approved 
        ? 'Inspection approved by client successfully'
        : 'Client approval status updated successfully';
  
      this.logger.log(`Client approval recorded for inspection: ${inspectionId} - ${approvalData.approved ? 'APPROVED' : 'NOT APPROVED'}`);
  
      return {
        success: true,
        message,
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error recording client approval: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Client rejection with requested changes
   */
  async rejectInspectionByClient(
    inspectionId: string,
    clientId: string,
    rejectionData: ClientRejectionDto
  ): Promise<{ success: boolean; message: string; inspection: any }> {
    try {
      this.logger.log(`Client rejecting inspection: ${inspectionId} by client: ${clientId}`);
  
      // Find inspection
      const inspection = await this.qualityInspectionModel.findOne({
        _id: inspectionId,
        appClientId: clientId,
        isDeleted: { $ne: true }
      });
  
      if (!inspection) {
        throw new NotFoundException('Inspection not found or access denied');
      }
  
      // Verify inspection is complete
      if (inspection.status !== 'complete') {
        throw new BadRequestException('Only completed inspections can be rejected by client');
      }
  
      // Validate rejection data
      if (!rejectionData.reason || !rejectionData.requestedChanges?.length) {
        throw new BadRequestException('Reason and requested changes are required for client rejection');
      }
  
      // Update inspection - this should trigger a new inspection or rework
      const updatedInspection = await this.qualityInspectionModel.findByIdAndUpdate(
        inspectionId,
        {
          metadata: {
            ...inspection.metadata,
            clientApproved: false,
            clientRejectionReason: rejectionData.reason,
            clientRequestedChanges: rejectionData.requestedChanges,
            clientRejectionPriority: rejectionData.priority || 'medium',
            scheduledRevisitDate: rejectionData.scheduledRevisitDate,
            clientRejectedAt: new Date().toISOString(),
            clientReviewStatus: 'rejected',
            requiresRework: true
          }
        },
        { new: true }
      );
  
      this.logger.log(`Client rejection recorded for inspection: ${inspectionId}`);
  
      return {
        success: true,
        message: 'Inspection rejected by client - rework required',
        inspection: updatedInspection
      };
    } catch (error) {
      this.logger.error(`Error recording client rejection: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Get client inspection summary and statistics
   */
  async getClientInspectionSummary(
    clientId: string,
    appProjectId?: string
  ): Promise<any> {
    try {
      this.logger.log(`Getting inspection summary for client: ${clientId}`);
  
      // Base filter
      const baseFilter: any = {
        appClientId: clientId,
        isDeleted: { $ne: true }
      };
  
      if (appProjectId) baseFilter.appProjectId = appProjectId;
  
      // Get summary statistics
      const [
        totalInspections,
        completedInspections,
        clientApprovedCount,
        criticalIssuesCount,
        avgClientRating
      ] = await Promise.all([
        this.qualityInspectionModel.countDocuments(baseFilter),
        this.qualityInspectionModel.countDocuments({ ...baseFilter, status: 'complete' }),
        this.qualityInspectionModel.countDocuments({ 
          ...baseFilter, 
          'metadata.clientApproved': true 
        }),
        this.qualityInspectionModel.countDocuments({ 
          ...baseFilter, 
          hasCriticalIssues: true 
        }),
        this.qualityInspectionModel.aggregate([
          { $match: { ...baseFilter, 'metadata.clientRating': { $exists: true } } },
          { $group: { _id: null, avgRating: { $avg: '$metadata.clientRating' } } }
        ])
      ]);
  
      // Get inspections by status
      const inspectionsByStatus = await this.qualityInspectionModel.aggregate([
        { $match: baseFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);
  
      // Get recent activity
      const recentInspections = await this.qualityInspectionModel
        .find(baseFilter)
        .sort({ completedDate: -1 })
        .limit(5)
        .populate('appProjectId', 'name')
        .select('type status location completedDate overallRating appProjectId')
        .lean();
  
      return {
        summary: {
          totalInspections,
          completedInspections,
          clientApprovedCount,
          criticalIssuesCount,
          approvalRate: completedInspections > 0 ? Math.round((clientApprovedCount / completedInspections) * 100) : 0,
          averageClientRating: avgClientRating[0]?.avgRating || 0
        },
        inspectionsByStatus: inspectionsByStatus.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        recentActivity: recentInspections,
        projectFilter: appProjectId || 'all'
      };
    } catch (error) {
      this.logger.error(`Error getting client inspection summary: ${error.message}`, error.stack);
      throw error;
    }
  }
}