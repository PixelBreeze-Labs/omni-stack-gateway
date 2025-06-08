// src/services/client-feedback.service.ts
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ClientFeedback, FeedbackStatus, FeedbackType, FeedbackPriority } from '../schemas/client-feedback.schema';
import { AppProject } from '../schemas/app-project.schema';
import { AppClient } from '../schemas/app-client.schema';

// DTOs for type safety
export interface CreateClientFeedbackDto {
  appProjectId: string;
  subject: string;
  comment: string;
  type: FeedbackType;
  priority?: FeedbackPriority;
  rating?: number;
  serviceCategory?: string;
  attachments?: string[];
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  allowBusinessContact?: boolean;
  isAnonymous?: boolean;
  metadata?: any;
}

export interface UpdateClientFeedbackDto {
  subject?: string;
  comment?: string;
  type?: FeedbackType;
  priority?: FeedbackPriority;
  rating?: number;
  attachments?: string[];
  allowBusinessContact?: boolean;
  metadata?: any;
}

export interface BusinessResponseDto {
  responseText: string;
  respondedBy: string;
  isPublic?: boolean;
  attachments?: string[];
  metadata?: any;
}

export interface FeedbackQueryDto {
  status?: FeedbackStatus;
  type?: FeedbackType;
  priority?: FeedbackPriority;
  rating?: number;
  serviceCategory?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

@Injectable()
export class ClientFeedbackService {
  constructor(
    @InjectModel(ClientFeedback.name)
    private readonly clientFeedbackModel: Model<ClientFeedback>,
    
    @InjectModel(AppProject.name)
    private readonly appProjectModel: Model<AppProject>,
    
    @InjectModel(AppClient.name)
    private readonly appClientModel: Model<AppClient>,
  ) {}

  // Client-side methods
  async createFeedback(
    appClientId: string,
    createFeedbackDto: CreateClientFeedbackDto,
  ): Promise<ClientFeedback> {
    // Verify client exists and owns the project
    const client = await this.appClientModel.findById(appClientId);
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    // Verify project exists and is completed
    const project = await this.appProjectModel.findById(createFeedbackDto.appProjectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Check if project is completed (assuming status 'completed' or metadata indicates completion)
    if (project.status !== 'completed' && project.metadata?.status !== 'completed') {
      throw new BadRequestException('Feedback can only be submitted for completed projects');
    }

    // Check if client is associated with this project
    if (project.clientId !== appClientId) {
      throw new ForbiddenException('You can only provide feedback for your own projects');
    }

    // Check if feedback already exists for this project
    const existingFeedback = await this.clientFeedbackModel.findOne({
      appClientId,
      appProjectId: createFeedbackDto.appProjectId,
      isDeleted: false,
    });

    if (existingFeedback) {
      throw new BadRequestException('Feedback already exists for this project');
    }

    const feedback = new this.clientFeedbackModel({
      ...createFeedbackDto,
      appClientId,
      businessId: project.businessId,
      submittedAt: new Date(),
      status: FeedbackStatus.PENDING,
      projectCompletedDate: project.metadata?.endDate || new Date(),
    });

    return feedback.save();
  }

  async getClientFeedbacks(
    appClientId: string,
    query: FeedbackQueryDto = {},
  ): Promise<{
    feedbacks: ClientFeedback[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      status,
      type,
      priority,
      rating,
      serviceCategory,
      startDate,
      endDate,
      page = 1,
      limit = 10,
      sortBy = 'submittedAt',
      sortOrder = 'desc',
    } = query;

    // Build filter
    const filter: any = {
      appClientId,
      isDeleted: false,
    };

    if (status) filter.status = status;
    if (type) filter.type = type;
    if (priority) filter.priority = priority;
    if (rating) filter.rating = rating;
    if (serviceCategory) filter.serviceCategory = serviceCategory;

    if (startDate || endDate) {
      filter.submittedAt = {};
      if (startDate) filter.submittedAt.$gte = startDate;
      if (endDate) filter.submittedAt.$lte = endDate;
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [feedbacks, total] = await Promise.all([
      this.clientFeedbackModel
        .find(filter)
        .populate('appProject', 'name description')
        // @ts-ignore
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.clientFeedbackModel.countDocuments(filter),
    ]);

    return {
      feedbacks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getFeedbackById(feedbackId: string, appClientId: string): Promise<ClientFeedback> {
    const feedback = await this.clientFeedbackModel
      .findOne({ _id: feedbackId, appClientId, isDeleted: false })
      .populate('appProject', 'name description')
      .exec();

    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    return feedback;
  }

  async updateFeedback(
    feedbackId: string,
    appClientId: string,
    updateDto: UpdateClientFeedbackDto,
  ): Promise<ClientFeedback> {
    const feedback = await this.clientFeedbackModel.findOne({
      _id: feedbackId,
      appClientId,
      isDeleted: false,
    });

    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    // Only allow updates if feedback is still pending
    if (feedback.status !== FeedbackStatus.PENDING) {
      throw new BadRequestException('Can only update pending feedback');
    }

    Object.assign(feedback, updateDto);
    return feedback.save();
  }

  async deleteFeedback(feedbackId: string, appClientId: string): Promise<void> {
    const feedback = await this.clientFeedbackModel.findOne({
      _id: feedbackId,
      appClientId,
      isDeleted: false,
    });

    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    // Only allow deletion if feedback is still pending
    if (feedback.status !== FeedbackStatus.PENDING) {
      throw new BadRequestException('Can only delete pending feedback');
    }

    feedback.isDeleted = true;
    feedback.deletedAt = new Date();
    feedback.deletedBy = appClientId;
    feedback.deletionReason = 'Deleted by client';
    
    await feedback.save();
  }

  // Business-side methods
  async getBusinessFeedbacks(
    businessId: string,
    query: FeedbackQueryDto = {},
  ): Promise<{
    feedbacks: ClientFeedback[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    stats: {
      averageRating: number;
      totalFeedbacks: number;
      byStatus: Record<string, number>;
      byType: Record<string, number>;
      byRating: Record<string, number>;
    };
  }> {
    const {
      status,
      type,
      priority,
      rating,
      serviceCategory,
      startDate,
      endDate,
      page = 1,
      limit = 10,
      sortBy = 'submittedAt',
      sortOrder = 'desc',
    } = query;

    // Build filter - only show approved feedbacks to business
    const filter: any = {
      businessId,
      status: { $in: [FeedbackStatus.APPROVED, FeedbackStatus.RESPONDED, FeedbackStatus.RESOLVED] },
      isDeleted: false,
      isVisible: true,
    };

    if (status && [FeedbackStatus.APPROVED, FeedbackStatus.RESPONDED, FeedbackStatus.RESOLVED].includes(status)) {
      filter.status = status;
    }
    if (type) filter.type = type;
    if (priority) filter.priority = priority;
    if (rating) filter.rating = rating;
    if (serviceCategory) filter.serviceCategory = serviceCategory;

    if (startDate || endDate) {
      filter.submittedAt = {};
      if (startDate) filter.submittedAt.$gte = startDate;
      if (endDate) filter.submittedAt.$lte = endDate;
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [feedbacks, total, stats] = await Promise.all([
      this.clientFeedbackModel
        .find(filter)
        .populate('appProject', 'name description')
        .populate('appClient', 'name email phone')
        // @ts-ignore
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.clientFeedbackModel.countDocuments(filter),
      this.getBusinessFeedbackStats(businessId),
    ]);

    return {
      feedbacks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats,
    };
  }

  async addBusinessResponse(
    feedbackId: string,
    businessId: string,
    responseDto: BusinessResponseDto,
  ): Promise<ClientFeedback> {
    const feedback = await this.clientFeedbackModel.findOne({
      _id: feedbackId,
      businessId,
      status: { $in: [FeedbackStatus.APPROVED, FeedbackStatus.RESPONDED] },
      isDeleted: false,
    });

    if (!feedback) {
      throw new NotFoundException('Feedback not found or not accessible');
    }

    feedback.businessResponse = {
      ...responseDto,
      respondedAt: new Date(),
      isPublic: responseDto.isPublic ?? true,
    };

    feedback.status = FeedbackStatus.RESPONDED;
    feedback.respondedAt = new Date();

    return feedback.save();
  }

  async markAsResolved(
    feedbackId: string,
    businessId: string,
    notes?: string,
  ): Promise<ClientFeedback> {
    const feedback = await this.clientFeedbackModel.findOne({
      _id: feedbackId,
      businessId,
      status: { $in: [FeedbackStatus.APPROVED, FeedbackStatus.RESPONDED] },
      isDeleted: false,
    });

    if (!feedback) {
      throw new NotFoundException('Feedback not found or not accessible');
    }

    feedback.status = FeedbackStatus.RESOLVED;
    feedback.resolvedAt = new Date();
    
    if (notes) {
      feedback.metadata = {
        ...feedback.metadata,
        resolutionNotes: notes,
      };
    }

    return feedback.save();
  }

  // Statistics and analytics
  async getBusinessFeedbackStats(businessId: string): Promise<{
    averageRating: number;
    totalFeedbacks: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    byRating: Record<string, number>;
  }> {
    const pipeline = [
      {
        $match: {
          businessId: new Types.ObjectId(businessId),
          isDeleted: false,
          status: { $in: [FeedbackStatus.APPROVED, FeedbackStatus.RESPONDED, FeedbackStatus.RESOLVED] },
        },
      },
      {
        $group: {
          _id: null,
          totalFeedbacks: { $sum: 1 },
          averageRating: { $avg: '$rating' },
          statusCounts: {
            $push: '$status',
          },
          typeCounts: {
            $push: '$type',
          },
          ratingCounts: {
            $push: '$rating',
          },
        },
      },
    ];

    const [result] = await this.clientFeedbackModel.aggregate(pipeline);

    if (!result) {
      return {
        averageRating: 0,
        totalFeedbacks: 0,
        byStatus: {},
        byType: {},
        byRating: {},
      };
    }

    // Count occurrences
    const byStatus = result.statusCounts.reduce((acc, status) => {
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const byType = result.typeCounts.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    const byRating = result.ratingCounts.filter(r => r).reduce((acc, rating) => {
      acc[rating] = (acc[rating] || 0) + 1;
      return acc;
    }, {});

    return {
      averageRating: parseFloat((result.averageRating || 0).toFixed(2)),
      totalFeedbacks: result.totalFeedbacks,
      byStatus,
      byType,
      byRating,
    };
  }

  async getClientFeedbackStats(appClientId: string): Promise<{
    totalFeedbacks: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    averageRating: number;
  }> {
    const pipeline = [
      {
        $match: {
          appClientId: new Types.ObjectId(appClientId),
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: null,
          totalFeedbacks: { $sum: 1 },
          averageRating: { $avg: '$rating' },
          statusCounts: { $push: '$status' },
          typeCounts: { $push: '$type' },
        },
      },
    ];

    const [result] = await this.clientFeedbackModel.aggregate(pipeline);

    if (!result) {
      return {
        totalFeedbacks: 0,
        byStatus: {},
        byType: {},
        averageRating: 0,
      };
    }

    const byStatus = result.statusCounts.reduce((acc, status) => {
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const byType = result.typeCounts.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    return {
      totalFeedbacks: result.totalFeedbacks,
      byStatus,
      byType,
      averageRating: parseFloat((result.averageRating || 0).toFixed(2)),
    };
  }

  // Staffluent methods
  async getAllPendingFeedbacks(query: FeedbackQueryDto = {}): Promise<ClientFeedback[]> {
    const filter = {
      status: FeedbackStatus.PENDING,
      isDeleted: false,
      ...query,
    };

    return this.clientFeedbackModel
      .find(filter)
      .populate('appProject', 'name description')
      .populate('appClient', 'name email')
      .populate('business', 'name')
      .sort({ submittedAt: 1 })
      .exec();
  }
}