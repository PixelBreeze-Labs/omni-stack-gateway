// src/services/project-comments.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProjectComment, CommentType, CommentStatus } from '../schemas/project-comment.schema';
import { AppProject } from '../schemas/app-project.schema';
import { Business } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import { AuditLogService } from './audit-log.service';
import { AppActivityService } from './app-activity.service';
import { BusinessStorageService } from './business-storage.service';
import { AuditAction, AuditSeverity, ResourceType } from '../schemas/audit-log.schema';
import { ActivityType } from '../schemas/app-activity.schema';
import {
  CreateProjectCommentDto,
  UpdateProjectCommentDto,
  ProjectCommentResponseDto,
  ProjectCommentsListResponseDto
} from '../dtos/project-comment.dto';

interface CommentPaginationOptions {
  page?: number;
  limit?: number;
  includeReplies?: boolean;
  parentOnly?: boolean;
}

@Injectable()
export class ProjectCommentsService {
  private readonly logger = new Logger(ProjectCommentsService.name);

  constructor(
    @InjectModel(ProjectComment.name) private projectCommentModel: Model<ProjectComment>,
    @InjectModel(AppProject.name) private appProjectModel: Model<AppProject>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly auditLogService: AuditLogService,
    private readonly appActivityService: AppActivityService,
    private readonly businessStorageService: BusinessStorageService
  ) {}

  /**
   * Create a new project comment
   */
  async createComment(
    projectId: string,
    createCommentDto: CreateProjectCommentDto,
    authorId: string,
    adminUserId?: string,
    req?: any
  ): Promise<ProjectCommentResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Validate project and get business context
      const { project, business, author } = await this.validateCommentAccess(projectId, authorId);

      // If parent comment specified, validate it exists and belongs to same project
      let parentComment = null;
      if (createCommentDto.parentCommentId) {
        parentComment = await this.projectCommentModel.findOne({
          _id: createCommentDto.parentCommentId,
          appProjectId: projectId,
          isDeleted: false
        });

        if (!parentComment) {
          throw new BadRequestException('Parent comment not found or does not belong to this project');
        }
      }

      // Create comment
      const comment = new this.projectCommentModel({
        businessId: project.businessId,
        appProjectId: projectId,
        authorId,
        content: createCommentDto.content,
        commentType: CommentType.TEXT,
        parentCommentId: createCommentDto.parentCommentId,
        metadata: {
          ...createCommentDto.metadata,
          authorName: `${author.name} ${author.surname || ''}`.trim(),
          authorEmail: author.email,
          projectName: project.name,
          isAdminComment: adminUserId === business.adminUserId
        }
      });

      await comment.save();

      // Update parent comment reply count
      if (parentComment) {
        await this.projectCommentModel.findByIdAndUpdate(
          parentComment._id,
          { $inc: { replyCount: 1 } }
        );
      }

      // 🎯 AUDIT LOG - Business action (security/compliance)
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_COMMENT_CREATED,
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
            commentId: comment._id.toString(),
            commentContent: createCommentDto.content.substring(0, 100) + (createCommentDto.content.length > 100 ? '...' : ''),
            authorId,
            authorName: `${author.name} ${author.surname || ''}`.trim(),
            isReply: !!createCommentDto.parentCommentId,
            parentCommentId: createCommentDto.parentCommentId,
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity (activity feed)
      const actionText = createCommentDto.parentCommentId ? 'replied to a comment' : 'added a comment';
      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId: authorId,
        userName: `${author.name} ${author.surname || ''}`.trim(),
        userEmail: author.email,
        type: ActivityType.PROJECT_UPDATE,
        action: `${actionText} on project`,
        description: `${createCommentDto.content.substring(0, 100)}${createCommentDto.content.length > 100 ? '...' : ''}`,
        projectId,
        projectName: project.name,
        resourceType: 'project_comment',
        resourceId: comment._id.toString(),
        resourceName: 'Project comment',
        data: {
          commentId: comment._id.toString(),
          commentContent: createCommentDto.content,
          isReply: !!createCommentDto.parentCommentId,
          parentCommentId: createCommentDto.parentCommentId,
          projectName: project.name
        }
      });

      this.logger.log(`Comment created for project ${projectId} by user ${authorId}`);
      return this.transformCommentToResponse(comment, author);

    } catch (error) {
      // 🎯 AUDIT LOG - Error for business actions only
      if (adminUserId && this.shouldLogError(error)) {
        await this.auditLogService.createAuditLog({
          businessId: projectId, // fallback businessId
          userId: adminUserId,
          action: AuditAction.PROJECT_COMMENT_CREATED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project comment creation`,
          success: false,
          errorMessage: 'Error creating project comment',
          severity: AuditSeverity.HIGH,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            authorId,
            commentContent: createCommentDto.content?.substring(0, 100),
            errorReason: this.categorizeError(error),
            errorName: error.name,
            errorMessage: error.message,
            operationDuration: Date.now() - startTime
          }
        });
      }

      this.logger.error(`Error creating comment for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Create comment with image attachment
   */
  async createCommentWithImage(
    projectId: string,
    content: string,
    imageFile: Buffer,
    fileName: string,
    authorId: string,
    parentCommentId?: string,
    metadata?: Record<string, any>,
    adminUserId?: string,
    req?: any
  ): Promise<ProjectCommentResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Validate project and get business context
      const { project, business, author } = await this.validateCommentAccess(projectId, authorId);

      // Upload image to business storage
      const uploadResult = await this.businessStorageService.uploadImage(
        business._id.toString(),
        imageFile,
        fileName,
        'project-comments',
        adminUserId,
        req
      );

      if (!uploadResult.success) {
        throw new BadRequestException('Failed to upload comment image');
      }

      // Validate parent comment if specified
      if (parentCommentId) {
        const parentComment = await this.projectCommentModel.findOne({
          _id: parentCommentId,
          appProjectId: projectId,
          isDeleted: false
        });

        if (!parentComment) {
          throw new BadRequestException('Parent comment not found or does not belong to this project');
        }
      }

      // Create comment with image
      const comment = new this.projectCommentModel({
        businessId: project.businessId,
        appProjectId: projectId,
        authorId,
        content,
        commentType: CommentType.TEXT_WITH_IMAGE,
        parentCommentId,
        imageUrl: uploadResult.file.url,
        imageName: uploadResult.file.name,
        imageSize: uploadResult.file.size,
        metadata: {
          ...metadata,
          authorName: `${author.name} ${author.surname || ''}`.trim(),
          authorEmail: author.email,
          projectName: project.name,
          isAdminComment: adminUserId === business.adminUserId
        }
      });

      await comment.save();

      // Update parent comment reply count if it's a reply
      if (parentCommentId) {
        await this.projectCommentModel.findByIdAndUpdate(
          parentCommentId,
          { $inc: { replyCount: 1 } }
        );
      }

      // 🎯 AUDIT LOG - Business action
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_COMMENT_WITH_IMAGE_CREATED,
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
            commentId: comment._id.toString(),
            commentContent: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
            authorId,
            authorName: `${author.name} ${author.surname || ''}`.trim(),
            imageUrl: uploadResult.file.url,
            imageName: uploadResult.file.name,
            imageSize: uploadResult.file.size,
            isReply: !!parentCommentId,
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity
      const actionText = parentCommentId ? 'replied with an image' : 'added a comment with image';
      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId: authorId,
        userName: `${author.name} ${author.surname || ''}`.trim(),
        userEmail: author.email,
        type: ActivityType.PROJECT_UPDATE,
        action: `${actionText} on project`,
        description: `${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
        projectId,
        projectName: project.name,
        resourceType: 'project_comment',
        resourceId: comment._id.toString(),
        resourceName: 'Project comment with image',
        data: {
          commentId: comment._id.toString(),
          commentContent: content,
          hasImage: true,
          imageName: uploadResult.file.name,
          isReply: !!parentCommentId,
          projectName: project.name
        }
      });

      this.logger.log(`Comment with image created for project ${projectId} by user ${authorId}`);
      return this.transformCommentToResponse(comment, author);

    } catch (error) {
      this.logger.error(`Error creating comment with image for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Get all comments for a project with pagination
   */
  async getProjectComments(
    projectId: string,
    options: CommentPaginationOptions = {},
    adminUserId?: string,
    req?: any
  ): Promise<ProjectCommentsListResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');

    try {
      // Validate project exists and get business context
      const project = await this.appProjectModel.findById(projectId);
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const page = options.page || 1;
      const limit = Math.min(options.limit || 20, 100); // Max 100 comments per page
      const skip = (page - 1) * limit;

      // Build query - exclude deleted comments
      const query: any = {
        appProjectId: projectId,
        isDeleted: false
      };

      // If parentOnly is true, only get top-level comments
      if (options.parentOnly) {
        query.parentCommentId = { $exists: false };
      }

      // Get comments with author information
      const comments = await this.projectCommentModel
        .find(query)
        .sort({ createdAt: -1 }) // Newest first
        .skip(skip)
        .limit(limit)
        .populate('authorId', 'name surname email')
        .exec();

      // Get total count for pagination
      const total = await this.projectCommentModel.countDocuments(query);

      // Get summary statistics
      const [summary] = await this.projectCommentModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false
          }
        },
        {
          $group: {
            _id: null,
            totalComments: { $sum: 1 },
            totalReplies: {
              $sum: {
                $cond: [{ $ifNull: ['$parentCommentId', false] }, 1, 0]
              }
            },
            commentsWithImages: {
              $sum: {
                $cond: [{ $eq: ['$commentType', CommentType.TEXT_WITH_IMAGE] }, 1, 0]
              }
            },
            lastCommentAt: { $max: '$createdAt' }
          }
        }
      ]);

      // Transform comments to response format
      const transformedComments = comments.map(comment => 
        this.transformCommentToResponse(comment, comment.authorId)
      );

      // 🎯 AUDIT LOG - Business viewing comments (security/compliance)
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_COMMENTS_VIEWED,
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
            totalComments: total,
            includeReplies: !options.parentOnly,
            commentsReturned: comments.length
          }
        });
      }

      const totalPages = Math.ceil(total / limit);
      
      return {
        comments: transformedComments,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        },
        summary: summary || {
          totalComments: 0,
          totalReplies: 0,
          commentsWithImages: 0,
          lastCommentAt: null
        }
      };

    } catch (error) {
      this.logger.error(`Error getting comments for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Get replies for a specific comment
   */
  async getCommentReplies(
    projectId: string,
    parentCommentId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<ProjectCommentResponseDto[]> {
    try {
      // Validate parent comment exists and belongs to project
      const parentComment = await this.projectCommentModel.findOne({
        _id: parentCommentId,
        appProjectId: projectId,
        isDeleted: false
      });

      if (!parentComment) {
        throw new NotFoundException('Parent comment not found');
      }

      const skip = (page - 1) * Math.min(limit, 50); // Max 50 replies per page

      const replies = await this.projectCommentModel
        .find({
          parentCommentId,
          isDeleted: false
        })
        .sort({ createdAt: 1 }) // Oldest first for replies
        .skip(skip)
        .limit(Math.min(limit, 50))
        .populate('authorId', 'name surname email')
        .exec();

      return replies.map(reply => 
        this.transformCommentToResponse(reply, reply.authorId)
      );

    } catch (error) {
      this.logger.error(`Error getting replies for comment ${parentCommentId}:`, error);
      throw error;
    }
  }

  /**
   * Update a comment
   */
  async updateComment(
    projectId: string,
    commentId: string,
    updateCommentDto: UpdateProjectCommentDto,
    userId: string,
    adminUserId?: string,
    req?: any
  ): Promise<ProjectCommentResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Find comment and validate ownership
      const comment = await this.projectCommentModel.findOne({
        _id: commentId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('authorId', 'name surname email');

      if (!comment) {
        throw new NotFoundException('Comment not found');
      }

      // Validate user can edit (author or business admin)
      const project = await this.appProjectModel.findById(projectId);
      const business = await this.businessModel.findById(project.businessId);
      
      const canEdit = comment.authorId.toString() === userId ||
      adminUserId === business.adminUserId;

      if (!canEdit) {
        throw new ForbiddenException('You can only edit your own comments');
      }

      // Update comment
      const oldContent = comment.content;
      comment.content = updateCommentDto.content;
      comment.lastEditedAt = new Date();
      comment.editReason = updateCommentDto.editReason;
      comment.status = CommentStatus.EDITED;

      await comment.save();

      // 🎯 AUDIT LOG - Business action
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_COMMENT_UPDATED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.MEDIUM,
          ipAddress,
          userAgent,
          oldValues: { content: oldContent },
          newValues: { content: updateCommentDto.content },
          changedFields: ['content'],
          metadata: {
            projectId,
            projectName: project.name,
            commentId,
            // @ts-ignore
            authorId: comment.authorId._id.toString(),
            // @ts-ignore
            authorName: `${comment.authorId.name} ${comment.authorId.surname || ''}`.trim(),
            editReason: updateCommentDto.editReason,
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity
      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId,
        // @ts-ignore
        userName: `${comment.authorId.name} ${comment.authorId.surname || ''}`.trim(),
        // @ts-ignore
        userEmail: comment.authorId.email,
        type: ActivityType.PROJECT_UPDATE,
        action: 'edited a comment on project',
        description: `Updated comment: ${updateCommentDto.content.substring(0, 100)}${updateCommentDto.content.length > 100 ? '...' : ''}`,
        projectId,
        projectName: project.name,
        resourceType: 'project_comment',
        resourceId: commentId,
        resourceName: 'Project comment edit',
        data: {
          commentId,
          oldContent: oldContent.substring(0, 100),
          newContent: updateCommentDto.content.substring(0, 100),
          editReason: updateCommentDto.editReason,
          projectName: project.name
        }
      });

      this.logger.log(`Comment ${commentId} updated for project ${projectId} by user ${userId}`);
      return this.transformCommentToResponse(comment, comment.authorId);

    } catch (error) {
      this.logger.error(`Error updating comment ${commentId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a comment (soft delete)
   */
  async deleteComment(
    projectId: string,
    commentId: string,
    userId: string,
    adminUserId?: string,
    req?: any
  ): Promise<{ success: boolean; message: string }> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Find comment and validate ownership
      const comment = await this.projectCommentModel.findOne({
        _id: commentId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('authorId', 'name surname email');

      if (!comment) {
        throw new NotFoundException('Comment not found');
      }

      // Validate user can delete (author or business admin)
      const project = await this.appProjectModel.findById(projectId);
      const business = await this.businessModel.findById(project.businessId);
      
      const canDelete = comment.authorId.toString() === userId ||
      adminUserId === business.adminUserId;

      if (!canDelete) {
        throw new ForbiddenException('You can only delete your own comments');
      }

      // Soft delete comment
      comment.isDeleted = true;
      comment.deletedAt = new Date();
      comment.deletedBy = userId;
      comment.status = CommentStatus.DELETED;

      await comment.save();

      // If this comment has replies, we might want to handle them differently
      // For now, we keep replies visible but could add logic to handle cascade deletion

      // 🎯 AUDIT LOG - Business action
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_COMMENT_DELETED,
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
            commentId,
            deletedContent: comment.content.substring(0, 100),
            // @ts-ignore
            authorId: comment.authorId._id.toString(),
            // @ts-ignore
            authorName: `${comment.authorId.name} ${comment.authorId.surname || ''}`.trim(),
            deletedBy: userId,
            hadImage: comment.commentType === CommentType.TEXT_WITH_IMAGE,
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity
      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId,
        // @ts-ignore
        userName: `${comment.authorId.name} ${comment.authorId.surname || ''}`.trim(),
        // @ts-ignore
        userEmail: comment.authorId.email,
        type: ActivityType.PROJECT_UPDATE,
        action: 'deleted a comment from project',
        description: `Removed comment from ${project.name}`,
        projectId,
        projectName: project.name,
        resourceType: 'project_comment',
        resourceId: commentId,
        resourceName: 'Project comment deletion',
        data: {
          commentId,
          deletedContent: comment.content.substring(0, 100),
          projectName: project.name,
          hadImage: comment.commentType === CommentType.TEXT_WITH_IMAGE
        }
      });

      this.logger.log(`Comment ${commentId} deleted for project ${projectId} by user ${userId}`);
      
      return {
        success: true,
        message: 'Comment deleted successfully'
      };

    } catch (error) {
      this.logger.error(`Error deleting comment ${commentId}:`, error);
      throw error;
    }
  }

  /**
   * Get comment statistics for a project
   */
  async getProjectCommentStats(
    projectId: string,
    adminUserId?: string,
    req?: any
  ): Promise<{
    totalComments: number;
    totalReplies: number;
    commentsWithImages: number;
    topCommenters: Array<{
      userId: string;
      userName: string;
      commentCount: number;
    }>;
    recentActivity: Date;
    commentsToday: number;
    commentsThisWeek: number;
  }> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');

    try {
      // Validate project
      const project = await this.appProjectModel.findById(projectId);
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      // Aggregate statistics
      const [stats] = await this.projectCommentModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false
          }
        },
        {
          $group: {
            _id: null,
            totalComments: { $sum: 1 },
            totalReplies: {
              $sum: {
                $cond: [{ $ifNull: ['$parentCommentId', false] }, 1, 0]
              }
            },
            commentsWithImages: {
              $sum: {
                $cond: [{ $eq: ['$commentType', CommentType.TEXT_WITH_IMAGE] }, 1, 0]
              }
            },
            recentActivity: { $max: '$createdAt' },
            commentsToday: {
              $sum: {
                $cond: [{ $gte: ['$createdAt', today] }, 1, 0]
              }
            },
            commentsThisWeek: {
              $sum: {
                $cond: [{ $gte: ['$createdAt', weekAgo] }, 1, 0]
              }
            }
          }
        }
      ]);

      // Get top commenters
      const topCommenters = await this.projectCommentModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false
          }
        },
        {
          $group: {
            _id: '$authorId',
            commentCount: { $sum: 1 }
          }
        },
        {
          $sort: { commentCount: -1 }
        },
        {
          $limit: 5
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
            commentCount: 1
          }
        }
      ]);

      // 🎯 AUDIT LOG - Business viewing stats (security/compliance)
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_COMMENT_STATS_VIEWED,
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
            totalComments: stats?.totalComments || 0,
            totalReplies: stats?.totalReplies || 0,
            commentsWithImages: stats?.commentsWithImages || 0
          }
        });
      }

      return {
        totalComments: stats?.totalComments || 0,
        totalReplies: stats?.totalReplies || 0,
        commentsWithImages: stats?.commentsWithImages || 0,
        topCommenters,
        recentActivity: stats?.recentActivity || null,
        commentsToday: stats?.commentsToday || 0,
        commentsThisWeek: stats?.commentsThisWeek || 0
      };

    } catch (error) {
      this.logger.error(`Error getting comment stats for project ${projectId}:`, error);
      throw error;
    }
  }

  // HELPER METHODS

  /**
   * Validate project access and get context
   */
  private async validateCommentAccess(projectId: string, userId: string) {
    const project = await this.appProjectModel.findById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const business = await this.businessModel.findById(project.businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const author = await this.userModel.findById(userId);
    if (!author) {
      throw new NotFoundException('User not found');
    }

    // Check if user is assigned to project or is business admin
    const isAssigned = project.assignedUsers.includes(userId);
    const isBusinessAdmin = business.adminUserId === userId;

    if (!isAssigned && !isBusinessAdmin) {
      throw new ForbiddenException('You are not assigned to this project');
    }

    return { project, business, author };
  }

  /**
   * Transform comment document to response DTO
   */
  private transformCommentToResponse(comment: any, author: any): ProjectCommentResponseDto {
    return {
      id: comment._id.toString(),
      appProjectId: comment.appProjectId,
      author: {
        id: author._id.toString(),
        name: `${author.name} ${author.surname || ''}`.trim(),
        email: author.email
      },
      content: comment.content,
      commentType: comment.commentType,
      parentCommentId: comment.parentCommentId,
      replyCount: comment.replyCount || 0,
      image: comment.imageUrl ? {
        url: comment.imageUrl,
        name: comment.imageName,
        size: comment.imageSize
      } : undefined,
      editInfo: comment.lastEditedAt ? {
        lastEditedAt: comment.lastEditedAt,
        editReason: comment.editReason
      } : undefined,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      isReply: !!comment.parentCommentId,
      hasImage: comment.commentType === CommentType.TEXT_WITH_IMAGE,
      metadata: comment.metadata
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
 * Get project by ID (helper method for validation)
 */
async getProjectById(projectId: string): Promise<AppProject | null> {
    try {
      return await this.appProjectModel.findById(projectId).exec();
    } catch (error) {
      this.logger.error(`Error finding project ${projectId}: ${error.message}`);
      return null;
    }
  }
}