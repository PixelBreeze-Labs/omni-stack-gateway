// src/services/ticket.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ticket, TicketStatus, TicketPriority, TicketCategory, TicketMessage } from '../schemas/ticket.schema';
import { Business } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import { SaasNotificationService } from './saas-notification.service';
import { EmailService } from './email.service';
import { DeliveryChannel, NotificationPriority, NotificationType } from 'src/schemas/saas-notification.schema';

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
    private readonly emailService?: EmailService
  ) {}

  /**
 * Send notification to business when support updates ticket
 */
private async sendTicketUpdateNotification(
    ticket: Ticket,
    updateType: 'status_changed' | 'message_added' | 'assignment_changed',
    additionalData?: any
  ): Promise<void> {
    try {
      // Get business details
      const business = await this.businessModel.findById(ticket.businessId);
      if (!business) {
        this.logger.warn(`Business not found for ticket notification: ${ticket.businessId}`);
        return;
      }
  
      // Get business admin user only
      const adminUser = await this.userModel.findById(business.adminUserId);
  
      if (!adminUser) {
        this.logger.warn(`Admin user not found for business: ${ticket.businessId}`);
        return;
      }
  
      // Prepare notification content based on update type
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
  
      // Create action data for deep linking
      const actionData = {
        type: 'support_ticket',
        entityId: ticket._id.toString(),
        entityType: 'ticket',
        url: `https://app.staffluent.co/help-center`
      };
  
      // Send notification to admin user based on their preferences
      try {
        // Check admin user's individual notification preferences
        const emailEnabled = adminUser.metadata?.get('emailNotificationsEnabled') !== 'false'; // Default true
        // Determine channels for admin user
        const userChannels: DeliveryChannel[] = [DeliveryChannel.APP]; // Always send in-app notification
        
        if (emailEnabled) {
          userChannels.push(DeliveryChannel.EMAIL);
        }
  
        // Send in-app notification (always sent)
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
  
        // Send email notification if admin user has email notifications enabled
        if (emailEnabled && adminUser.email) {
          await this.sendTicketUpdateEmail(adminUser, business, ticket, updateType, additionalData);
        }
  
    
  
        this.logger.log(`Sent ticket notification to admin user ${adminUser._id} via channels: ${userChannels.join(', ')}`);
  
      } catch (notificationError) {
        this.logger.error(`Failed to send ticket notification to admin user ${adminUser._id}: ${notificationError.message}`);
      }
  
      this.logger.log(`Sent ticket ${updateType} notification for ticket ${ticket._id} to admin user`);
  
    } catch (error) {
      this.logger.error(`Error sending ticket update notification: ${error.message}`, error.stack);
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
    createTicketDto: CreateTicketDto
  ): Promise<Ticket> {
    try {

        const business = await this.businessModel.findById(businessId);

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
      
      this.logger.log(`New ticket created: ${savedTicket._id} for business: ${businessId}`);
      
      return savedTicket;
    } catch (error) {
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
    limit: number = 20
  ): Promise<TicketListResponse> {
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
 * Get all tickets (for support team) - UPDATED to support client filtering
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
  
      const tickets = await this.ticketModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('businessId', 'name email') // Populate business details
        .exec();
  
        // for each ticket add business object with name and email
        tickets.forEach(ticket => {
            // find business by id
            const business = this.businessModel.findById(ticket.businessId);
            // wait for business to be found
            business.then(business => {
                // @ts-ignore
                ticket.business = {
                    name: business.name,
                    email: business.email
                };
            });
        });

      return {
        tickets,
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
 * Get a specific ticket - UPDATED to support client filtering
 */
async getTicket(ticketId: string, businessId?: string, clientId?: string): Promise<Ticket> {
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
        throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
      }
  
      return ticket;
    } catch (error) {
      this.logger.error(`Error getting ticket: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
 * Update ticket details - UPDATED to support client verification
 */
async updateTicket(
    ticketId: string,
    updateTicketDto: UpdateTicketDto,
    clientId?: string
  ): Promise<Ticket> {
    try {
      const query: any = { _id: ticketId, isDeleted: false };
      
      // If clientId provided (support team), verify client ownership
      if (clientId) {
        query.clientId = clientId;
      }
  
      const originalTicket = await this.ticketModel.findOne(query).exec();
  
      if (!originalTicket) {
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
  
      // Send notification if status changed
      if (updateTicketDto.status && updateTicketDto.status !== originalTicket.status) {
        await this.sendTicketUpdateNotification(ticket, 'status_changed');
      }
  
      // Send notification if assignment changed
      if (updateTicketDto.assignedTo && updateTicketDto.assignedTo !== originalTicket.assignedTo) {
        await this.sendTicketUpdateNotification(ticket, 'assignment_changed');
      }
  
      this.logger.log(`Ticket updated: ${ticketId} - Status: ${ticket.status}`);
      
      return ticket;
    } catch (error) {
      this.logger.error(`Error updating ticket: ${error.message}`, error.stack);
      throw error;
    }
  }

 /**
 * Add a message to a ticket - UPDATED to support client verification
 */
async addMessage(
    ticketId: string,
    addMessageDto: AddMessageDto,
    sender: 'business' | 'support',
    businessId?: string,
    clientId?: string
  ): Promise<Ticket> {
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
        throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
      }
  
      // Send notification when SUPPORT adds a message (reply to business)
      if (sender === 'support') {
        await this.sendTicketUpdateNotification(ticket, 'message_added', {
          message: addMessageDto.message,
          senderName
        });
      }
  
      this.logger.log(`Message added to ticket: ${ticketId} by ${sender}`);
      
      return ticket;
    } catch (error) {
      this.logger.error(`Error adding message to ticket: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
 * Delete/archive a ticket - UPDATED to support client verification
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
 * Get ticket statistics - UPDATED to support client filtering
 */
async getTicketStats(businessId?: string, clientId?: string): Promise<{
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    byPriority: Record<string, number>;
    byCategory: Record<string, number>;
  }> {
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