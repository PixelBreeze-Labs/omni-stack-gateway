// src/services/project-issue.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProjectIssue, IssuePriority, IssueStatus, IssueCategory } from '../schemas/project-issue.schema';
import { AppProject } from '../schemas/app-project.schema';
import { Business } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import { AuditLogService } from './audit-log.service';
import { AppActivityService } from './app-activity.service';
import { BusinessStorageService } from './business-storage.service';
import { AuditAction, AuditSeverity, ResourceType } from '../schemas/audit-log.schema';
import { ActivityType } from '../schemas/app-activity.schema';
import {
  CreateProjectIssueDto,
  UpdateProjectIssueDto,
  ProjectIssueResponseDto,
  ProjectIssuesListResponseDto
} from '../dtos/project-issue.dto';

interface IssuePaginationOptions {
  page?: number;
  limit?: number;
  status?: IssueStatus;
  priority?: IssuePriority;
  category?: IssueCategory;
  assignedTo?: string;
}

@Injectable()
export class ProjectIssueService {
  private readonly logger = new Logger(ProjectIssueService.name);

  constructor(
    @InjectModel(ProjectIssue.name) private projectIssueModel: Model<ProjectIssue>,
    @InjectModel(AppProject.name) private appProjectModel: Model<AppProject>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly auditLogService: AuditLogService,
    private readonly appActivityService: AppActivityService,
    private readonly businessStorageService: BusinessStorageService
  ) {}

  async reportIssue(
    projectId: string,
    createIssueDto: CreateProjectIssueDto,
    reporterId: string,
    adminUserId?: string,
    req?: any
  ): Promise<ProjectIssueResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      const { project, business, reporter } = await this.validateIssueAccess(projectId, reporterId);

      let assignee = null;
      if (createIssueDto.assignedTo) {
        assignee = await this.userModel.findById(createIssueDto.assignedTo);
        if (!assignee) {
          throw new BadRequestException('Assigned user not found');
        }
      }

      const issue = new this.projectIssueModel({
        businessId: project.businessId,
        appProjectId: projectId,
        reportedBy: reporterId,
        assignedTo: createIssueDto.assignedTo,
        title: createIssueDto.title,
        description: createIssueDto.description,
        priority: createIssueDto.priority,
        category: createIssueDto.category,
        location: createIssueDto.location,
        dueDate: createIssueDto.dueDate,
        metadata: {
          ...createIssueDto.metadata,
          reporterName: `${reporter.name} ${reporter.surname || ''}`.trim(),
          reporterEmail: reporter.email,
          projectName: project.name,
          assigneeName: assignee ? `${assignee.name} ${assignee.surname || ''}`.trim() : undefined,
          estimatedCost: createIssueDto.estimatedCost,
          timeImpact: createIssueDto.timeImpact,
          tags: createIssueDto.tags || []
        }
      });

      await issue.save();

      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_ISSUE_REPORTED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: createIssueDto.priority === IssuePriority.CRITICAL ? AuditSeverity.HIGH : AuditSeverity.MEDIUM,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            projectName: project.name,
            issueId: issue._id.toString(),
            issueTitle: createIssueDto.title,
            issuePriority: createIssueDto.priority,
            issueCategory: createIssueDto.category,
            reporterId,
            reporterName: `${reporter.name} ${reporter.surname || ''}`.trim(),
            assignedTo: createIssueDto.assignedTo,
            assigneeName: assignee ? `${assignee.name} ${assignee.surname || ''}`.trim() : undefined,
            operationDuration: Date.now() - startTime
          }
        });
      }

      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId: reporterId,
        userName: `${reporter.name} ${reporter.surname || ''}`.trim(),
        userEmail: reporter.email,
        type: ActivityType.ISSUE_REPORTED,
        action: `reported ${createIssueDto.priority} priority issue`,
        description: `${createIssueDto.title}`,
        projectId,
        projectName: project.name,
        resourceType: 'project_issue',
        resourceId: issue._id.toString(),
        resourceName: createIssueDto.title,
        data: {
          issueId: issue._id.toString(),
          issueTitle: createIssueDto.title,
          issuePriority: createIssueDto.priority,
          issueCategory: createIssueDto.category,
          projectName: project.name,
          assignedTo: createIssueDto.assignedTo
        }
      });

      this.logger.log(`Issue reported for project ${projectId} by user ${reporterId}`);
      return this.transformIssueToResponse(issue, reporter, assignee);

    } catch (error) {
      if (adminUserId && this.shouldLogError(error)) {
        await this.auditLogService.createAuditLog({
          businessId: projectId,
          userId: adminUserId,
          action: AuditAction.PROJECT_ISSUE_REPORTED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Issue reporting`,
          success: false,
          errorMessage: 'Error reporting issue',
          severity: AuditSeverity.HIGH,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            issueTitle: createIssueDto.title,
            issuePriority: createIssueDto.priority,
            reporterId,
            errorReason: this.categorizeError(error),
            errorName: error.name,
            errorMessage: error.message,
            operationDuration: Date.now() - startTime
          }
        });
      }

      this.logger.error(`Error reporting issue for project ${projectId}:`, error);
      throw error;
    }
  }

  async reportIssueWithPhotos(
    projectId: string,
    createIssueDto: CreateProjectIssueDto,
    photos: Express.Multer.File[],
    reporterId: string,
    adminUserId?: string,
    req?: any
  ): Promise<ProjectIssueResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      const { project, business, reporter } = await this.validateIssueAccess(projectId, reporterId);

      if (!photos || photos.length === 0) {
        throw new BadRequestException('At least one photo is required');
      }

      if (photos.length > 5) {
        throw new BadRequestException('Maximum 5 photos allowed per issue');
      }

      for (const photo of photos) {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(photo.mimetype)) {
          throw new BadRequestException('Only image files are allowed (JPEG, PNG, GIF, WebP)');
        }

        const maxSize = 10 * 1024 * 1024;
        if (photo.size > maxSize) {
          throw new BadRequestException('Each photo cannot exceed 10MB');
        }
      }

      const uploadResults = [];
      for (const photo of photos) {
        const uploadResult = await this.businessStorageService.uploadImage(
          business._id.toString(),
          photo.buffer,
          photo.originalname,
          'project-issues',
          adminUserId,
          req
        );

        if (!uploadResult.success) {
          throw new BadRequestException(`Failed to upload photo: ${photo.originalname}`);
        }

        uploadResults.push(uploadResult.file);
      }

      let assignee = null;
      if (createIssueDto.assignedTo) {
        assignee = await this.userModel.findById(createIssueDto.assignedTo);
        if (!assignee) {
          throw new BadRequestException('Assigned user not found');
        }
      }

      const issue = new this.projectIssueModel({
        businessId: project.businessId,
        appProjectId: projectId,
        reportedBy: reporterId,
        assignedTo: createIssueDto.assignedTo,
        title: createIssueDto.title,
        description: createIssueDto.description,
        priority: createIssueDto.priority,
        category: createIssueDto.category,
        location: createIssueDto.location,
        dueDate: createIssueDto.dueDate,
        photoUrls: uploadResults.map(file => file.url),
        photoNames: uploadResults.map(file => file.name),
        photoSizes: uploadResults.map(file => file.size),
        metadata: {
          ...createIssueDto.metadata,
          reporterName: `${reporter.name} ${reporter.surname || ''}`.trim(),
          reporterEmail: reporter.email,
          projectName: project.name,
          assigneeName: assignee ? `${assignee.name} ${assignee.surname || ''}`.trim() : undefined,
          estimatedCost: createIssueDto.estimatedCost,
          timeImpact: createIssueDto.timeImpact,
          tags: createIssueDto.tags || []
        }
      });

      await issue.save();

      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_ISSUE_WITH_PHOTOS_REPORTED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: createIssueDto.priority === IssuePriority.CRITICAL ? AuditSeverity.HIGH : AuditSeverity.MEDIUM,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            projectName: project.name,
            issueId: issue._id.toString(),
            issueTitle: createIssueDto.title,
            issuePriority: createIssueDto.priority,
            issueCategory: createIssueDto.category,
            reporterId,
            reporterName: `${reporter.name} ${reporter.surname || ''}`.trim(),
            assignedTo: createIssueDto.assignedTo,
            assigneeName: assignee ? `${assignee.name} ${assignee.surname || ''}`.trim() : undefined,
            photoCount: uploadResults.length,
            photoNames: uploadResults.map(file => file.name),
            operationDuration: Date.now() - startTime
          }
        });
      }

      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId: reporterId,
        userName: `${reporter.name} ${reporter.surname || ''}`.trim(),
        userEmail: reporter.email,
        type: ActivityType.ISSUE_REPORTED,
        action: `reported ${createIssueDto.priority} priority issue with photos`,
        description: `${createIssueDto.title}`,
        projectId,
        projectName: project.name,
        resourceType: 'project_issue',
        resourceId: issue._id.toString(),
        resourceName: createIssueDto.title,
        data: {
          issueId: issue._id.toString(),
          issueTitle: createIssueDto.title,
          issuePriority: createIssueDto.priority,
          issueCategory: createIssueDto.category,
          photoCount: uploadResults.length,
          projectName: project.name,
          assignedTo: createIssueDto.assignedTo
        }
      });

      this.logger.log(`Issue with photos reported for project ${projectId} by user ${reporterId}`);
      return this.transformIssueToResponse(issue, reporter, assignee);

    } catch (error) {
      this.logger.error(`Error reporting issue with photos for project ${projectId}:`, error);
      throw error;
    }
  }

  async getProjectIssues(
    projectId: string,
    options: IssuePaginationOptions = {},
    adminUserId?: string,
    req?: any
  ): Promise<ProjectIssuesListResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');

    try {
      const project = await this.appProjectModel.findById(projectId);
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const page = options.page || 1;
      const limit = Math.min(options.limit || 20, 100);
      const skip = (page - 1) * limit;

      const query: any = {
        appProjectId: projectId,
        isDeleted: false
      };

      if (options.status) query.status = options.status;
      if (options.priority) query.priority = options.priority;
      if (options.category) query.category = options.category;
      if (options.assignedTo) query.assignedTo = options.assignedTo;

      const issues = await this.projectIssueModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('reportedBy', 'name surname email')
        .populate('assignedTo', 'name surname email')
        .exec();

      const total = await this.projectIssueModel.countDocuments(query);

      const [summary] = await this.projectIssueModel.aggregate([
        { $match: { appProjectId: projectId, isDeleted: false } },
        {
          $group: {
            _id: null,
            totalIssues: { $sum: 1 },
            openIssues: { $sum: { $cond: [{ $eq: ['$status', IssueStatus.OPEN] }, 1, 0] } },
            inProgressIssues: { $sum: { $cond: [{ $eq: ['$status', IssueStatus.IN_PROGRESS] }, 1, 0] } },
            resolvedIssues: { $sum: { $cond: [{ $eq: ['$status', IssueStatus.RESOLVED] }, 1, 0] } },
            criticalIssues: { $sum: { $cond: [{ $eq: ['$priority', IssuePriority.CRITICAL] }, 1, 0] } },
            lastReportedAt: { $max: '$createdAt' }
          }
        }
      ]);

      const priorityCounts = await this.projectIssueModel.aggregate([
        { $match: { appProjectId: projectId, isDeleted: false } },
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ]);

      const categoryCounts = await this.projectIssueModel.aggregate([
        { $match: { appProjectId: projectId, isDeleted: false } },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]);

      const overdueCount = await this.projectIssueModel.countDocuments({
        appProjectId: projectId,
        isDeleted: false,
        dueDate: { $lt: new Date() },
        status: { $nin: [IssueStatus.RESOLVED, IssueStatus.CLOSED] }
      });

      const priorityCountsMap = priorityCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {});

      const categoryCountsMap = categoryCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {});

      const transformedIssues = issues.map(issue => 
        this.transformIssueToResponse(issue, issue.reportedBy, issue.assignedTo)
      );

      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_ISSUES_VIEWED,
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
            category: options.category,
            assignedTo: options.assignedTo,
            totalIssues: total,
            issuesReturned: issues.length
          }
        });
      }

      const totalPages = Math.ceil(total / limit);

      return {
        issues: transformedIssues,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        },
        summary: {
          totalIssues: summary?.totalIssues || 0,
          openIssues: summary?.openIssues || 0,
          inProgressIssues: summary?.inProgressIssues || 0,
          resolvedIssues: summary?.resolvedIssues || 0,
          overdueIssues: overdueCount,
          criticalIssues: summary?.criticalIssues || 0,
          priorityCounts: priorityCountsMap,
          categoryCounts: categoryCountsMap,
          lastReportedAt: summary?.lastReportedAt || null
        }
      };

    } catch (error) {
      this.logger.error(`Error getting issues for project ${projectId}:`, error);
      throw error;
    }
  }

  async updateIssue(
    projectId: string,
    issueId: string,
    updateDto: UpdateProjectIssueDto,
    userId: string,
    adminUserId?: string,
    req?: any
  ): Promise<ProjectIssueResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      const issue = await this.projectIssueModel.findOne({
        _id: issueId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('reportedBy', 'name surname email')
        .populate('assignedTo', 'name surname email');

      if (!issue) {
        throw new NotFoundException('Issue not found');
      }

      const project = await this.appProjectModel.findById(projectId);
      const business = await this.businessModel.findById(project.businessId);
      
      const canEdit = issue.reportedBy.toString() === userId || 
                     issue.assignedTo?.toString() === userId ||
                     adminUserId === business.adminUserId;

      if (!canEdit) {
        throw new ForbiddenException('You can only edit issues you reported or are assigned to');
      }

      const oldValues: any = {};
      const newValues: any = {};

      if (updateDto.title !== undefined) {
        oldValues.title = issue.title;
        newValues.title = updateDto.title;
        issue.title = updateDto.title;
      }

      if (updateDto.description !== undefined) {
        oldValues.description = issue.description;
        newValues.description = updateDto.description;
        issue.description = updateDto.description;
      }

      if (updateDto.priority !== undefined) {
        oldValues.priority = issue.priority;
        newValues.priority = updateDto.priority;
        issue.priority = updateDto.priority;
      }

      if (updateDto.status !== undefined) {
        oldValues.status = issue.status;
        newValues.status = updateDto.status;
        issue.status = updateDto.status;

        if (updateDto.status === IssueStatus.RESOLVED || updateDto.status === IssueStatus.CLOSED) {
          issue.resolvedAt = new Date();
          issue.resolvedBy = userId;
        }
      }

      if (updateDto.category !== undefined) {
        oldValues.category = issue.category;
        newValues.category = updateDto.category;
        issue.category = updateDto.category;
      }

      if (updateDto.location !== undefined) {
        oldValues.location = issue.location;
        newValues.location = updateDto.location;
        issue.location = updateDto.location;
      }

      if (updateDto.assignedTo !== undefined) {
        oldValues.assignedTo = issue.assignedTo;
        newValues.assignedTo = updateDto.assignedTo;
        issue.assignedTo = updateDto.assignedTo;

        if (updateDto.assignedTo) {
          const assignee = await this.userModel.findById(updateDto.assignedTo);
          if (assignee) {
            issue.metadata.assigneeName = `${assignee.name} ${assignee.surname || ''}`.trim();
          }
        } else {
          issue.metadata.assigneeName = undefined;
        }
      }

      if (updateDto.dueDate !== undefined) {
        oldValues.dueDate = issue.dueDate;
        newValues.dueDate = updateDto.dueDate;
        issue.dueDate = updateDto.dueDate;
      }

      if (updateDto.resolutionNotes !== undefined) {
        oldValues.resolutionNotes = issue.resolutionNotes;
        newValues.resolutionNotes = updateDto.resolutionNotes;
        issue.resolutionNotes = updateDto.resolutionNotes;
      }

      issue.markModified('metadata');
      await issue.save();

      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_ISSUE_UPDATED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.MEDIUM,
          ipAddress,
          userAgent,
          oldValues,
          newValues,
          changedFields: Object.keys(updateDto),
          metadata: {
            projectId,
            projectName: project.name,
            issueId,
            issueTitle: issue.title,
            updatedBy: userId,
            operationDuration: Date.now() - startTime
          }
        });
      }

      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId,
        // @ts-ignore  
        userName: `${issue.reportedBy.name} ${issue.reportedBy.surname || ''}`.trim(),
        // @ts-ignore
        userEmail: issue.reportedBy.email,
        type: ActivityType.ISSUE_UPDATED,
        action: `updated issue`,
        description: `Updated ${issue.title}`,
        projectId,
        projectName: project.name,
        resourceType: 'project_issue',
        resourceId: issueId,
        resourceName: issue.title,
        data: {
          issueId,
          issueTitle: issue.title,
          updatedFields: Object.keys(updateDto),
          oldStatus: oldValues.status,
          newStatus: newValues.status,
          projectName: project.name
        }
      });

      this.logger.log(`Issue ${issueId} updated for project ${projectId} by user ${userId}`);
      return this.transformIssueToResponse(issue, issue.reportedBy, issue.assignedTo);

    } catch (error) {
      this.logger.error(`Error updating issue ${issueId}:`, error);
      throw error;
    }
  }

  async deleteIssue(
    projectId: string,
    issueId: string,
    userId: string,
    adminUserId?: string,
    req?: any
  ): Promise<{ success: boolean; message: string }> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      const issue = await this.projectIssueModel.findOne({
        _id: issueId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('reportedBy', 'name surname email');

      if (!issue) {
        throw new NotFoundException('Issue not found');
      }

      const project = await this.appProjectModel.findById(projectId);
      const business = await this.businessModel.findById(project.businessId);
      
      const canDelete = issue.reportedBy.toString() === userId || 
                       adminUserId === business.adminUserId;

      if (!canDelete) {
        throw new ForbiddenException('You can only delete issues you reported');
      }

      issue.isDeleted = true;
      issue.deletedAt = new Date();
      issue.deletedBy = userId;

      await issue.save();

      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_ISSUE_DELETED,
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
            issueId,
            issueTitle: issue.title,
            issuePriority: issue.priority,
            reporterId: issue.reportedBy.toString(),
            deletedBy: userId,
            operationDuration: Date.now() - startTime
          }
        });
      }

      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId,
        // @ts-ignore 
        userName: `${issue.reportedBy.name} ${issue.reportedBy.surname || ''}`.trim(),
        // @ts-ignore 
        userEmail: issue.reportedBy.email,
        type: ActivityType.ISSUE_UPDATED,
        action: 'deleted issue',
        description: `Removed ${issue.title}`,
        projectId,
        projectName: project.name,
        resourceType: 'project_issue',
        resourceId: issueId,
        resourceName: issue.title,
        data: {
          issueId,
          issueTitle: issue.title,
          issuePriority: issue.priority,
          projectName: project.name
        }
      });

      this.logger.log(`Issue ${issueId} deleted for project ${projectId} by user ${userId}`);
      
      return {
        success: true,
        message: 'Issue deleted successfully'
      };

    } catch (error) {
      this.logger.error(`Error deleting issue ${issueId}:`, error);
      throw error;
    }
  }

  async getIssue(
    projectId: string,
    issueId: string
  ): Promise<ProjectIssueResponseDto> {
    try {
      const issue = await this.projectIssueModel.findOne({
        _id: issueId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('reportedBy', 'name surname email')
        .populate('assignedTo', 'name surname email');

      if (!issue) {
        throw new NotFoundException('Issue not found');
      }

      return this.transformIssueToResponse(issue, issue.reportedBy, issue.assignedTo);

    } catch (error) {
      this.logger.error(`Error getting issue ${issueId}:`, error);
      throw error;
    }
  }

  async getProjectById(projectId: string): Promise<any> {
    try {
      return await this.appProjectModel.findById(projectId).exec();
    } catch (error) {
      this.logger.error(`Error finding project ${projectId}: ${error.message}`);
      return null;
    }
  }

  private async validateIssueAccess(projectId: string, userId: string) {
    const project = await this.appProjectModel.findById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const business = await this.businessModel.findById(project.businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const reporter = await this.userModel.findById(userId);
    if (!reporter) {
      throw new NotFoundException('User not found');
    }

    const isAssigned = project.assignedUsers.includes(userId);
    const isBusinessAdmin = business.adminUserId === userId;

    if (!isAssigned && !isBusinessAdmin) {
      throw new ForbiddenException('You are not assigned to this project');
    }

    return { project, business, reporter };
  }

  /**
   * Complete transformIssueToResponse method (was cut off in the document)
   */
  private transformIssueToResponse(issue: any, reporter: any, assignee?: any): ProjectIssueResponseDto {
    const photos = issue.photoUrls?.map((url: string, index: number) => ({
      url,
      name: issue.photoNames?.[index] || '',
      size: issue.photoSizes?.[index] || 0,
      sizeFormatted: this.formatFileSize(issue.photoSizes?.[index] || 0)
    })) || [];

    return {
      id: issue._id.toString(),
      appProjectId: issue.appProjectId,
      reporter: {
        id: reporter._id?.toString() || reporter.toString(),
        name: reporter.name ? `${reporter.name} ${reporter.surname || ''}`.trim() : 'Unknown User',
        email: reporter.email || ''
      },
      assignee: assignee ? {
        id: assignee._id?.toString() || assignee.toString(),
        name: assignee.name ? `${assignee.name} ${assignee.surname || ''}`.trim() : 'Unknown User',
        email: assignee.email || ''
      } : null,
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      status: issue.status,
      category: issue.category,
      location: issue.location,
      dueDate: issue.dueDate,
      resolutionNotes: issue.resolutionNotes,
      photos,
      photoCount: photos.length,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      resolvedAt: issue.resolvedAt,
      // @ts-ignore 
      resolvedBy: issue.resolvedBy,
      metadata: issue.metadata,
      isOverdue: issue.dueDate && issue.dueDate < new Date() && 
                 ![IssueStatus.RESOLVED, IssueStatus.CLOSED].includes(issue.status)
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

  /**
   * Format file size to human readable
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

}