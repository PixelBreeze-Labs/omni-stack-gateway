// src/services/ticket.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ticket, TicketStatus, TicketPriority, TicketCategory, TicketMessage } from '../schemas/ticket.schema';
import { Business } from '../schemas/business.schema';

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
}

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);

  constructor(
    @InjectModel(Ticket.name) private ticketModel: Model<Ticket>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
  ) {}

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
   * Get all tickets (for support team)
   */
  async getAllTickets(
    filters: TicketFilters = {},
    page: number = 1,
    limit: number = 20
  ): Promise<TicketListResponse> {
    try {
      const query: any = { isDeleted: false };

      // Apply same filters as business tickets
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
      this.logger.error(`Error getting all tickets: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get a specific ticket
   */
  async getTicket(ticketId: string, businessId?: string): Promise<Ticket> {
    try {
      const query: any = { _id: ticketId, isDeleted: false };
      
      // If businessId is provided, restrict to that business
      if (businessId) {
        query.businessId = businessId;
      }

      const ticket = await this.ticketModel.findOne(query).exec();
      
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
   * Update ticket details (for support team)
   */
  async updateTicket(
    ticketId: string,
    updateTicketDto: UpdateTicketDto
  ): Promise<Ticket> {
    try {
      const updateData: any = { ...updateTicketDto };

      // If marking as resolved, set resolvedAt timestamp
      if (updateTicketDto.status === TicketStatus.RESOLVED) {
        updateData.resolvedAt = new Date();
      }

      const ticket = await this.ticketModel.findOneAndUpdate(
        { _id: ticketId, isDeleted: false },
        { $set: updateData },
        { new: true }
      ).exec();

      if (!ticket) {
        throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
      }

      this.logger.log(`Ticket updated: ${ticketId} - Status: ${ticket.status}`);
      
      return ticket;
    } catch (error) {
      this.logger.error(`Error updating ticket: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Add a message to a ticket
   */
  async addMessage(
    ticketId: string,
    addMessageDto: AddMessageDto,
    sender: 'business' | 'support',
    businessId?: string
  ): Promise<Ticket> {
    try {
      const query: any = { _id: ticketId, isDeleted: false };
      
      // If businessId is provided, restrict to that business
      if (businessId) {
        query.businessId = businessId;
      }

      const business = await this.businessModel.findById(businessId);
      
      const message: TicketMessage = {
        sender,
        senderName: business.name,
        senderEmail: business.email,
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

      this.logger.log(`Message added to ticket: ${ticketId} by ${sender}`);
      
      return ticket;
    } catch (error) {
      this.logger.error(`Error adding message to ticket: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete/archive a ticket (soft delete)
   */
  async deleteTicket(ticketId: string): Promise<{ success: boolean }> {
    try {
      const result = await this.ticketModel.updateOne(
        { _id: ticketId },
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
   * Get ticket statistics
   */
  async getTicketStats(businessId?: string): Promise<{
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