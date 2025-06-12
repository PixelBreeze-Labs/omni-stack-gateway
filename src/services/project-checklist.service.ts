// src/services/project-checklist.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { 
  ProjectChecklist, 
  ProjectChecklistItem, 
  ChecklistStatus, 
  ChecklistItemStatus,
  ChecklistType,
  ChecklistPriority,
  ChecklistItemPriority
} from '../schemas/project-checklist.schema';
import { AppProject } from '../schemas/app-project.schema';
import { Business } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import { AuditLogService } from './audit-log.service';
import { AppActivityService } from './app-activity.service';
import { BusinessStorageService } from './business-storage.service';
import { AuditAction, AuditSeverity, ResourceType } from '../schemas/audit-log.schema';
import { ActivityType } from '../schemas/app-activity.schema';
import {
  CreateProjectChecklistDto,
  UpdateProjectChecklistDto,
  CreateChecklistItemDto,
  UpdateChecklistItemDto,
  CompleteChecklistItemDto,
  ApproveChecklistItemDto,
  BulkUpdateChecklistItemsDto,
  ProjectChecklistResponseDto,
  ProjectChecklistWithItemsResponseDto,
  ChecklistItemResponseDto,
  ProjectChecklistsListResponseDto,
  ChecklistItemsListResponseDto,
  ProjectChecklistStatsResponseDto
} from '../dtos/project-checklist.dto';

interface ChecklistPaginationOptions {
  page?: number;
  limit?: number;
  status?: ChecklistStatus;
  type?: ChecklistType;
  priority?: ChecklistPriority;
  assignedTo?: string;
  overdueOnly?: boolean;
}

interface ChecklistItemPaginationOptions {
  page?: number;
  limit?: number;
  status?: ChecklistItemStatus;
  priority?: ChecklistItemPriority;
  assignedTo?: string;
  overdueOnly?: boolean;
  completedOnly?: boolean;
}

@Injectable()
export class ProjectChecklistService {
  private readonly logger = new Logger(ProjectChecklistService.name);

  constructor(
    @InjectModel(ProjectChecklist.name) private checklistModel: Model<ProjectChecklist>,
    @InjectModel(ProjectChecklistItem.name) private checklistItemModel: Model<ProjectChecklistItem>,
    @InjectModel(AppProject.name) private appProjectModel: Model<AppProject>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly auditLogService: AuditLogService,
    private readonly appActivityService: AppActivityService,
    private readonly businessStorageService: BusinessStorageService
  ) {}

  /**
   * Create a new checklist
   */
  async createChecklist(
    projectId: string,
    createChecklistDto: CreateProjectChecklistDto,
    creatorId: string,
    adminUserId?: string,
    req?: any
  ): Promise<ProjectChecklistResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Validate project and get business context
      const { project, business, creator } = await this.validateChecklistAccess(projectId, creatorId);

      // Validate assigned users exist and belong to business
      if (createChecklistDto.assignedUsers && createChecklistDto.assignedUsers.length > 0) {
        await this.validateUsersExist(createChecklistDto.assignedUsers, business._id.toString());
      }

      // Validate assigned teams exist in business
      if (createChecklistDto.assignedTeams && createChecklistDto.assignedTeams.length > 0) {
        await this.validateTeamsExist(createChecklistDto.assignedTeams, business);
      }

      // Create checklist
      const checklist = new this.checklistModel({
        businessId: project.businessId,
        appProjectId: projectId,
        createdBy: creatorId,
        name: createChecklistDto.name,
        description: createChecklistDto.description,
        type: createChecklistDto.type || ChecklistType.CUSTOM,
        priority: createChecklistDto.priority || ChecklistPriority.MEDIUM,
        dueDate: createChecklistDto.dueDate,
        startDate: createChecklistDto.startDate,
        assignedUsers: createChecklistDto.assignedUsers || [],
        assignedTeams: createChecklistDto.assignedTeams || [],
        templateId: createChecklistDto.templateId,
        metadata: {
          ...createChecklistDto.metadata,
          createdByName: `${creator.name} ${creator.surname || ''}`.trim(),
          createdByEmail: creator.email,
          projectName: project.name
        }
      });

      // Create user assignments with details
      if (createChecklistDto.assignedUsers) {
        checklist.userAssignments = createChecklistDto.assignedUsers.map(userId => ({
          userId,
          assignedAt: new Date(),
          assignedBy: creatorId,
          isActive: true,
          metadata: {}
        }));
      }

      // Create team assignments with details
      if (createChecklistDto.assignedTeams) {
        checklist.teamAssignments = createChecklistDto.assignedTeams.map(teamId => {
          const team = business.teams.find(t => t.id === teamId);
          return {
            teamId,
            teamName: team?.name || 'Unknown Team',
            assignedAt: new Date(),
            assignedBy: creatorId,
            isActive: true,
            metadata: {}
          };
        });
      }

      await checklist.save();

      // 🎯 AUDIT LOG - Business action
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_CHECKLIST_CREATED,
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
            checklistId: checklist._id.toString(),
            checklistName: createChecklistDto.name,
            checklistType: createChecklistDto.type,
            priority: createChecklistDto.priority,
            creatorId,
            creatorName: `${creator.name} ${creator.surname || ''}`.trim(),
            assignedUsers: createChecklistDto.assignedUsers?.length || 0,
            assignedTeams: createChecklistDto.assignedTeams?.length || 0,
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity
      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId: creatorId,
        userName: `${creator.name} ${creator.surname || ''}`.trim(),
        userEmail: creator.email,
        type: ActivityType.PROJECT_CHECKLIST_CREATED,
        action: 'created a checklist for project',
        description: `Created "${createChecklistDto.name}" checklist`,
        projectId,
        projectName: project.name,
        resourceType: 'project_checklist',
        resourceId: checklist._id.toString(),
        resourceName: createChecklistDto.name,
        data: {
          checklistId: checklist._id.toString(),
          checklistName: createChecklistDto.name,
          checklistType: createChecklistDto.type,
          assignedUsers: createChecklistDto.assignedUsers?.length || 0,
          assignedTeams: createChecklistDto.assignedTeams?.length || 0,
          projectName: project.name
        }
      });

      this.logger.log(`Checklist created for project ${projectId} by user ${creatorId}`);
      return this.transformChecklistToResponse(checklist, creator);

    } catch (error) {
      // 🎯 AUDIT LOG - Error for business actions only
      if (adminUserId && this.shouldLogError(error)) {
        await this.auditLogService.createAuditLog({
          businessId: projectId, // fallback
          userId: adminUserId,
          action: AuditAction.PROJECT_CHECKLIST_CREATED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Checklist creation`,
          success: false,
          errorMessage: 'Error creating checklist',
          severity: AuditSeverity.HIGH,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            creatorId,
            checklistName: createChecklistDto.name,
            errorReason: this.categorizeError(error),
            errorName: error.name,
            errorMessage: error.message,
            operationDuration: Date.now() - startTime
          }
        });
      }

      this.logger.error(`Error creating checklist for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Get checklists for a project with pagination
   */
  async getProjectChecklists(
    projectId: string,
    options: ChecklistPaginationOptions = {},
    adminUserId?: string,
    req?: any
  ): Promise<ProjectChecklistsListResponseDto> {
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

      if (options.type) {
        query.type = options.type;
      }

      if (options.priority) {
        query.priority = options.priority;
      }

      if (options.assignedTo) {
        query.assignedUsers = options.assignedTo;
      }

      if (options.overdueOnly) {
        query.dueDate = { $lt: new Date() };
        query.status = { $ne: ChecklistStatus.COMPLETED };
      }

      // Get checklists with creator information
      const checklists = await this.checklistModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'name surname email')
        .exec();

      // Get total count
      const total = await this.checklistModel.countDocuments(query);

      // Get summary statistics
      const [summary] = await this.checklistModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false
          }
        },
        {
          $group: {
            _id: null,
            totalChecklists: { $sum: 1 },
            activeChecklists: {
              $sum: { $cond: [{ $eq: ['$status', ChecklistStatus.ACTIVE] }, 1, 0] }
            },
            completedChecklists: {
              $sum: { $cond: [{ $eq: ['$status', ChecklistStatus.COMPLETED] }, 1, 0] }
            },
            totalItems: { $sum: '$totalItems' },
            completedItems: { $sum: '$completedItems' },
            lastActivityAt: { $max: '$updatedAt' }
          }
        }
      ]);

      // Count overdue checklists
      const overdueCount = await this.checklistModel.countDocuments({
        appProjectId: projectId,
        isDeleted: false,
        dueDate: { $lt: new Date() },
        status: { $ne: ChecklistStatus.COMPLETED }
      });

      // Transform checklists to response format
      const transformedChecklists = checklists.map(checklist => 
        this.transformChecklistToResponse(checklist, checklist.createdBy)
      );

      // Calculate overall completion percentage
      const overallCompletionPercentage = summary?.totalItems > 0 
        ? Math.round((summary.completedItems / summary.totalItems) * 100) 
        : 0;

      // 🎯 AUDIT LOG - Business viewing checklists
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_CHECKLISTS_VIEWED,
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
            totalChecklists: total,
            checklistsReturned: checklists.length,
            filters: {
              status: options.status,
              type: options.type,
              priority: options.priority,
              assignedTo: options.assignedTo,
              overdueOnly: options.overdueOnly
            }
          }
        });
      }

      const totalPages = Math.ceil(total / limit);

      return {
        checklists: transformedChecklists,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        },
        summary: {
          totalChecklists: summary?.totalChecklists || 0,
          activeChecklists: summary?.activeChecklists || 0,
          completedChecklists: summary?.completedChecklists || 0,
          overdueChecklists: overdueCount,
          totalItems: summary?.totalItems || 0,
          completedItems: summary?.completedItems || 0,
          overallCompletionPercentage,
          lastActivityAt: summary?.lastActivityAt || null
        }
      };

    } catch (error) {
      this.logger.error(`Error getting checklists for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Get single checklist with items
   */
  async getChecklistWithItems(
    projectId: string,
    checklistId: string,
    adminUserId?: string,
    req?: any
  ): Promise<ProjectChecklistWithItemsResponseDto> {
    try {
      // Get checklist
      const checklist = await this.checklistModel.findOne({
        _id: checklistId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('createdBy', 'name surname email');

      if (!checklist) {
        throw new NotFoundException('Checklist not found');
      }

      // Get checklist items
      const items = await this.checklistItemModel
        .find({
          checklistId,
          isDeleted: false
        })
        .sort({ sortOrder: 1, createdAt: 1 })
        .populate('assignedTo', 'name surname email')
        .populate('completedBy', 'name surname email')
        .populate('approvedBy', 'name surname email')
        .exec();

      // Transform to response format
      const checklistResponse = this.transformChecklistToResponse(checklist, checklist.createdBy);
      const itemsResponse = items.map(item => this.transformChecklistItemToResponse(item));

      return {
        ...checklistResponse,
        items: itemsResponse
      };

    } catch (error) {
      this.logger.error(`Error getting checklist ${checklistId} with items:`, error);
      throw error;
    }
  }

  /**
   * Add item to checklist
   */
  async addChecklistItem(
    projectId: string,
    checklistId: string,
    createItemDto: CreateChecklistItemDto,
    creatorId: string,
    adminUserId?: string,
    req?: any
  ): Promise<ChecklistItemResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Validate checklist exists and belongs to project
      const checklist = await this.checklistModel.findOne({
        _id: checklistId,
        appProjectId: projectId,
        isDeleted: false
      });

      if (!checklist) {
        throw new NotFoundException('Checklist not found');
      }

      const project = await this.appProjectModel.findById(projectId);
      const creator = await this.userModel.findById(creatorId);

      // Validate assigned user exists if provided
      if (createItemDto.assignedTo) {
        const assignedUser = await this.userModel.findById(createItemDto.assignedTo);
        if (!assignedUser) {
          throw new BadRequestException('Assigned user not found');
        }
      }

      // Validate dependencies exist if provided
      if (createItemDto.dependencies && createItemDto.dependencies.length > 0) {
        const dependencyCount = await this.checklistItemModel.countDocuments({
          _id: { $in: createItemDto.dependencies },
          checklistId,
          isDeleted: false
        });

        if (dependencyCount !== createItemDto.dependencies.length) {
          throw new BadRequestException('One or more dependency items not found');
        }
      }

      // Get next sort order if not provided
      let sortOrder = createItemDto.sortOrder || 0;
      if (sortOrder === 0) {
        const lastItem = await this.checklistItemModel.findOne({
          checklistId,
          isDeleted: false
        }).sort({ sortOrder: -1 });
        sortOrder = (lastItem?.sortOrder || 0) + 1;
      }

      // Create checklist item
      const item = new this.checklistItemModel({
        businessId: checklist.businessId,
        appProjectId: projectId,
        checklistId,
        name: createItemDto.name,
        description: createItemDto.description,
        notes: createItemDto.notes,
        priority: createItemDto.priority || ChecklistItemPriority.MEDIUM,
        assignedTo: createItemDto.assignedTo,
        assignedAt: createItemDto.assignedTo ? new Date() : undefined,
        assignedBy: createItemDto.assignedTo ? creatorId : undefined,
        dueDate: createItemDto.dueDate,
        sortOrder,
        estimatedMinutes: createItemDto.estimatedMinutes,
        dependencies: createItemDto.dependencies || [],
        requiresApproval: createItemDto.requiresApproval || false,
        metadata: {
          ...createItemDto.metadata,
          checklistName: checklist.name,
          projectName: project.name,
          assignedToName: createItemDto.assignedTo ? 'Loading...' : undefined // Will be populated later
        }
      });

      await item.save();

      // Update checklist total items count
      await this.updateChecklistProgress(checklistId);

      // 🎯 AUDIT LOG - Business action
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: checklist.businessId,
          userId: adminUserId,
          action: AuditAction.CHECKLIST_ITEM_CREATED,
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
            checklistId,
            checklistName: checklist.name,
            itemId: item._id.toString(),
            itemName: createItemDto.name,
            assignedTo: createItemDto.assignedTo,
            priority: createItemDto.priority,
            estimatedMinutes: createItemDto.estimatedMinutes,
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity
      await this.appActivityService.createActivity({
        businessId: checklist.businessId,
        userId: creatorId,
        userName: `${creator.name} ${creator.surname || ''}`.trim(),
        userEmail: creator.email,
        type: ActivityType.CHECKLIST_ITEM_CREATED,
        action: 'added an item to checklist',
        description: `Added "${createItemDto.name}" to ${checklist.name}`,
        projectId,
        projectName: project.name,
        resourceType: 'checklist_item',
        resourceId: item._id.toString(),
        resourceName: createItemDto.name,
        data: {
          checklistId,
          checklistName: checklist.name,
          itemId: item._id.toString(),
          itemName: createItemDto.name,
          assignedTo: createItemDto.assignedTo,
          projectName: project.name
        }
      });

      this.logger.log(`Checklist item added to checklist ${checklistId} by user ${creatorId}`);

      // Populate and return response
      await item.populate('assignedTo', 'name surname email');
      return this.transformChecklistItemToResponse(item);

    } catch (error) {
      this.logger.error(`Error adding item to checklist ${checklistId}:`, error);
      throw error;
    }
  }

  /**
   * Complete checklist item
   */
  async completeChecklistItem(
    projectId: string,
    checklistId: string,
    itemId: string,
    completeDto: CompleteChecklistItemDto,
    userId: string,
    adminUserId?: string,
    req?: any
  ): Promise<ChecklistItemResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Find item
      const item = await this.checklistItemModel.findOne({
        _id: itemId,
        checklistId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('assignedTo', 'name surname email');

      if (!item) {
        throw new NotFoundException('Checklist item not found');
      }

      // Check if user can complete (assigned user, business admin, or unassigned item)
      const project = await this.appProjectModel.findById(projectId);
      const business = await this.businessModel.findById(project.businessId);
      const user = await this.userModel.findById(userId);
      
      const canComplete = !item.assignedTo || 
                         item.assignedTo.toString() === userId ||
                         adminUserId === business.adminUserId;

      if (!canComplete) {
        throw new ForbiddenException('You can only complete items assigned to you');
      }

      // Check if item is already completed
      if (item.isCompleted) {
        throw new BadRequestException('Item is already completed');
      }

      // Check dependencies are met
      if (item.dependencies.length > 0) {
        const completedDependencies = await this.checklistItemModel.countDocuments({
          _id: { $in: item.dependencies },
          isCompleted: true,
          isDeleted: false
        });

        if (completedDependencies !== item.dependencies.length) {
          throw new BadRequestException('Cannot complete item: dependencies not met');
        }
      }

      // Complete the item
      item.isCompleted = true;
      item.status = ChecklistItemStatus.COMPLETED;
      item.completedBy = userId;
      item.completedAt = new Date();
      item.completionNotes = completeDto.completionNotes;
      item.actualMinutes = completeDto.actualMinutes;

      if (item.timeStarted && !item.timeEnded) {
        item.timeEnded = new Date();
        // Calculate actual minutes if not provided
        if (!completeDto.actualMinutes) {
          const diffMs = item.timeEnded.getTime() - item.timeStarted.getTime();
          item.actualMinutes = Math.round(diffMs / (1000 * 60));
        }
      }

      await item.save();

      // Update checklist progress
      await this.updateChecklistProgress(checklistId);

      // 🎯 AUDIT LOG - Business action
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.CHECKLIST_ITEM_COMPLETED,
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
            checklistId,
            itemId,
            itemName: item.name,
            completedBy: userId,
            completedByName: `${user.name} ${user.surname || ''}`.trim(),
            actualMinutes: completeDto.actualMinutes,
            completionNotes: completeDto.completionNotes,
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity
      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId,
        userName: `${user.name} ${user.surname || ''}`.trim(),
        userEmail: user.email,
        type: ActivityType.CHECKLIST_ITEM_COMPLETED,
        action: 'completed a checklist item',
        description: `Completed "${item.name}"`,
        projectId,
        projectName: project.name,
        resourceType: 'checklist_item',
        resourceId: itemId,
        resourceName: item.name,
        data: {
          checklistId,
          itemId,
          itemName: item.name,
          actualMinutes: completeDto.actualMinutes,
          projectName: project.name
        }
      });

      this.logger.log(`Checklist item ${itemId} completed by user ${userId}`);

      // Populate and return response
      await item.populate('completedBy', 'name surname email');
      return this.transformChecklistItemToResponse(item);

    } catch (error) {
      this.logger.error(`Error completing checklist item ${itemId}:`, error);
      throw error;
    }
  }

  /**
   * Get project checklist statistics
   */
  async getProjectChecklistStats(
    projectId: string,
    adminUserId?: string,
    req?: any
  ): Promise<ProjectChecklistStatsResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');

    try {
      // Validate project
      const project = await this.appProjectModel.findById(projectId);
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      // Get checklist statistics
      const [checklistStats] = await this.checklistModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false
          }
        },
        {
          $group: {
            _id: null,
            totalChecklists: { $sum: 1 },
            activeChecklists: {
              $sum: { $cond: [{ $eq: ['$status', ChecklistStatus.ACTIVE] }, 1, 0] }
            },
            completedChecklists: {
              $sum: { $cond: [{ $eq: ['$status', ChecklistStatus.COMPLETED] }, 1, 0] }
            },
            totalItems: { $sum: '$totalItems' },
            completedItems: { $sum: '$completedItems' }
          }
        }
      ]);

      // Get overdue checklists
      const overdueChecklists = await this.checklistModel.countDocuments({
        appProjectId: projectId,
        isDeleted: false,
        dueDate: { $lt: new Date() },
        status: { $ne: ChecklistStatus.COMPLETED }
      });

      // Get item statistics
      const [itemStats] = await this.checklistItemModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false
          }
        },
        {
          $group: {
            _id: null,
            totalItems: { $sum: 1 },
            completedItems: {
              $sum: { $cond: ['$isCompleted', 1, 0] }
            },
            pendingItems: {
              $sum: { $cond: [{ $eq: ['$status', ChecklistItemStatus.PENDING] }, 1, 0] }
            },
            lastActivityAt: { $max: '$completedAt' },
            totalMinutes: { $sum: '$actualMinutes' },
            itemsWithTime: {
              $sum: { $cond: [{ $gt: ['$actualMinutes', 0] }, 1, 0] }
            }
          }
        }
      ]);

      // Get overdue items
      const overdueItems = await this.checklistItemModel.countDocuments({
        appProjectId: projectId,
        isDeleted: false,
        dueDate: { $lt: new Date() },
        isCompleted: false
      });

      // Get checklists by type
      const checklistsByType = await this.checklistModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false
          }
        },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get items by status
      const itemsByStatus = await this.checklistItemModel.aggregate([
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

      // Get top performers
      const topPerformers = await this.checklistItemModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false,
            isCompleted: true,
            completedBy: { $exists: true }
          }
        },
        {
          $group: {
            _id: '$completedBy',
            completedItems: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $unwind: '$user'
        },
        {
          $project: {
            userId: '$_id',
            userName: {
              $concat: ['$user.name', ' ', { $ifNull: ['$user.surname', ''] }]
            },
            completedItems: 1
          }
        },
        {
          $sort: { completedItems: -1 }
        },
        {
          $limit: 10
        }
      ]);

      // Calculate completion rates for top performers
      const performersWithRates = await Promise.all(
        topPerformers.map(async (performer) => {
          const totalAssigned = await this.checklistItemModel.countDocuments({
            appProjectId: projectId,
            assignedTo: performer.userId,
            isDeleted: false
          });
          
          return {
            userId: performer.userId.toString(),
            userName: performer.userName.trim(),
            completedItems: performer.completedItems,
            completionRate: totalAssigned > 0 ? Math.round((performer.completedItems / totalAssigned) * 100) : 0
          };
        })
      );

      // Get completion trend (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const completionTrend = await this.checklistItemModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false,
            completedAt: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$completedAt' }
            },
            itemsCompleted: { $sum: 1 }
          }
        },
        {
          $sort: { '_id': 1 }
        },
        {
          $project: {
            date: '$_id',
            itemsCompleted: 1,
            checklistsCompleted: 0, // Could be calculated if needed
            _id: 0
          }
        }
      ]);

      // Calculate overall completion percentage
      const overallCompletionPercentage = itemStats?.totalItems > 0 
        ? Math.round((itemStats.completedItems / itemStats.totalItems) * 100) 
        : 0;

      // Calculate average completion time
      const averageCompletionTime = itemStats?.itemsWithTime > 0
        ? Math.round((itemStats.totalMinutes / itemStats.itemsWithTime) * 10) / 10
        : 0;

      // Format results
      const checklistsByTypeFormatted = checklistsByType.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {});

      const itemsByStatusFormatted = itemsByStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {});

      // 🎯 AUDIT LOG - Business viewing stats
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_CHECKLIST_STATS_VIEWED,
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
            totalChecklists: checklistStats?.totalChecklists || 0,
            totalItems: itemStats?.totalItems || 0,
            overallCompletionPercentage
          }
        });
      }

      return {
        totalChecklists: checklistStats?.totalChecklists || 0,
        activeChecklists: checklistStats?.activeChecklists || 0,
        completedChecklists: checklistStats?.completedChecklists || 0,
        overdueChecklists,
        totalItems: itemStats?.totalItems || 0,
        completedItems: itemStats?.completedItems || 0,
        pendingItems: itemStats?.pendingItems || 0,
        overdueItems,
        overallCompletionPercentage,
        checklistsByType: checklistsByTypeFormatted,
        itemsByStatus: itemsByStatusFormatted,
        topPerformers: performersWithRates,
        completionTrend,
        averageCompletionTime,
        lastActivityAt: itemStats?.lastActivityAt || null
      };

    } catch (error) {
      this.logger.error(`Error getting checklist stats for project ${projectId}:`, error);
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

  // HELPER METHODS

  /**
   * Update checklist progress based on completed items
   */
  private async updateChecklistProgress(checklistId: string): Promise<void> {
    try {
      const itemStats = await this.checklistItemModel.aggregate([
        {
          $match: {
            checklistId,
            isDeleted: false
          }
        },
        {
          $group: {
            _id: null,
            totalItems: { $sum: 1 },
            completedItems: {
              $sum: { $cond: ['$isCompleted', 1, 0] }
            }
          }
        }
      ]);

      const stats = itemStats[0] || { totalItems: 0, completedItems: 0 };
      const completionPercentage = stats.totalItems > 0 
        ? Math.round((stats.completedItems / stats.totalItems) * 100) 
        : 0;

      const updateData: any = {
        totalItems: stats.totalItems,
        completedItems: stats.completedItems,
        completionPercentage
      };

      // If fully completed, update status and completion date
      if (completionPercentage >= 100) {
        updateData.status = ChecklistStatus.COMPLETED;
        updateData.completedAt = new Date();
      } else if (completionPercentage > 0) {
        // If in progress, ensure status is active
        updateData.status = ChecklistStatus.ACTIVE;
        updateData.completedAt = null;
      }

      await this.checklistModel.findByIdAndUpdate(checklistId, updateData);

    } catch (error) {
      this.logger.error(`Error updating checklist progress for ${checklistId}:`, error);
    }
  }

  /**
   * Validate project access and get context
   */
  private async validateChecklistAccess(projectId: string, userId: string) {
    const project = await this.appProjectModel.findById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const business = await this.businessModel.findById(project.businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const creator = await this.userModel.findById(userId);
    if (!creator) {
      throw new NotFoundException('User not found');
    }

    // Check if user is assigned to project or is business admin
    const isAssigned = project.assignedUsers.includes(userId);
    const isBusinessAdmin = business.adminUserId === userId;

    if (!isAssigned && !isBusinessAdmin) {
      throw new ForbiddenException('You are not assigned to this project');
    }

    return { project, business, creator };
  }

  /**
   * Validate users exist and belong to business
   */
  private async validateUsersExist(userIds: string[], businessId: string): Promise<void> {
    const userCount = await this.userModel.countDocuments({
      _id: { $in: userIds }
    });

    if (userCount !== userIds.length) {
      throw new BadRequestException('One or more assigned users not found');
    }
  }

  /**
   * Validate teams exist in business
   */
  private async validateTeamsExist(teamIds: string[], business: any): Promise<void> {
    const businessTeamIds = business.teams.map(team => team.id);
    const invalidTeams = teamIds.filter(teamId => !businessTeamIds.includes(teamId));

    if (invalidTeams.length > 0) {
      throw new BadRequestException(`Teams not found: ${invalidTeams.join(', ')}`);
    }
  }

  /**
   * Transform checklist to response DTO
   */
  private transformChecklistToResponse(checklist: any, creator: any): ProjectChecklistResponseDto {
    return {
      id: checklist._id.toString(),
      appProjectId: checklist.appProjectId,
      createdBy: {
        id: creator._id?.toString() || creator.toString(),
        name: creator.name ? `${creator.name} ${creator.surname || ''}`.trim() : 'Unknown User',
        email: creator.email || ''
      },
      name: checklist.name,
      description: checklist.description,
      type: checklist.type,
      status: checklist.status,
      priority: checklist.priority,
      totalItems: checklist.totalItems,
      completedItems: checklist.completedItems,
      completionPercentage: checklist.completionPercentage,
      dueDate: checklist.dueDate,
      startDate: checklist.startDate,
      completedAt: checklist.completedAt,
      assignedUsers: checklist.assignedUsers,
      assignedTeams: checklist.assignedTeams,
      userAssignments: checklist.userAssignments?.map(ua => ({
        userId: ua.userId.toString(),
        userName: 'User', // Could be populated if needed
        role: ua.role,
        assignedAt: ua.assignedAt,
        isActive: ua.isActive
      })) || [],
      teamAssignments: checklist.teamAssignments?.map(ta => ({
        teamId: ta.teamId,
        teamName: ta.teamName,
        role: ta.role,
        assignedAt: ta.assignedAt,
        isActive: ta.isActive
      })) || [],
      template: checklist.templateId ? {
        id: checklist.templateId,
        name: checklist.templateName || 'Template'
      } : undefined,
      createdAt: checklist.createdAt,
      updatedAt: checklist.updatedAt,
      isOverdue: checklist.dueDate && checklist.dueDate < new Date() && checklist.status !== ChecklistStatus.COMPLETED,
      isComplete: checklist.status === ChecklistStatus.COMPLETED || checklist.completionPercentage >= 100,
      metadata: checklist.metadata
    };
  }

  /**
   * Transform checklist item to response DTO
   */
  private transformChecklistItemToResponse(item: any): ChecklistItemResponseDto {
    return {
      id: item._id.toString(),
      checklistId: item.checklistId.toString(),
      appProjectId: item.appProjectId,
      name: item.name,
      description: item.description,
      notes: item.notes,
      status: item.status,
      priority: item.priority,
      isCompleted: item.isCompleted,
      assignedTo: item.assignedTo ? {
        id: item.assignedTo._id?.toString() || item.assignedTo.toString(),
        name: item.assignedTo.name ? `${item.assignedTo.name} ${item.assignedTo.surname || ''}`.trim() : 'Unknown User',
        email: item.assignedTo.email || ''
      } : undefined,
      completedBy: item.completedBy ? {
        id: item.completedBy._id?.toString() || item.completedBy.toString(),
        name: item.completedBy.name ? `${item.completedBy.name} ${item.completedBy.surname || ''}`.trim() : 'Unknown User',
        email: item.completedBy.email || ''
      } : undefined,
      completedAt: item.completedAt,
      completionNotes: item.completionNotes,
      dueDate: item.dueDate,
      sortOrder: item.sortOrder,
      estimatedMinutes: item.estimatedMinutes,
      actualMinutes: item.actualMinutes,
      dependencies: item.dependencies || [],
      requiresApproval: item.requiresApproval,
      approval: item.approvedBy ? {
        approvedBy: {
          id: item.approvedBy._id?.toString() || item.approvedBy.toString(),
          name: item.approvedBy.name ? `${item.approvedBy.name} ${item.approvedBy.surname || ''}`.trim() : 'Unknown User',
          email: item.approvedBy.email || ''
        },
        approvedAt: item.approvedAt,
        approvalNotes: item.approvalNotes
      } : undefined,
      attachments: item.attachments || [],
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      isOverdue: item.dueDate && item.dueDate < new Date() && !item.isCompleted,
      canStart: item.dependencies.length === 0 || item.status !== ChecklistItemStatus.PENDING,
      metadata: item.metadata
    };
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