// src/services/ticket.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ticket, TicketStatus, TicketPriority, TicketCategory, TicketMessage } from '../schemas/ticket.schema';
import { Business } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import { SaasNotificationService } from './saas-notification.service';
import { EmailService } from './email.service';
import { AuditLogService } from './audit-log.service';
import { AuditAction, AuditSeverity, ResourceType } from '../schemas/audit-log.schema';
import { DeliveryChannel, NotificationPriority, NotificationType } from 'src/schemas/saas-notification.schema';
import { StaffluentOneSignalService } from './staffluent-onesignal.service';

// NOTE: Add these to AuditAction enum in audit-log.schema.ts:
// TICKET_CREATED = 'ticket_created',
// TICKET_UPDATED = 'ticket_updated', 
// TICKET_ACCESSED = 'ticket_accessed',
// TICKET_DELETED = 'ticket_deleted',

export interface CreateTicketDto {
  title: string;
  description: string;
  priority?: TicketPriority;
  category?: TicketCategory;
  createdByName: string;
  createdByEmail: string;
  createdByUserId?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface AddMessageDto {
  message: string;
  senderName: string;
  senderEmail: string;
  attachments?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateTicketDto {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  assignedTo?: string;
  assignedToEmail?: string;
  tags?: string[];
  duplicateOf?: string;
  resolutionNotes?: string;
}

export interface TicketListResponse {
  tickets: Ticket[];
  total: number;
  page: number;
  limit: number;
  success: boolean;
}

export interface TicketFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  assignedTo?: string;
  createdByEmail?: string;
  tags?: string[];
  fromDate?: Date;
  toDate?: Date;
  clientId?: string;
  search?: string;
  businessId?: string;
}

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);

  constructor(
    @InjectModel(Ticket.name) private ticketModel: Model<Ticket>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly notificationService: SaasNotificationService,
    private readonly auditLogService: AuditLogService,
    private readonly oneSignalService: StaffluentOneSignalService,
    private readonly emailService?: EmailService,
  ) {}

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
 * Send notification to business when support updates ticket
 */
private async sendTicketUpdateNotification(
  ticket: Ticket,
  updateType: 'status_changed' | 'message_added' | 'assignment_changed',
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
    ticketId: ticket._id.toString(),
    businessId: ticket.businessId,
    updateType,
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
    const business = await this.businessModel.findById(ticket.businessId);
    if (!business) {
      debugInfo.steps.push({ step: 'business_lookup', result: 'FAILED - Business not found' });
      return { success: false, debugInfo, oneSignalError: 'Business not found' };
    }
    debugInfo.steps.push({ step: 'business_lookup', result: 'SUCCESS', businessName: business.name });

    // Step 3: Get admin user
    const adminUser = await this.userModel.findById(business.adminUserId);
    if (!adminUser) {
      debugInfo.steps.push({ step: 'admin_user_lookup', result: 'FAILED - Admin user not found' });
      return { success: false, debugInfo, oneSignalError: 'Admin user not found' };
    }

    const adminUserInfo = {
      id: adminUser._id.toString(),
      email: adminUser.email,
      hasMetadata: !!adminUser.metadata,
      metadataKeys: adminUser.metadata ? Array.from(adminUser.metadata.keys()) : [],
      emailNotificationsEnabled: adminUser.metadata?.get('emailNotificationsEnabled') !== 'false'
    };
    debugInfo.steps.push({ step: 'admin_user_lookup', result: 'SUCCESS', adminUser: adminUserInfo });

    // Step 4: Prepare notification content
    let title: string;
    let body: string;
    let priority: NotificationPriority = NotificationPriority.MEDIUM;

    switch (updateType) {
      case 'status_changed':
        title = `Ticket Status Updated`;
        body = `Your support ticket "${ticket.title}" status has been changed to ${ticket.status}.`;
        priority = ticket.status === 'resolved' ? NotificationPriority.HIGH : NotificationPriority.MEDIUM;
        break;
      
      case 'message_added':
        title = `New Support Message`;
        body = `Staffluent support has replied to your ticket "${ticket.title}".`;
        priority = NotificationPriority.HIGH;
        break;
      
      case 'assignment_changed':
        title = `Ticket Assignment Updated`;
        body = `Your support ticket "${ticket.title}" has been assigned to ${ticket.assignedTo}.`;
        priority = NotificationPriority.LOW;
        break;
      
      default:
        title = `Ticket Updated`;
        body = `Your support ticket "${ticket.title}" has been updated.`;
    }

    const actionData = {
      type: 'support_ticket',
      entityId: ticket._id.toString(),
      entityType: 'ticket',
      url: `https://app.staffluent.co/help-center`
    };

    const notificationContent = { title, body, priority, actionData };
    debugInfo.steps.push({ step: 'notification_content_prepared', result: notificationContent });

    // Step 5: Create database notification
    let dbNotificationResult;
    try {
      const emailEnabled = adminUser.metadata?.get('emailNotificationsEnabled') !== 'false';
      const userChannels: DeliveryChannel[] = [DeliveryChannel.APP];
      
      if (emailEnabled) {
        userChannels.push(DeliveryChannel.EMAIL);
      }

      const notification = await this.notificationService.createNotification({
        businessId: ticket.businessId,
        userId: adminUser._id.toString(),
        title,
        body,
        type: NotificationType.TICKET,
        priority,
        channels: [DeliveryChannel.APP],
        reference: {
          type: 'support_ticket',
          id: ticket._id.toString()
        },
        actionData
      });

      dbNotificationResult = {
        success: true,
        notificationId: notification._id.toString(),
        channels: userChannels
      };
      debugInfo.steps.push({ step: 'database_notification_created', result: dbNotificationResult });
    } catch (dbError: any) {
      dbNotificationResult = { success: false, error: dbError.message };
      debugInfo.steps.push({ step: 'database_notification_failed', result: dbNotificationResult });
      return { success: false, debugInfo, oneSignalError: `DB notification failed: ${dbError.message}` };
    }

    // Step 6: Send OneSignal notification
    let oneSignalError: string | undefined;
    let oneSignalDetails: any;

    try {
      if (this.oneSignalService.isConfigured()) {
        const oneSignalPayload = {
          userIds: [adminUser._id.toString()],
          data: {
            type: 'support_ticket',
            ticketId: ticket._id.toString(),
            updateType,
            ...actionData
          },
          url: actionData.url,
          priority: this.mapNotificationPriorityToOneSignal(priority),
          buttons: [
            { id: 'view_ticket', text: 'View Ticket' },
            { id: 'reply', text: 'Reply' }
          ]
        };

        debugInfo.steps.push({ 
          step: 'onesignal_payload_prepared', 
          result: { 
            businessId: ticket.businessId,
            title, 
            body, 
            payload: oneSignalPayload 
          } 
        });

        const oneSignalResult = await this.oneSignalService.sendToBusinessUsers(
          ticket.businessId,
          title,
          body,
          oneSignalPayload
        );

        oneSignalDetails = oneSignalResult;
        debugInfo.steps.push({ 
          step: 'onesignal_notification_sent', 
          result: { success: true, oneSignalResult } 
        });
        
        this.logger.log(`OneSignal notification sent for ticket ${ticket._id}: ${oneSignalResult?.id}`);
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
        statusText: oneSignalErr.response?.statusText,
        requestConfig: {
          url: oneSignalErr.config?.url,
          method: oneSignalErr.config?.method,
          data: oneSignalErr.config?.data ? JSON.parse(oneSignalErr.config.data) : null
        }
      };

      debugInfo.steps.push({ 
        step: 'onesignal_notification_failed', 
        result: oneSignalDetails 
      });

      this.logger.error(`OneSignal notification failed for ticket ${ticket._id}: ${oneSignalErr.message}`);
    }

    // Step 7: Send email notification
    let emailResult;
    const emailEnabled = adminUser.metadata?.get('emailNotificationsEnabled') !== 'false';
    if (emailEnabled && adminUser.email) {
      try {
        await this.sendTicketUpdateEmail(adminUser, business, ticket, updateType, additionalData);
        emailResult = { success: true, emailSent: true };
        debugInfo.steps.push({ step: 'email_notification_sent', result: emailResult });
      } catch (emailError: any) {
        emailResult = { success: false, error: emailError.message };
        debugInfo.steps.push({ step: 'email_notification_failed', result: emailResult });
      }
    } else {
      emailResult = { 
        success: false, 
        reason: !emailEnabled ? 'Email notifications disabled' : 'No email address' 
      };
      debugInfo.steps.push({ step: 'email_notification_skipped', result: emailResult });
    }

    // Final summary
    debugInfo.summary = {
      databaseNotification: dbNotificationResult?.success ? 'SUCCESS' : 'FAILED',
      oneSignalNotification: oneSignalError ? 'FAILED' : (oneSignalDetails ? 'SUCCESS' : 'SKIPPED'),
      emailNotification: emailResult?.success ? 'SUCCESS' : 'FAILED/SKIPPED',
      overallSuccess: true
    };

    this.logger.log(`Sent ticket ${updateType} notification for ticket ${ticket._id} to admin user`);

    return { 
      success: true, 
      debugInfo,
      oneSignalError, 
      oneSignalDetails,
      emailResult
    };

  } catch (error: any) {
    debugInfo.steps.push({ 
      step: 'major_error', 
      result: { 
        error: error.message, 
        stack: error.stack?.split('\n').slice(0, 5).join('\n') 
      } 
    });

    this.logger.error(`Error sending ticket update notification: ${error.message}`, error.stack);
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
   * Send email notification for ticket updates
   */
  private async sendTicketUpdateEmail(
    user: any,
    business: any,
    ticket: Ticket,
    updateType: string,
    additionalData?: any
  ): Promise<void> {
    try {
      if (!this.emailService) {
        this.logger.warn('Email service not available for ticket notifications');
        return;
      }

      const userName = user.name 
        ? (user.surname ? `${user.name} ${user.surname}` : user.name)
        : 'Team Member';

      // Determine email subject and content based on update type
      let subject: string;
      let templateData: any;

      switch (updateType) {
        case 'status_changed':
          subject = `Ticket Status Updated - ${ticket.title}`;
          templateData = {
            updateType: 'Status Change',
            updateDetails: `Status changed to: ${ticket.status}`,
            actionText: 'View Ticket Details',
            statusColor: this.getStatusColor(ticket.status)
          };
          break;

        case 'message_added':
          subject = `New Support Reply - ${ticket.title}`;
          const lastMessage = ticket.messages[ticket.messages.length - 1];
          templateData = {
            updateType: 'New Message',
            updateDetails: lastMessage?.message || 'A new message has been added to your ticket.',
            actionText: 'View Message & Reply',
            senderName: lastMessage?.senderName || 'Support Team'
          };
          break;

        case 'assignment_changed':
          subject = `Ticket Assignment Updated - ${ticket.title}`;
          templateData = {
            updateType: 'Assignment Change',
            updateDetails: `Assigned to: ${ticket.assignedTo}`,
            actionText: 'View Ticket',
            assignedEmail: ticket.assignedToEmail
          };
          break;

        default:
          subject = `Ticket Updated - ${ticket.title}`;
          templateData = {
            updateType: 'Ticket Update',
            updateDetails: 'Your support ticket has been updated.',
            actionText: 'View Ticket'
          };
      }

      // Common template data
      templateData = {
        ...templateData,
        userName,
        businessName: business.name,
        ticketTitle: ticket.title,
        ticketId: ticket._id.toString(),
        ticketStatus: ticket.status,
        ticketPriority: ticket.priority,
        actionUrl: `https://app.staffluent.co/help-center`,
        currentYear: new Date().getFullYear()
      };

      await this.emailService.sendTemplateEmail(
        business.name,
        'staffluent@omnistackhub.xyz',
        user.email,
        subject,
        'templates/business/ticket-update-email.html',
        templateData
      );

    } catch (error) {
      this.logger.error(`Failed to send ticket update email: ${error.message}`, error.stack);
    }
  }

  /**
   * Get status color for email templates
   */
  private getStatusColor(status: string): string {
    switch (status.toLowerCase()) {
      case 'open':
        return '#2196f3'; // Blue
      case 'in_progress':
        return '#ff9800'; // Orange
      case 'resolved':
        return '#4caf50'; // Green
      case 'closed':
        return '#757575'; // Gray
      default:
        return '#2196f3';
    }
  }

  /**
   * Create a new support ticket
   */
  async createTicket(
    businessId: string,
    clientId: string,
    createTicketDto: CreateTicketDto,
    userId?: string,
    req?: any
  ): Promise<Ticket> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      const business = await this.businessModel.findById(businessId);
      if (!business) {
        // Log business not found
        await this.auditLogService.createAuditLog({
          businessId,
          userId,
          action: AuditAction.TICKET_CREATED,
          resourceType: ResourceType.TICKET,
          resourceName: createTicketDto.title,
          success: false,
          errorMessage: 'Business not found',
          severity: AuditSeverity.HIGH,
          ipAddress,
          userAgent,
          metadata: {
            title: createTicketDto.title,
            priority: createTicketDto.priority,
            category: createTicketDto.category,
            errorReason: 'business_not_found',
            operationDuration: Date.now() - startTime
          }
        });
        throw new NotFoundException('Business not found');
      }

      const ticket = new this.ticketModel({
        businessId,
        clientId,
        ...createTicketDto,
        createdByName: business.name,
        createdByEmail: business.email,
        assignedTo: 'Staffluent Support Team',
        assignedToEmail: 'support@staffluent.co',
        status: TicketStatus.OPEN
      });

      const savedTicket = await ticket.save();

      // Log successful ticket creation
      await this.auditLogService.createAuditLog({
        businessId,
        userId,
        action: AuditAction.TICKET_CREATED,
        resourceType: ResourceType.TICKET,
        resourceId: savedTicket._id.toString(),
        resourceName: savedTicket.title,
        success: true,
        severity: AuditSeverity.MEDIUM,
        ipAddress,
        userAgent,
        metadata: {
          ticketId: savedTicket._id.toString(),
          title: savedTicket.title,
          description: savedTicket.description.substring(0, 200), // Truncate for audit
          priority: savedTicket.priority,
          category: savedTicket.category,
          status: savedTicket.status,
          assignedTo: savedTicket.assignedTo,
          tags: savedTicket.tags,
          operationDuration: Date.now() - startTime
        }
      });

      this.logger.log(`New ticket created: ${savedTicket._id} for business: ${businessId}`);
      
      return savedTicket;
    } catch (error) {
      // Log unexpected errors
      if (error.name !== 'NotFoundException') {
        await this.auditLogService.createAuditLog({
          businessId,
          userId,
          action: AuditAction.TICKET_CREATED,
          resourceType: ResourceType.TICKET,
          resourceName: createTicketDto.title,
          success: false,
          errorMessage: 'Unexpected error during ticket creation',
          severity: AuditSeverity.HIGH,
          ipAddress,
          userAgent,
          metadata: {
            title: createTicketDto.title,
            priority: createTicketDto.priority,
            category: createTicketDto.category,
            errorReason: 'unexpected_error',
            errorName: error.name,
            errorMessage: error.message,
            operationDuration: Date.now() - startTime
          }
        });
      }

      this.logger.error(`Error creating ticket: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get tickets for a business with filtering and pagination
   */
  async getBusinessTickets(
    businessId: string,
    clientId: string,
    filters: TicketFilters = {},
    page: number = 1,
    limit: number = 20,
    userId?: string,
    req?: any
  ): Promise<TicketListResponse> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');

    try {
      const query: any = { businessId, clientId, isDeleted: false };

      // Apply filters
      if (filters.status) {
        query.status = filters.status;
      }
      
      if (filters.priority) {
        query.priority = filters.priority;
      }
      
      if (filters.category) {
        query.category = filters.category;
      }
      
      if (filters.assignedTo) {
        query.assignedTo = filters.assignedTo;
      }
      
      if (filters.createdByEmail) {
        query.createdByEmail = filters.createdByEmail;
      }
      
      if (filters.tags && filters.tags.length > 0) {
        query.tags = { $in: filters.tags };
      }
      
      if (filters.fromDate || filters.toDate) {
        query.createdAt = {};
        if (filters.fromDate) {
          query.createdAt.$gte = filters.fromDate;
        }
        if (filters.toDate) {
          query.createdAt.$lte = filters.toDate;
        }
      }

      const total = await this.ticketModel.countDocuments(query);
      const skip = (page - 1) * limit;

      const tickets = await this.ticketModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      // Log business ticket access
      await this.auditLogService.createAuditLog({
        businessId,
        userId,
        action: AuditAction.TICKET_ACCESSED,
        resourceType: ResourceType.TICKET,
        resourceName: `Business tickets list`,
        success: true,
        severity: AuditSeverity.LOW,
        ipAddress,
        userAgent,
        metadata: {
          ticketsRetrieved: tickets.length,
          totalTickets: total,
          page,
          limit,
          filters: {
            status: filters.status,
            priority: filters.priority,
            category: filters.category,
            hasDateRange: !!(filters.fromDate || filters.toDate),
            tagCount: filters.tags?.length || 0
          }
        }
      });

      return {
        tickets,
        total,
        page,
        limit,
        success: true
      };
    } catch (error) {
      this.logger.error(`Error getting business tickets: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all tickets (for support team) - NO AUDIT LOGGING (support team action)
   */
  async getAllTickets(
    filters: TicketFilters = {},
    page: number = 1,
    limit: number = 20
  ): Promise<TicketListResponse> {
    try {
      const query: any = { isDeleted: false };

      // Apply client filter for support team
      if (filters.clientId) {
        query.clientId = filters.clientId;
      }

      // Apply other filters
      if (filters.status) {
        query.status = filters.status;
      }
      
      if (filters.priority) {
        query.priority = filters.priority;
      }
      
      if (filters.category) {
        query.category = filters.category;
      }
      
      if (filters.assignedTo) {
        query.assignedTo = filters.assignedTo;
      }
      
      if (filters.createdByEmail) {
        query.createdByEmail = filters.createdByEmail;
      }

      if (filters.businessId) {
        query.businessId = filters.businessId;
      }
      
      if (filters.tags && filters.tags.length > 0) {
        query.tags = { $in: filters.tags };
      }
      
      if (filters.fromDate || filters.toDate) {
        query.createdAt = {};
        if (filters.fromDate) {
          query.createdAt.$gte = filters.fromDate;
        }
        if (filters.toDate) {
          query.createdAt.$lte = filters.toDate;
        }
      }

      // Search functionality
      if (filters.search) {
        query.$or = [
          { title: { $regex: filters.search, $options: 'i' } },
          { description: { $regex: filters.search, $options: 'i' } },
          { createdByName: { $regex: filters.search, $options: 'i' } },
          { createdByEmail: { $regex: filters.search, $options: 'i' } }
        ];
      }

      const total = await this.ticketModel.countDocuments(query);
      const skip = (page - 1) * limit;

      // Get tickets without populate since businessId is not a ref
      const tickets = await this.ticketModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      // Get unique business IDs
      const businessIds = [...new Set(tickets.map(ticket => ticket.businessId.toString()))];
      
      // Fetch all businesses in one query
      const businesses = await this.businessModel
        .find({ _id: { $in: businessIds } })
        .select('name email')
        .exec();

      // Create a business lookup map
      const businessMap = businesses.reduce((map, business) => {
        map[business._id.toString()] = {
          name: business.name,
          email: business.email
        };
        return map;
      }, {});

      // Add business data to tickets
      const ticketsWithBusiness = tickets.map(ticket => {
        const ticketObj = ticket.toObject();
        return {
          ...ticketObj,
          business: businessMap[ticket.businessId.toString()] || null
        };
      });

      return {
        tickets: ticketsWithBusiness as any[], // Type assertion needed for business property
        total,
        page,
        limit,
        success: true
      };

    } catch (error) {
      this.logger.error(`Error getting all tickets: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get a specific ticket - Log only for business access
   */
  async getTicket(
    ticketId: string, 
    businessId?: string, 
    clientId?: string,
    userId?: string,
    req?: any
  ): Promise<Ticket> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');

    try {
      const query: any = { _id: ticketId, isDeleted: false };
      
      // If businessId is provided, restrict to that business
      if (businessId) {
        query.businessId = businessId;
      }

      // If clientId is provided (support team access), restrict to that client
      if (clientId) {
        query.clientId = clientId;
      }

      const ticket = await this.ticketModel
        .findOne(query)
        .populate('businessId', 'name email')
        .exec();
      
      if (!ticket) {
        // Log ticket not found only for business access
        if (businessId) {
          await this.auditLogService.createAuditLog({
            businessId,
            userId,
            action: AuditAction.TICKET_ACCESSED,
            resourceType: ResourceType.TICKET,
            resourceId: ticketId,
            resourceName: `Ticket ${ticketId}`,
            success: false,
            errorMessage: 'Ticket not found',
            severity: AuditSeverity.MEDIUM,
            ipAddress,
            userAgent,
            metadata: {
              ticketId,
              errorReason: 'ticket_not_found'
            }
          });
        }
        throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
      }

      // Log successful ticket access only for business
      if (businessId) {
        await this.auditLogService.createAuditLog({
          businessId,
          userId,
          action: AuditAction.TICKET_ACCESSED,
          resourceType: ResourceType.TICKET,
          resourceId: ticket._id.toString(),
          resourceName: ticket.title,
          success: true,
          severity: AuditSeverity.LOW,
          ipAddress,
          userAgent,
          metadata: {
            ticketId: ticket._id.toString(),
            title: ticket.title,
            status: ticket.status,
            priority: ticket.priority,
            category: ticket.category,
            messageCount: ticket.messages?.length || 0
          }
        });
      }

      return ticket;
    } catch (error) {
      this.logger.error(`Error getting ticket: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update ticket details - Log only for business-initiated updates
   */
  async updateTicket(
    ticketId: string,
    updateTicketDto: UpdateTicketDto,
    clientId?: string,
    businessId?: string,
    userId?: string,
    req?: any
  ): Promise<Ticket> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      const query: any = { _id: ticketId, isDeleted: false };
      
      // If clientId provided (support team), verify client ownership
      if (clientId) {
        query.clientId = clientId;
      }

      // If businessId provided, verify business ownership
      if (businessId) {
        query.businessId = businessId;
      }

      const originalTicket = await this.ticketModel.findOne(query).exec();

      if (!originalTicket) {
        // Log ticket not found only for business updates
        if (businessId) {
          await this.auditLogService.createAuditLog({
            businessId,
            userId,
            action: AuditAction.TICKET_UPDATED,
            resourceType: ResourceType.TICKET,
            resourceId: ticketId,
            resourceName: `Ticket ${ticketId}`,
            success: false,
            errorMessage: 'Ticket not found',
            severity: AuditSeverity.MEDIUM,
            ipAddress,
            userAgent,
            metadata: {
              ticketId,
              updateFields: Object.keys(updateTicketDto),
              errorReason: 'ticket_not_found',
              operationDuration: Date.now() - startTime
            }
          });
        }
        throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
      }

      const updateData: any = { ...updateTicketDto };

      // If marking as resolved, set resolvedAt timestamp
      if (updateTicketDto.status === TicketStatus.RESOLVED) {
        updateData.resolvedAt = new Date();
      }

      const ticket = await this.ticketModel.findOneAndUpdate(
        query,
        { $set: updateData },
        { new: true }
      ).exec();

      if (!ticket) {
        throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
      }

      // Log successful ticket update only for business updates
      if (businessId) {
        // Track changed fields
        const changedFields: string[] = [];
        const oldValues: any = {};
        const newValues: any = {};

        Object.keys(updateTicketDto).forEach(field => {
          if (originalTicket[field] !== updateTicketDto[field]) {
            changedFields.push(field);
            oldValues[field] = originalTicket[field];
            newValues[field] = updateTicketDto[field];
          }
        });

        await this.auditLogService.createAuditLog({
          businessId,
          userId,
          action: AuditAction.TICKET_UPDATED,
          resourceType: ResourceType.TICKET,
          resourceId: ticket._id.toString(),
          resourceName: ticket.title,
          success: true,
          severity: AuditSeverity.MEDIUM,
          ipAddress,
          userAgent,
          oldValues,
          newValues,
          changedFields,
          metadata: {
            ticketId: ticket._id.toString(),
            title: ticket.title,
            updatedFields: changedFields,
            statusChange: oldValues.status !== newValues.status ? {
              from: oldValues.status,
              to: newValues.status
            } : undefined,
            priorityChange: oldValues.priority !== newValues.priority ? {
              from: oldValues.priority,
              to: newValues.priority
            } : undefined,
            operationDuration: Date.now() - startTime
          }
        });
      }

      // Send notification if status changed (support team updates only)
      if (updateTicketDto.status && updateTicketDto.status !== originalTicket.status && !businessId) {
        await this.sendTicketUpdateNotification(ticket, 'status_changed');
      }

      // Send notification if assignment changed (support team updates only)
      if (updateTicketDto.assignedTo && updateTicketDto.assignedTo !== originalTicket.assignedTo && !businessId) {
        await this.sendTicketUpdateNotification(ticket, 'assignment_changed');
      }

      this.logger.log(`Ticket updated: ${ticketId} - Status: ${ticket.status}`);
      
      return ticket;
    } catch (error) {
      // Log unexpected errors only for business updates
      if (businessId && error.name !== 'NotFoundException') {
        await this.auditLogService.createAuditLog({
          businessId,
          userId,
          action: AuditAction.TICKET_UPDATED,
          resourceType: ResourceType.TICKET,
          resourceId: ticketId,
          resourceName: `Ticket ${ticketId}`,
          success: false,
          errorMessage: 'Unexpected error during ticket update',
          severity: AuditSeverity.HIGH,
          ipAddress,
          userAgent,
          metadata: {
            ticketId,
            updateFields: Object.keys(updateTicketDto),
            errorReason: 'unexpected_error',
            errorName: error.name,
            errorMessage: error.message,
            operationDuration: Date.now() - startTime
          }
        });
      }

      this.logger.error(`Error updating ticket: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
 * Add a message to a ticket - Log only business messages
 */
async addMessage(
  ticketId: string,
  addMessageDto: AddMessageDto,
  sender: 'business' | 'support',
  businessId?: string,
  clientId?: string,
  userId?: string,
  req?: any
): Promise<{
  ticket: Ticket;
  notificationResult?: any;
}> {
  const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
  const userAgent = req?.get('User-Agent');
  const startTime = Date.now();

  try {
    const query: any = { _id: ticketId, isDeleted: false };
    
    if (businessId) {
      query.businessId = businessId;
    }

    // If clientId provided (support team), verify client ownership
    if (clientId) {
      query.clientId = clientId;
    }

    let senderName = addMessageDto.senderName;
    let senderEmail = addMessageDto.senderEmail;

    // If it's a business message, get business details
    if (sender === 'business' && businessId) {
      const business = await this.businessModel.findById(businessId);
      if (business) {
        senderName = business.name;
        senderEmail = business.email;
      }
    }
    
    const message: TicketMessage = {
      sender,
      senderName,
      senderEmail,
      message: addMessageDto.message,
      attachments: addMessageDto.attachments || [],
      timestamp: new Date(),
      metadata: addMessageDto.metadata || {}
    } as TicketMessage;

    const ticket = await this.ticketModel.findOneAndUpdate(
      query,
      { 
        $push: { messages: message },
        $set: { 
          // Auto-reopen ticket if business replies to resolved/closed ticket
          status: sender === 'business' && ['resolved', 'closed'].includes(query.status) 
            ? TicketStatus.OPEN 
            : undefined
        }
      },
      { new: true }
    ).exec();

    if (!ticket) {
      // Log ticket not found only for business messages
      if (sender === 'business' && businessId) {
        await this.auditLogService.createAuditLog({
          businessId,
          userId,
          action: AuditAction.MESSAGE_SENT,
          resourceType: ResourceType.MESSAGE,
          resourceName: `Message to ticket ${ticketId}`,
          success: false,
          errorMessage: 'Ticket not found',
          severity: AuditSeverity.MEDIUM,
          ipAddress,
          userAgent,
          metadata: {
            ticketId,
            messageLength: addMessageDto.message.length,
            hasAttachments: !!(addMessageDto.attachments?.length),
            errorReason: 'ticket_not_found',
            operationDuration: Date.now() - startTime
          }
        });
      }
      throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
    }

    // Log successful message only for business messages
    if (sender === 'business' && businessId) {
      await this.auditLogService.createAuditLog({
        businessId,
        userId,
        action: AuditAction.MESSAGE_SENT,
        resourceType: ResourceType.MESSAGE,
        resourceId: ticket._id.toString(),
        resourceName: `Message to ticket: ${ticket.title}`,
        success: true,
        severity: AuditSeverity.LOW,
        ipAddress,
        userAgent,
        metadata: {
          ticketId: ticket._id.toString(),
          ticketTitle: ticket.title,
          messageLength: addMessageDto.message.length,
          hasAttachments: !!(addMessageDto.attachments?.length),
          attachmentCount: addMessageDto.attachments?.length || 0,
          messagePreview: addMessageDto.message.substring(0, 100), // First 100 chars
          ticketReopened: ticket.status === TicketStatus.OPEN && ['resolved', 'closed'].includes(query.status),
          operationDuration: Date.now() - startTime
        }
      });
    }

    // Send notification when SUPPORT adds a message (reply to business) - CAPTURE RESULT
    let notificationResult;
    if (sender === 'support') {
      notificationResult = await this.sendTicketUpdateNotification(ticket, 'message_added', {
        message: addMessageDto.message,
        senderName
      });
    }

    this.logger.log(`Message added to ticket: ${ticketId} by ${sender}`);
    
    // Return both ticket and notification debug info
    return {
      ticket,
      notificationResult
    };

  } catch (error) {
    // Log unexpected errors only for business messages
    if (sender === 'business' && businessId && error.name !== 'NotFoundException') {
      await this.auditLogService.createAuditLog({
        businessId,
        userId,
        action: AuditAction.MESSAGE_SENT,
        resourceType: ResourceType.MESSAGE,
        resourceName: `Message to ticket ${ticketId}`,
        success: false,
        errorMessage: 'Unexpected error sending message',
        severity: AuditSeverity.HIGH,
        ipAddress,
        userAgent,
        metadata: {
          ticketId,
          messageLength: addMessageDto.message.length,
          hasAttachments: !!(addMessageDto.attachments?.length),
          errorReason: 'unexpected_error',
          errorName: error.name,
          errorMessage: error.message,
          operationDuration: Date.now() - startTime
        }
      });
    }

    this.logger.error(`Error adding message to ticket: ${error.message}`, error.stack);
    throw error;
  }
}
  
  /**
   * Delete/archive a ticket - NO AUDIT LOGGING (support team action only)
   */
  async deleteTicket(ticketId: string, clientId?: string): Promise<{ success: boolean }> {
    try {
      const query: any = { _id: ticketId };
      
      // If clientId provided (support team), verify client ownership
      if (clientId) {
        query.clientId = clientId;
      }

      const result = await this.ticketModel.updateOne(
        query,
        { 
          $set: { 
            isDeleted: true, 
            deletedAt: new Date() 
          } 
        }
      ).exec();

      if (result.modifiedCount === 0) {
        throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
      }

      this.logger.log(`Ticket deleted: ${ticketId}`);
      
      return { success: true };
    } catch (error) {
      this.logger.error(`Error deleting ticket: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get ticket statistics - Log only for business stats access
   */
  async getTicketStats(
    businessId?: string, 
    clientId?: string,
    userId?: string,
    req?: any
  ): Promise<{
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    byPriority: Record<string, number>;
    byCategory: Record<string, number>;
  }> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');

    try {
      const query: any = { isDeleted: false };
      
      if (businessId) {
        query.businessId = businessId;
      }

      if (clientId) {
        query.clientId = clientId;
      }

      const [
        total,
        open,
        inProgress,
        resolved,
        closed,
        priorityStats,
        categoryStats
      ] = await Promise.all([
        this.ticketModel.countDocuments(query),
        this.ticketModel.countDocuments({ ...query, status: TicketStatus.OPEN }),
        this.ticketModel.countDocuments({ ...query, status: TicketStatus.IN_PROGRESS }),
        this.ticketModel.countDocuments({ ...query, status: TicketStatus.RESOLVED }),
        this.ticketModel.countDocuments({ ...query, status: TicketStatus.CLOSED }),
        this.ticketModel.aggregate([
          { $match: query },
          { $group: { _id: '$priority', count: { $sum: 1 } } }
        ]),
        this.ticketModel.aggregate([
          { $match: query },
          { $group: { _id: '$category', count: { $sum: 1 } } }
        ])
      ]);

      const byPriority = priorityStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {} as Record<string, number>);

      const byCategory = categoryStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {} as Record<string, number>);

      // Log stats access only for business
      if (businessId) {
        await this.auditLogService.createAuditLog({
          businessId,
          userId,
          action: AuditAction.TICKET_ACCESSED,
          resourceType: ResourceType.TICKET,
          resourceName: 'Ticket statistics',
          success: true,
          severity: AuditSeverity.LOW,
          ipAddress,
          userAgent,
          metadata: {
            statsType: 'business_ticket_stats',
            totalTickets: total,
            openTickets: open,
            resolvedTickets: resolved,
            byPriority,
            byCategory
          }
        });
      }

      return {
        total,
        open,
        inProgress,
        resolved,
        closed,
        byPriority,
        byCategory
      };
    } catch (error) {
      this.logger.error(`Error getting ticket stats: ${error.message}`, error.stack);
      throw error;
    }
  }
}