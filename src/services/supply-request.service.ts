// src/services/supply-request.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SupplyRequest, SupplyRequestStatus, SupplyRequestPriority } from '../schemas/supply-request.schema';
import { Equipment } from '../schemas/equipment.schema';
import { AppProject } from '../schemas/app-project.schema';
import { Business } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import { AuditLogService } from './audit-log.service';
import { AppActivityService } from './app-activity.service';
import { AuditAction, AuditSeverity, ResourceType } from '../schemas/audit-log.schema';
import { ActivityType } from '../schemas/app-activity.schema';
import {
  CreateSupplyRequestDto,
  UpdateSupplyRequestDto,
  ApproveSupplyRequestDto,
  RejectSupplyRequestDto,
  MarkDeliveredDto,
  SupplyRequestResponseDto,
  SupplyRequestsListResponseDto
} from '../dtos/supply-request.dto';

interface SupplyRequestPaginationOptions {
  page?: number;
  limit?: number;
  status?: SupplyRequestStatus;
  priority?: SupplyRequestPriority;
  requestedBy?: string;
  overdueOnly?: boolean;
}

@Injectable()
export class SupplyRequestService {
  private readonly logger = new Logger(SupplyRequestService.name);

  constructor(
    @InjectModel(SupplyRequest.name) private supplyRequestModel: Model<SupplyRequest>,
    @InjectModel(Equipment.name) private equipmentModel: Model<Equipment>,
    @InjectModel(AppProject.name) private appProjectModel: Model<AppProject>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly auditLogService: AuditLogService,
    private readonly appActivityService: AppActivityService
  ) {}

  /**
   * Create a new supply request
   */
  async createSupplyRequest(
    projectId: string,
    createSupplyRequestDto: CreateSupplyRequestDto,
    requesterId: string,
    adminUserId?: string,
    req?: any
  ): Promise<SupplyRequestResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Validate project and get business context
      const { project, business, requester } = await this.validateSupplyRequestAccess(projectId, requesterId);

      // Validate and enrich equipment items
      const enrichedItems = await this.validateAndEnrichEquipmentItems(
        createSupplyRequestDto.requestedItems,
        business._id.toString()
      );

      // Calculate total estimated cost
      const totalEstimatedCost = enrichedItems.reduce((sum, item) => {
        return sum + (item.estimatedTotalCost || 0);
      }, 0);

      // Create supply request
      const supplyRequest = new this.supplyRequestModel({
        businessId: project.businessId,
        appProjectId: projectId,
        requestedBy: requesterId,
        description: createSupplyRequestDto.description,
        name: createSupplyRequestDto.name,
        requestedDate: new Date(),
        requiredDate: createSupplyRequestDto.requiredDate,
        priority: createSupplyRequestDto.priority || SupplyRequestPriority.MEDIUM,
        requestedItems: enrichedItems,
        totalEstimatedCost,
        metadata: {
          ...createSupplyRequestDto.metadata,
          requestedByName: `${requester.name} ${requester.surname || ''}`.trim(),
          requestedByEmail: requester.email,
          projectName: project.name,
          totalItemsRequested: enrichedItems.length,
          isUrgent: createSupplyRequestDto.priority === SupplyRequestPriority.URGENT
        }
      });

      await supplyRequest.save();

      // 🎯 AUDIT LOG - Business action
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.SUPPLY_REQUEST_CREATED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: createSupplyRequestDto.priority === SupplyRequestPriority.URGENT ? AuditSeverity.HIGH : AuditSeverity.MEDIUM,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            projectName: project.name,
            supplyRequestId: supplyRequest._id.toString(),
            requestDescription: createSupplyRequestDto.description,
            priority: createSupplyRequestDto.priority,
            requesterId,
            requesterName: `${requester.name} ${requester.surname || ''}`.trim(),
            totalItems: enrichedItems.length,
            totalEstimatedCost,
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity
      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId: requesterId,
        userName: `${requester.name} ${requester.surname || ''}`.trim(),
        userEmail: requester.email,
        type: ActivityType.SUPPLY_REQUEST_CREATED,
        action: `requested supplies for project`,
        description: `${createSupplyRequestDto.description}`,
        projectId,
        projectName: project.name,
        resourceType: 'supply_request',
        resourceId: supplyRequest._id.toString(),
        resourceName: createSupplyRequestDto.name || 'Supply Request',
        data: {
          supplyRequestId: supplyRequest._id.toString(),
          requestDescription: createSupplyRequestDto.description,
          priority: createSupplyRequestDto.priority,
          totalItems: enrichedItems.length,
          totalEstimatedCost,
          projectName: project.name
        }
      });

      this.logger.log(`Supply request created for project ${projectId} by user ${requesterId}`);
      return this.transformSupplyRequestToResponse(supplyRequest, requester);

    } catch (error) {
      // 🎯 AUDIT LOG - Error for business actions only
      if (adminUserId && this.shouldLogError(error)) {
        await this.auditLogService.createAuditLog({
          businessId: projectId, // fallback
          userId: adminUserId,
          action: AuditAction.SUPPLY_REQUEST_CREATED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Supply request creation`,
          success: false,
          errorMessage: 'Error creating supply request',
          severity: AuditSeverity.HIGH,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            requesterId,
            requestDescription: createSupplyRequestDto.description,
            errorReason: this.categorizeError(error),
            errorName: error.name,
            errorMessage: error.message,
            operationDuration: Date.now() - startTime
          }
        });
      }

      this.logger.error(`Error creating supply request for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Get supply requests for a project with pagination and filters
   */
  async getProjectSupplyRequests(
    projectId: string,
    options: SupplyRequestPaginationOptions = {},
    adminUserId?: string,
    req?: any
  ): Promise<SupplyRequestsListResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');

    try {
      // Validate project exists
      const project = await this.appProjectModel.findById(projectId);
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const page = options.page || 1;
      const limit = Math.min(options.limit || 20, 100);
      const skip = (page - 1) * limit;

      // Build query
      const query: any = {
        appProjectId: projectId,
        isDeleted: false
      };

      if (options.status) {
        query.status = options.status;
      }

      if (options.priority) {
        query.priority = options.priority;
      }

      if (options.requestedBy) {
        query.requestedBy = options.requestedBy;
      }

      if (options.overdueOnly) {
        query.requiredDate = { $lt: new Date() };
        query.status = { $nin: [SupplyRequestStatus.DELIVERED, SupplyRequestStatus.CANCELLED] };
      }

      // Get supply requests with requester information
      const requests = await this.supplyRequestModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('requestedBy', 'name surname email')
        .populate('approvedBy', 'name surname email')
        .exec();

      // Get total count
      const total = await this.supplyRequestModel.countDocuments(query);

      // Get summary statistics
      const [summary] = await this.supplyRequestModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false
          }
        },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: 1 },
            pendingRequests: {
              $sum: { $cond: [{ $eq: ['$status', SupplyRequestStatus.PENDING] }, 1, 0] }
            },
            approvedRequests: {
              $sum: { $cond: [{ $eq: ['$status', SupplyRequestStatus.APPROVED] }, 1, 0] }
            },
            deliveredRequests: {
              $sum: { $cond: [{ $eq: ['$status', SupplyRequestStatus.DELIVERED] }, 1, 0] }
            },
            totalEstimatedCost: { $sum: '$totalEstimatedCost' },
            lastRequestAt: { $max: '$createdAt' }
          }
        }
      ]);

      // Count overdue requests
      const overdueCount = await this.supplyRequestModel.countDocuments({
        appProjectId: projectId,
        isDeleted: false,
        requiredDate: { $lt: new Date() },
        status: { $nin: [SupplyRequestStatus.DELIVERED, SupplyRequestStatus.CANCELLED] }
      });

      // Transform requests to response format
      const transformedRequests = requests.map(request => 
        this.transformSupplyRequestToResponse(request, request.requestedBy, request.approvedBy)
      );

      // 🎯 AUDIT LOG - Business viewing supply requests
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.SUPPLY_REQUESTS_VIEWED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.LOW,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            projectName: project.name,
            page,
            limit,
            status: options.status,
            priority: options.priority,
            totalRequests: total,
            requestsReturned: requests.length
          }
        });
      }

      const totalPages = Math.ceil(total / limit);

      return {
        requests: transformedRequests,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        },
        summary: {
          totalRequests: summary?.totalRequests || 0,
          pendingRequests: summary?.pendingRequests || 0,
          approvedRequests: summary?.approvedRequests || 0,
          deliveredRequests: summary?.deliveredRequests || 0,
          overdueRequests: overdueCount,
          totalEstimatedCost: summary?.totalEstimatedCost || 0,
          lastRequestAt: summary?.lastRequestAt || null
        }
      };

    } catch (error) {
      this.logger.error(`Error getting supply requests for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Update a supply request
   */
  async updateSupplyRequest(
    projectId: string,
    requestId: string,
    updateSupplyRequestDto: UpdateSupplyRequestDto,
    userId: string,
    adminUserId?: string,
    req?: any
  ): Promise<SupplyRequestResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Find supply request
      const request = await this.supplyRequestModel.findOne({
        _id: requestId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('requestedBy', 'name surname email');

      if (!request) {
        throw new NotFoundException('Supply request not found');
      }

      // Validate user can edit (requester or business admin)
      const project = await this.appProjectModel.findById(projectId);
      const business = await this.businessModel.findById(project.businessId);
      
      const canEdit = request.requestedBy.toString() === userId ||
      adminUserId === business.adminUserId;

      if (!canEdit) {
        throw new ForbiddenException('You can only edit your own supply requests');
      }

      // Can only edit pending requests
      if (request.status !== SupplyRequestStatus.PENDING) {
        throw new BadRequestException('Can only edit pending supply requests');
      }

      // Store old values for audit
      const oldValues: any = {};
      const newValues: any = {};

      // Update fields
      if (updateSupplyRequestDto.description !== undefined) {
        oldValues.description = request.description;
        newValues.description = updateSupplyRequestDto.description;
        request.description = updateSupplyRequestDto.description;
      }

      if (updateSupplyRequestDto.name !== undefined) {
        oldValues.name = request.name;
        newValues.name = updateSupplyRequestDto.name;
        request.name = updateSupplyRequestDto.name;
      }

      if (updateSupplyRequestDto.requiredDate !== undefined) {
        oldValues.requiredDate = request.requiredDate;
        newValues.requiredDate = updateSupplyRequestDto.requiredDate;
        request.requiredDate = updateSupplyRequestDto.requiredDate;
      }

      if (updateSupplyRequestDto.priority !== undefined) {
        oldValues.priority = request.priority;
        newValues.priority = updateSupplyRequestDto.priority;
        request.priority = updateSupplyRequestDto.priority;
      }

      // Update equipment items if provided
      if (updateSupplyRequestDto.requestedItems) {
        const enrichedItems = await this.validateAndEnrichEquipmentItems(
          updateSupplyRequestDto.requestedItems,
          business._id.toString()
        );

        oldValues.requestedItems = request.requestedItems;
        newValues.requestedItems = enrichedItems;
        request.requestedItems = enrichedItems;

        // Recalculate total cost
        const totalEstimatedCost = enrichedItems.reduce((sum, item) => {
          return sum + (item.estimatedTotalCost || 0);
        }, 0);
        
        oldValues.totalEstimatedCost = request.totalEstimatedCost;
        newValues.totalEstimatedCost = totalEstimatedCost;
        request.totalEstimatedCost = totalEstimatedCost;
        
        request.metadata.totalItemsRequested = enrichedItems.length;
      }

      request.markModified('metadata');
      await request.save();

      // 🎯 AUDIT LOG - Business action
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.SUPPLY_REQUEST_UPDATED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.MEDIUM,
          ipAddress,
          userAgent,
          oldValues,
          newValues,
          changedFields: Object.keys(updateSupplyRequestDto),
          metadata: {
            projectId,
            projectName: project.name,
            supplyRequestId: requestId,
            updatedBy: userId,
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity
      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId,
        // @ts-ignore
        userName: `${request.requestedBy.name} ${request.requestedBy.surname || ''}`.trim(),
        // @ts-ignore
        userEmail: request.requestedBy.email,
        type: ActivityType.SUPPLY_REQUEST_UPDATED,
        action: 'updated supply request',
        description: `Updated ${request.name || 'supply request'}`,
        projectId,
        projectName: project.name,
        resourceType: 'supply_request',
        resourceId: requestId,
        resourceName: request.name || 'Supply Request',
        data: {
          supplyRequestId: requestId,
          updatedFields: Object.keys(updateSupplyRequestDto),
          projectName: project.name
        }
      });

      this.logger.log(`Supply request ${requestId} updated for project ${projectId} by user ${userId}`);
      return this.transformSupplyRequestToResponse(request, request.requestedBy);

    } catch (error) {
      this.logger.error(`Error updating supply request ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Approve a supply request
   */
  async approveSupplyRequest(
    projectId: string,
    requestId: string,
    approveDto: ApproveSupplyRequestDto,
    approverId: string,
    adminUserId?: string,
    req?: any
  ): Promise<SupplyRequestResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Find supply request
      const request = await this.supplyRequestModel.findOne({
        _id: requestId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('requestedBy', 'name surname email');

      if (!request) {
        throw new NotFoundException('Supply request not found');
      }

      // Can only approve pending requests
      if (request.status !== SupplyRequestStatus.PENDING) {
        throw new BadRequestException('Can only approve pending supply requests');
      }

      const project = await this.appProjectModel.findById(projectId);
      const approver = await this.userModel.findById(approverId);

      // Update request status and approval info
      request.status = SupplyRequestStatus.APPROVED;
      request.approvedBy = approverId;
      request.approvedAt = new Date();
      request.approvalNotes = approveDto.approvalNotes;
      request.expectedDeliveryDate = approveDto.expectedDeliveryDate;

      // Update approved quantities if provided
      if (approveDto.approvedQuantities) {
        let totalApprovedCost = 0;
        
        request.requestedItems.forEach(item => {
          const approvedQty = approveDto.approvedQuantities[item.equipmentId];
          if (approvedQty !== undefined) {
            item.quantityApproved = approvedQty;
            item.estimatedTotalCost = (item.estimatedUnitCost || 0) * approvedQty;
            totalApprovedCost += item.estimatedTotalCost;
          } else {
            // If not specified, approve the full requested quantity
            item.quantityApproved = item.quantityRequested;
            totalApprovedCost += item.estimatedTotalCost || 0;
          }
        });

        request.totalApprovedCost = totalApprovedCost;
      } else {
        // Approve all requested quantities
        request.requestedItems.forEach(item => {
          item.quantityApproved = item.quantityRequested;
        });
        request.totalApprovedCost = request.totalEstimatedCost;
      }

      request.metadata.approvedByName = `${approver.name} ${approver.surname || ''}`.trim();
      request.metadata.totalItemsApproved = request.requestedItems.length;

      request.markModified('requestedItems');
      request.markModified('metadata');
      await request.save();

      // 🎯 AUDIT LOG - Business action
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.SUPPLY_REQUEST_APPROVED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.MEDIUM,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            projectName: project.name,
            supplyRequestId: requestId,
            approverId,
            approverName: `${approver.name} ${approver.surname || ''}`.trim(),
            totalApprovedCost: request.totalApprovedCost,
            approvalNotes: approveDto.approvalNotes,
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity
      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId: approverId,
        userName: `${approver.name} ${approver.surname || ''}`.trim(),
        userEmail: approver.email,
        type: ActivityType.SUPPLY_REQUEST_APPROVED,
        action: 'approved supply request',
        description: `Approved ${request.name || 'supply request'}`,
        projectId,
        projectName: project.name,
        resourceType: 'supply_request',
        resourceId: requestId,
        resourceName: request.name || 'Supply Request',
        data: {
          supplyRequestId: requestId,
          totalApprovedCost: request.totalApprovedCost,
          approvalNotes: approveDto.approvalNotes,
          projectName: project.name
        }
      });

      this.logger.log(`Supply request ${requestId} approved by user ${approverId}`);
      return this.transformSupplyRequestToResponse(request, request.requestedBy, approver);

    } catch (error) {
      this.logger.error(`Error approving supply request ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Reject a supply request
   */
  async rejectSupplyRequest(
    projectId: string,
    requestId: string,
    rejectDto: RejectSupplyRequestDto,
    rejecterId: string,
    adminUserId?: string,
    req?: any
  ): Promise<SupplyRequestResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Find supply request
      const request = await this.supplyRequestModel.findOne({
        _id: requestId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('requestedBy', 'name surname email');

      if (!request) {
        throw new NotFoundException('Supply request not found');
      }

      // Can only reject pending requests
      if (request.status !== SupplyRequestStatus.PENDING) {
        throw new BadRequestException('Can only reject pending supply requests');
      }

      const project = await this.appProjectModel.findById(projectId);
      const rejecter = await this.userModel.findById(rejecterId);

      // Update request status
      request.status = SupplyRequestStatus.REJECTED;
      request.approvedBy = rejecterId; // Store who rejected it
      request.approvedAt = new Date();
      request.rejectionReason = rejectDto.rejectionReason;

      await request.save();

      // 🎯 AUDIT LOG - Business action
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.SUPPLY_REQUEST_REJECTED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.MEDIUM,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            projectName: project.name,
            supplyRequestId: requestId,
            rejecterId,
            rejecterName: `${rejecter.name} ${rejecter.surname || ''}`.trim(),
            rejectionReason: rejectDto.rejectionReason,
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity
      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId: rejecterId,
        userName: `${rejecter.name} ${rejecter.surname || ''}`.trim(),
        userEmail: rejecter.email,
        type: ActivityType.SUPPLY_REQUEST_REJECTED,
        action: 'rejected supply request',
        description: `Rejected ${request.name || 'supply request'}`,
        projectId,
        projectName: project.name,
        resourceType: 'supply_request',
        resourceId: requestId,
        resourceName: request.name || 'Supply Request',
        data: {
          supplyRequestId: requestId,
          rejectionReason: rejectDto.rejectionReason,
          projectName: project.name
        }
      });

      this.logger.log(`Supply request ${requestId} rejected by user ${rejecterId}`);
      return this.transformSupplyRequestToResponse(request, request.requestedBy, rejecter);

    } catch (error) {
      this.logger.error(`Error rejecting supply request ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Mark supply request as delivered
   */
  async markSupplyRequestDelivered(
    projectId: string,
    requestId: string,
    deliveredDto: MarkDeliveredDto,
    userId: string,
    adminUserId?: string,
    req?: any
  ): Promise<SupplyRequestResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Find supply request
      const request = await this.supplyRequestModel.findOne({
        _id: requestId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('requestedBy', 'name surname email')
        .populate('approvedBy', 'name surname email');

      if (!request) {
        throw new NotFoundException('Supply request not found');
      }

      // Can only mark approved or ordered requests as delivered
      if (![SupplyRequestStatus.APPROVED, SupplyRequestStatus.ORDERED, SupplyRequestStatus.PARTIALLY_DELIVERED].includes(request.status)) {
        throw new BadRequestException('Can only mark approved/ordered requests as delivered');
      }

      const project = await this.appProjectModel.findById(projectId);
      const deliverer = await this.userModel.findById(userId);

      // Update delivered quantities if provided
      if (deliveredDto.deliveredQuantities) {
        request.requestedItems.forEach(item => {
          const deliveredQty = deliveredDto.deliveredQuantities[item.equipmentId];
          if (deliveredQty !== undefined) {
            item.quantityDelivered = (item.quantityDelivered || 0) + deliveredQty;
          }
        });
      } else {
        // Mark all approved quantities as delivered
        request.requestedItems.forEach(item => {
          item.quantityDelivered = item.quantityApproved || item.quantityRequested;
        });
      }

      // Check if fully delivered
      const fullyDelivered = request.requestedItems.every(item => 
        (item.quantityDelivered || 0) >= (item.quantityApproved || item.quantityRequested)
      );

      request.status = fullyDelivered ? SupplyRequestStatus.DELIVERED : SupplyRequestStatus.PARTIALLY_DELIVERED;
      request.deliveredAt = fullyDelivered ? new Date() : request.deliveredAt;
      request.deliveryNotes = deliveredDto.deliveryNotes;
      request.actualCost = deliveredDto.actualCost;
      request.supplierName = deliveredDto.supplierName;

      request.metadata.totalItemsDelivered = request.requestedItems.reduce((sum, item) => 
        sum + (item.quantityDelivered || 0), 0
      );

      request.markModified('requestedItems');
      request.markModified('metadata');
      await request.save();

      // 🎯 AUDIT LOG - Business action
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.SUPPLY_REQUEST_DELIVERED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.MEDIUM,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            projectName: project.name,
            supplyRequestId: requestId,
            deliveredBy: userId,
            delivererName: `${deliverer.name} ${deliverer.surname || ''}`.trim(),
            actualCost: deliveredDto.actualCost,
            supplierName: deliveredDto.supplierName,
            fullyDelivered,
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity
      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId,
        userName: `${deliverer.name} ${deliverer.surname || ''}`.trim(),
        userEmail: deliverer.email,
        type: ActivityType.SUPPLY_REQUEST_DELIVERED,
        action: fullyDelivered ? 'marked supply request as delivered' : 'updated supply delivery',
        description: `${fullyDelivered ? 'Completed' : 'Partially delivered'} ${request.name || 'supply request'}`,
        projectId,
        projectName: project.name,
        resourceType: 'supply_request',
        resourceId: requestId,
        resourceName: request.name || 'Supply Request',
        data: {
          supplyRequestId: requestId,
          actualCost: deliveredDto.actualCost,
          supplierName: deliveredDto.supplierName,
          fullyDelivered,
          projectName: project.name
        }
      });

      this.logger.log(`Supply request ${requestId} marked as ${fullyDelivered ? 'delivered' : 'partially delivered'} by user ${userId}`);
      return this.transformSupplyRequestToResponse(request, request.requestedBy, request.approvedBy);

    } catch (error) {
      this.logger.error(`Error marking supply request ${requestId} as delivered:`, error);
      throw error;
    }
  }

  /**
   * Get single supply request
   */
  async getSupplyRequest(
    projectId: string,
    requestId: string
  ): Promise<SupplyRequestResponseDto> {
    try {
      const request = await this.supplyRequestModel.findOne({
        _id: requestId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('requestedBy', 'name surname email')
        .populate('approvedBy', 'name surname email');

      if (!request) {
        throw new NotFoundException('Supply request not found');
      }

      return this.transformSupplyRequestToResponse(request, request.requestedBy, request.approvedBy);

    } catch (error) {
      this.logger.error(`Error getting supply request ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Delete supply request (soft delete)
   */
  async deleteSupplyRequest(
    projectId: string,
    requestId: string,
    userId: string,
    adminUserId?: string,
    req?: any
  ): Promise<{ success: boolean; message: string }> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Find supply request
      const request = await this.supplyRequestModel.findOne({
        _id: requestId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('requestedBy', 'name surname email');

      if (!request) {
        throw new NotFoundException('Supply request not found');
      }

      // Validate user can delete (requester or business admin)
      const project = await this.appProjectModel.findById(projectId);
      const business = await this.businessModel.findById(project.businessId);
      
      const canDelete = request.requestedBy.toString() === userId ||
      adminUserId === business.adminUserId;

      if (!canDelete) {
        throw new ForbiddenException('You can only delete your own supply requests');
      }

      // Can only delete pending or rejected requests
      if (![SupplyRequestStatus.PENDING, SupplyRequestStatus.REJECTED].includes(request.status)) {
        throw new BadRequestException('Can only delete pending or rejected supply requests');
      }

      // Soft delete request
      request.isDeleted = true;
      request.deletedAt = new Date();
      request.deletedBy = userId;

      await request.save();

      // 🎯 AUDIT LOG - Business action
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.SUPPLY_REQUEST_DELETED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.MEDIUM,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            projectName: project.name,
            supplyRequestId: requestId,
            requestDescription: request.description,
            priority: request.priority,
            requesterId: request.requestedBy.toString(),
            // @ts-ignore
            requesterName: `${request.requestedBy.name} ${request.requestedBy.surname || ''}`.trim(),
            deletedBy: userId,
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity
      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId,
        // @ts-ignore
        userName: `${request.requestedBy.name} ${request.requestedBy.surname || ''}`.trim(),
        // @ts-ignore
        userEmail: request.requestedBy.email,
        type: ActivityType.SUPPLY_REQUEST_DELETED,
        action: 'deleted supply request',
        description: `Removed ${request.name || 'supply request'} from project`,
        projectId,
        projectName: project.name,
        resourceType: 'supply_request',
        resourceId: requestId,
        resourceName: request.name || 'Supply Request',
        data: {
          supplyRequestId: requestId,
          requestDescription: request.description,
          priority: request.priority,
          projectName: project.name
        }
      });

      this.logger.log(`Supply request ${requestId} deleted for project ${projectId} by user ${userId}`);
      
      return {
        success: true,
        message: 'Supply request deleted successfully'
      };

    } catch (error) {
      this.logger.error(`Error deleting supply request ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Get project by ID (helper method for validation)
   */
  async getProjectById(projectId: string): Promise<any> {
    try {
      return await this.appProjectModel.findById(projectId).exec();
    } catch (error) {
      this.logger.error(`Error finding project ${projectId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get supply request statistics for a project
   */
  async getProjectSupplyRequestStats(
    projectId: string,
    adminUserId?: string,
    req?: any
  ): Promise<{
    totalRequests: number;
    pendingRequests: number;
    approvedRequests: number;
    deliveredRequests: number;
    overdueRequests: number;
    totalEstimatedCost: number;
    totalApprovedCost: number;
    totalActualCost: number;
    costSavings: number;
    requestsByPriority: Record<string, number>;
    requestsByStatus: Record<string, number>;
    topRequestedEquipment: Array<{
      equipmentName: string;
      totalRequested: number;
      totalDelivered: number;
    }>;
    lastRequestAt: Date;
    averageApprovalTime: number;
    averageDeliveryTime: number;
  }> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');

    try {
      // Validate project
      const project = await this.appProjectModel.findById(projectId);
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      // Get basic statistics
      const [basicStats] = await this.supplyRequestModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false
          }
        },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: 1 },
            pendingRequests: {
              $sum: { $cond: [{ $eq: ['$status', SupplyRequestStatus.PENDING] }, 1, 0] }
            },
            approvedRequests: {
              $sum: { $cond: [{ $eq: ['$status', SupplyRequestStatus.APPROVED] }, 1, 0] }
            },
            deliveredRequests: {
              $sum: { $cond: [{ $eq: ['$status', SupplyRequestStatus.DELIVERED] }, 1, 0] }
            },
            totalEstimatedCost: { $sum: '$totalEstimatedCost' },
            totalApprovedCost: { $sum: '$totalApprovedCost' },
            totalActualCost: { $sum: '$actualCost' },
            lastRequestAt: { $max: '$createdAt' }
          }
        }
      ]);

      // Count overdue requests
      const overdueCount = await this.supplyRequestModel.countDocuments({
        appProjectId: projectId,
        isDeleted: false,
        requiredDate: { $lt: new Date() },
        status: { $nin: [SupplyRequestStatus.DELIVERED, SupplyRequestStatus.CANCELLED] }
      });

      // Get requests by priority
      const priorityCounts = await this.supplyRequestModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false
          }
        },
        {
          $group: {
            _id: '$priority',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get requests by status
      const statusCounts = await this.supplyRequestModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get top requested equipment
      const topEquipment = await this.supplyRequestModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false
          }
        },
        {
          $unwind: '$requestedItems'
        },
        {
          $group: {
            _id: '$requestedItems.equipmentName',
            totalRequested: { $sum: '$requestedItems.quantityRequested' },
            totalDelivered: { $sum: '$requestedItems.quantityDelivered' }
          }
        },
        {
          $sort: { totalRequested: -1 }
        },
        {
          $limit: 10
        },
        {
          $project: {
            equipmentName: '$_id',
            totalRequested: 1,
            totalDelivered: 1,
            _id: 0
          }
        }
      ]);

      // Calculate average approval and delivery times
      const timingStats = await this.supplyRequestModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false,
            approvedAt: { $exists: true }
          }
        },
        {
          $project: {
            approvalTime: {
              $divide: [
                { $subtract: ['$approvedAt', '$createdAt'] },
                1000 * 60 * 60 * 24 // Convert to days
              ]
            },
            deliveryTime: {
              $cond: {
                if: { $and: ['$deliveredAt', '$approvedAt'] },
                then: {
                  $divide: [
                    { $subtract: ['$deliveredAt', '$approvedAt'] },
                    1000 * 60 * 60 * 24 // Convert to days
                  ]
                },
                else: null
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            averageApprovalTime: { $avg: '$approvalTime' },
            averageDeliveryTime: { $avg: '$deliveryTime' }
          }
        }
      ]);

      // Format results
      const requestsByPriority = priorityCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {});

      const requestsByStatus = statusCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {});

      const costSavings = (basicStats?.totalEstimatedCost || 0) - (basicStats?.totalActualCost || 0);

      // 🎯 AUDIT LOG - Business viewing stats
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.SUPPLY_REQUEST_STATS_VIEWED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.LOW,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            projectName: project.name,
            totalRequests: basicStats?.totalRequests || 0,
            totalEstimatedCost: basicStats?.totalEstimatedCost || 0,
            totalApprovedCost: basicStats?.totalApprovedCost || 0
          }
        });
      }

      return {
        totalRequests: basicStats?.totalRequests || 0,
        pendingRequests: basicStats?.pendingRequests || 0,
        approvedRequests: basicStats?.approvedRequests || 0,
        deliveredRequests: basicStats?.deliveredRequests || 0,
        overdueRequests: overdueCount,
        totalEstimatedCost: basicStats?.totalEstimatedCost || 0,
        totalApprovedCost: basicStats?.totalApprovedCost || 0,
        totalActualCost: basicStats?.totalActualCost || 0,
        costSavings,
        requestsByPriority,
        requestsByStatus,
        topRequestedEquipment: topEquipment,
        lastRequestAt: basicStats?.lastRequestAt || null,
        averageApprovalTime: Math.round((timingStats[0]?.averageApprovalTime || 0) * 10) / 10,
        averageDeliveryTime: Math.round((timingStats[0]?.averageDeliveryTime || 0) * 10) / 10
      };

    } catch (error) {
      this.logger.error(`Error getting supply request stats for project ${projectId}:`, error);
      throw error;
    }
  }

  // HELPER METHODS

  /**
   * Validate project access and get context
   */
  private async validateSupplyRequestAccess(projectId: string, userId: string) {
    const project = await this.appProjectModel.findById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const business = await this.businessModel.findById(project.businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const requester = await this.userModel.findById(userId);
    if (!requester) {
      throw new NotFoundException('User not found');
    }

    // Check if user is assigned to project or is business admin
    const isAssigned = project.assignedUsers.includes(userId);
    const isBusinessAdmin = business.adminUserId === userId;

    if (!isAssigned && !isBusinessAdmin) {
      throw new ForbiddenException('You are not assigned to this project');
    }

    return { project, business, requester };
  }

  /**
   * Validate equipment items and enrich with cached data
   */
  private async validateAndEnrichEquipmentItems(requestedItems: any[], businessId: string) {
    const enrichedItems = [];

    for (const item of requestedItems) {
      // Find equipment and validate it belongs to business
      const equipment = await this.equipmentModel.findOne({
        _id: item.equipmentId,
        businessId,
        isActive: true,
        isDeleted: false
      });

      if (!equipment) {
        throw new BadRequestException(`Equipment with ID ${item.equipmentId} not found or not available`);
      }

      // Calculate estimated total cost
      const estimatedUnitCost = item.estimatedUnitCost || equipment.unitCost || 0;
      const estimatedTotalCost = estimatedUnitCost * item.quantityRequested;

      enrichedItems.push({
        equipmentId: item.equipmentId,
        equipmentName: equipment.name,
        equipmentCategory: equipment.category,
        quantityRequested: item.quantityRequested,
        unitOfMeasure: equipment.unitOfMeasure,
        estimatedUnitCost,
        estimatedTotalCost,
        notes: item.notes,
        quantityApproved: 0,
        quantityDelivered: 0
      });
    }

    return enrichedItems;
  }

  /**
   * Transform supply request to response DTO
   */
  private transformSupplyRequestToResponse(request: any, requester: any, approver?: any): SupplyRequestResponseDto {
    return {
      id: request._id.toString(),
      appProjectId: request.appProjectId,
      requester: {
        id: requester._id?.toString() || requester.toString(),
        name: requester.name ? `${requester.name} ${requester.surname || ''}`.trim() : 'Unknown User',
        email: requester.email || ''
      },
      description: request.description,
      name: request.name,
      requestedDate: request.requestedDate,
      requiredDate: request.requiredDate,
      status: request.status,
      priority: request.priority,
      requestedItems: request.requestedItems,
      totalEstimatedCost: request.totalEstimatedCost,
      approver: approver ? {
        id: approver._id?.toString() || approver.toString(),
        name: approver.name ? `${approver.name} ${approver.surname || ''}`.trim() : 'Unknown User',
        email: approver.email || ''
      } : undefined,
      approvedAt: request.approvedAt,
      approvalNotes: request.approvalNotes,
      rejectionReason: request.rejectionReason,
      expectedDeliveryDate: request.expectedDeliveryDate,
      deliveredAt: request.deliveredAt,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      isOverdue: request.requiredDate && request.requiredDate < new Date() && 
                 ![SupplyRequestStatus.DELIVERED, SupplyRequestStatus.CANCELLED].includes(request.status),
      completionPercentage: this.calculateCompletionPercentage(request.requestedItems),
      metadata: request.metadata
    };
  }

  /**
   * Calculate completion percentage based on delivered quantities
   */
  private calculateCompletionPercentage(requestedItems: any[]): number {
    if (!requestedItems || requestedItems.length === 0) return 0;
    
    const totalRequested = requestedItems.reduce((sum, item) => sum + item.quantityRequested, 0);
    const totalDelivered = requestedItems.reduce((sum, item) => sum + (item.quantityDelivered || 0), 0);
    
    return totalRequested > 0 ? Math.round((totalDelivered / totalRequested) * 100) : 0;
  }

  /**
   * Extract IP address from request
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
   * Determine if error should be audit logged
   */
  private shouldLogError(error: any): boolean {
    const validationErrors = ['BadRequestException', 'ValidationError', 'NotFoundException', 'ForbiddenException'];
    return !validationErrors.includes(error.name);
  }

  /**
   * Categorize error for audit logging
   */
  private categorizeError(error: any): string {
    if (error.name === 'NotFoundException') return 'resource_not_found';
    if (error.name === 'BadRequestException') return 'validation_error';
    if (error.name === 'ForbiddenException') return 'access_denied';
    if (error.name === 'UnauthorizedException') return 'authentication_failed';
    return 'unexpected_error';
  }
}