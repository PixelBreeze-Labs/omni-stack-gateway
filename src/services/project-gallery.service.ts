// src/services/project-gallery.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProjectGallery, MediaType, GalleryCategory } from '../schemas/project-gallery.schema';
import { AppProject } from '../schemas/app-project.schema';
import { Business } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import { AuditLogService } from './audit-log.service';
import { AppActivityService } from './app-activity.service';
import { BusinessStorageService } from './business-storage.service';
import { AuditAction, AuditSeverity, ResourceType } from '../schemas/audit-log.schema';
import { ActivityType } from '../schemas/app-activity.schema';
import {
  UploadGalleryItemDto,
  UpdateGalleryItemDto,
  ProjectGalleryItemResponseDto,
  ProjectGalleryListResponseDto
} from '../dtos/project-gallery.dto';

interface GalleryPaginationOptions {
  page?: number;
  limit?: number;
  category?: GalleryCategory;
  mediaType?: MediaType;
}

@Injectable()
export class ProjectGalleryService {
  private readonly logger = new Logger(ProjectGalleryService.name);

  constructor(
    @InjectModel(ProjectGallery.name) private projectGalleryModel: Model<ProjectGallery>,
    @InjectModel(AppProject.name) private appProjectModel: Model<AppProject>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly auditLogService: AuditLogService,
    private readonly appActivityService: AppActivityService,
    private readonly businessStorageService: BusinessStorageService
  ) {}

  /**
   * Upload media to project gallery
   */
  async uploadMedia(
    projectId: string,
    file: Buffer,
    fileName: string,
    uploadDto: UploadGalleryItemDto,
    uploaderId: string,
    adminUserId?: string,
    req?: any
  ): Promise<ProjectGalleryItemResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Validate project and get business context
      const { project, business, uploader } = await this.validateGalleryAccess(projectId, uploaderId);

      // Determine media type from MIME type
      const mimeType = this.getMimeType(fileName, file);
      const mediaType = this.determineMediaType(mimeType);

      // Validate file type
      if (!this.isAllowedFileType(mimeType)) {
        throw new BadRequestException(
          'File type not supported. Allowed: JPEG, PNG, GIF, WebP, MP4, MOV, AVI, WebM'
        );
      }

      // Upload file to business storage
      const uploadResult = await this.businessStorageService.uploadImage(
        business._id.toString(),
        file,
        fileName,
        'project-gallery',
        adminUserId,
        req
      );

      if (!uploadResult.success) {
        throw new BadRequestException('Failed to upload media file');
      }

      // Create gallery item
      const galleryItem = new this.projectGalleryModel({
        businessId: project.businessId,
        appProjectId: projectId,
        uploadedBy: uploaderId,
        fileName: uploadResult.file.name,
        fileUrl: uploadResult.file.url,
        fileSize: uploadResult.file.size,
        mimeType,
        mediaType,
        category: uploadDto.category,
        description: uploadDto.description,
        metadata: {
          ...uploadDto.metadata,
          uploaderName: `${uploader.name} ${uploader.surname || ''}`.trim(),
          uploaderEmail: uploader.email,
          projectName: project.name,
          location: uploadDto.location,
          tags: uploadDto.tags || []
        }
      });

      await galleryItem.save();

      // 🎯 AUDIT LOG - Business action
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_GALLERY_MEDIA_UPLOADED,
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
            galleryItemId: galleryItem._id.toString(),
            fileName: uploadResult.file.name,
            fileSize: uploadResult.file.size,
            mediaType,
            category: uploadDto.category,
            uploaderId,
            uploaderName: `${uploader.name} ${uploader.surname || ''}`.trim(),
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity
      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId: uploaderId,
        userName: `${uploader.name} ${uploader.surname || ''}`.trim(),
        userEmail: uploader.email,
        type: ActivityType.PROJECT_UPDATE,
        action: `uploaded ${mediaType} to project gallery`,
        description: uploadDto.description || `Uploaded ${fileName}`,
        projectId,
        projectName: project.name,
        resourceType: 'project_gallery',
        resourceId: galleryItem._id.toString(),
        resourceName: fileName,
        data: {
          galleryItemId: galleryItem._id.toString(),
          fileName,
          mediaType,
          category: uploadDto.category,
          fileSize: uploadResult.file.size,
          projectName: project.name
        }
      });

      this.logger.log(`Media uploaded to gallery for project ${projectId} by user ${uploaderId}`);
      return this.transformGalleryItemToResponse(galleryItem, uploader);

    } catch (error) {
      // 🎯 AUDIT LOG - Error for business actions only
      if (adminUserId && this.shouldLogError(error)) {
        await this.auditLogService.createAuditLog({
          businessId: projectId, // fallback
          userId: adminUserId,
          action: AuditAction.PROJECT_GALLERY_MEDIA_UPLOADED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Gallery upload`,
          success: false,
          errorMessage: 'Error uploading media to gallery',
          severity: AuditSeverity.HIGH,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            fileName,
            uploaderId,
            errorReason: this.categorizeError(error),
            errorName: error.name,
            errorMessage: error.message,
            operationDuration: Date.now() - startTime
          }
        });
      }

      this.logger.error(`Error uploading media to gallery for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Get project gallery items with pagination and filters
   */
  async getProjectGallery(
    projectId: string,
    options: GalleryPaginationOptions = {},
    adminUserId?: string,
    req?: any
  ): Promise<ProjectGalleryListResponseDto> {
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

      if (options.category) {
        query.category = options.category;
      }

      if (options.mediaType) {
        query.mediaType = options.mediaType;
      }

      // Get gallery items with uploader information
      const items = await this.projectGalleryModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('uploadedBy', 'name surname email')
        .exec();

      // Get total count
      const total = await this.projectGalleryModel.countDocuments(query);

      // Get summary statistics
      const [summary] = await this.projectGalleryModel.aggregate([
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
            totalImages: {
              $sum: { $cond: [{ $eq: ['$mediaType', MediaType.IMAGE] }, 1, 0] }
            },
            totalVideos: {
              $sum: { $cond: [{ $eq: ['$mediaType', MediaType.VIDEO] }, 1, 0] }
            },
            totalSizeBytes: { $sum: '$fileSize' },
            lastUploadAt: { $max: '$createdAt' }
          }
        }
      ]);

      // Get category counts
      const categoryCounts = await this.projectGalleryModel.aggregate([
        {
          $match: {
            appProjectId: projectId,
            isDeleted: false
          }
        },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 }
          }
        }
      ]);

      const categoryCountsMap = categoryCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {});

      // Transform items to response format
      const transformedItems = items.map(item => 
        this.transformGalleryItemToResponse(item, item.uploadedBy)
      );

      // 🎯 AUDIT LOG - Business viewing gallery
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_GALLERY_VIEWED,
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
            category: options.category,
            mediaType: options.mediaType,
            totalItems: total,
            itemsReturned: items.length
          }
        });
      }

      const totalPages = Math.ceil(total / limit);
      const totalSizeFormatted = this.formatFileSize(summary?.totalSizeBytes || 0);

      return {
        items: transformedItems,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        },
        summary: {
          totalItems: summary?.totalItems || 0,
          totalImages: summary?.totalImages || 0,
          totalVideos: summary?.totalVideos || 0,
          totalSizeBytes: summary?.totalSizeBytes || 0,
          totalSizeFormatted,
          categoryCounts: categoryCountsMap,
          lastUploadAt: summary?.lastUploadAt || null
        }
      };

    } catch (error) {
      this.logger.error(`Error getting gallery for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Update gallery item
   */
  async updateGalleryItem(
    projectId: string,
    itemId: string,
    updateDto: UpdateGalleryItemDto,
    userId: string,
    adminUserId?: string,
    req?: any
  ): Promise<ProjectGalleryItemResponseDto> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Find gallery item
      const item = await this.projectGalleryModel.findOne({
        _id: itemId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('uploadedBy', 'name surname email');

      if (!item) {
        throw new NotFoundException('Gallery item not found');
      }

      // Validate user can edit (uploader or business admin)
      const project = await this.appProjectModel.findById(projectId);
      const business = await this.businessModel.findById(project.businessId);
      
      const canEdit = item.uploadedBy.toString() === userId || 
                     adminUserId === business.adminUserId;

      if (!canEdit) {
        throw new ForbiddenException('You can only edit your own uploads');
      }

      // Store old values for audit
      const oldValues = {
        description: item.description,
        category: item.category,
        location: item.metadata?.location,
        tags: item.metadata?.tags
      };

      // Update item
      if (updateDto.description !== undefined) {
        item.description = updateDto.description;
      }
      if (updateDto.category !== undefined) {
        item.category = updateDto.category;
      }
      if (updateDto.location !== undefined) {
        item.metadata.location = updateDto.location;
      }
      if (updateDto.tags !== undefined) {
        item.metadata.tags = updateDto.tags;
      }

      item.markModified('metadata');
      await item.save();

      // 🎯 AUDIT LOG - Business action
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_GALLERY_ITEM_UPDATED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.MEDIUM,
          ipAddress,
          userAgent,
          oldValues,
          newValues: {
            description: updateDto.description,
            category: updateDto.category,
            location: updateDto.location,
            tags: updateDto.tags
          },
          changedFields: Object.keys(updateDto),
          metadata: {
            projectId,
            projectName: project.name,
            galleryItemId: itemId,
            fileName: item.fileName,
            uploaderId: item.uploadedBy.toString(),
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity
      await this.appActivityService.createActivity({
        businessId: project.businessId,
        userId,
        // @ts-ignore
        userName: `${item.uploadedBy.name} ${item.uploadedBy.surname || ''}`.trim(),
        // @ts-ignore
        userEmail: item.uploadedBy.email,
        type: ActivityType.PROJECT_UPDATE,
        action: 'updated gallery item',
        description: `Updated ${item.fileName}`,
        projectId,
        projectName: project.name,
        resourceType: 'project_gallery',
        resourceId: itemId,
        resourceName: item.fileName,
        data: {
          galleryItemId: itemId,
          fileName: item.fileName,
          updatedFields: Object.keys(updateDto),
          projectName: project.name
        }
      });

      this.logger.log(`Gallery item ${itemId} updated for project ${projectId} by user ${userId}`);
      return this.transformGalleryItemToResponse(item, item.uploadedBy);

    } catch (error) {
      this.logger.error(`Error updating gallery item ${itemId}:`, error);
      throw error;
    }
  }

  /**
   * Delete gallery item (soft delete)
   */
  async deleteGalleryItem(
    projectId: string,
    itemId: string,
    userId: string,
    adminUserId?: string,
    req?: any
  ): Promise<{ success: boolean; message: string }> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      // Find gallery item
      const item = await this.projectGalleryModel.findOne({
        _id: itemId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('uploadedBy', 'name surname email');

      if (!item) {
        throw new NotFoundException('Gallery item not found');
      }

      // Validate user can delete (uploader or business admin)
      const project = await this.appProjectModel.findById(projectId);
      const business = await this.businessModel.findById(project.businessId);
      
      const canDelete = item.uploadedBy.toString() === userId || 
                       adminUserId === business.adminUserId;

      if (!canDelete) {
        throw new ForbiddenException('You can only delete your own uploads');
      }

      // Soft delete item
      item.isDeleted = true;
      item.deletedAt = new Date();
      item.deletedBy = userId;

      await item.save();

      // 🎯 AUDIT LOG - Business action
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_GALLERY_ITEM_DELETED,
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
            galleryItemId: itemId,
            fileName: item.fileName,
            fileSize: item.fileSize,
            mediaType: item.mediaType,
            uploaderId: item.uploadedBy.toString(),
            // @ts-ignore
            uploaderName: `${item.uploadedBy.name} ${item.uploadedBy.surname || ''}`.trim(),
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
        userName: `${item.uploadedBy.name} ${item.uploadedBy.surname || ''}`.trim(),
        // @ts-ignore
        userEmail: item.uploadedBy.email,
        type: ActivityType.PROJECT_UPDATE,
        action: 'deleted gallery item',
        description: `Removed ${item.fileName} from gallery`,
        projectId,
        projectName: project.name,
        resourceType: 'project_gallery',
        resourceId: itemId,
        resourceName: item.fileName,
        data: {
          galleryItemId: itemId,
          fileName: item.fileName,
          mediaType: item.mediaType,
          projectName: project.name
        }
      });

      this.logger.log(`Gallery item ${itemId} deleted for project ${projectId} by user ${userId}`);
      
      return {
        success: true,
        message: 'Gallery item deleted successfully'
      };

    } catch (error) {
      this.logger.error(`Error deleting gallery item ${itemId}:`, error);
      throw error;
    }
  }

  /**
   * Get single gallery item
   */
  async getGalleryItem(
    projectId: string,
    itemId: string
  ): Promise<ProjectGalleryItemResponseDto> {
    try {
      const item = await this.projectGalleryModel.findOne({
        _id: itemId,
        appProjectId: projectId,
        isDeleted: false
      }).populate('uploadedBy', 'name surname email');

      if (!item) {
        throw new NotFoundException('Gallery item not found');
      }

      return this.transformGalleryItemToResponse(item, item.uploadedBy);

    } catch (error) {
      this.logger.error(`Error getting gallery item ${itemId}:`, error);
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
   * Validate project access and get context
   */
  private async validateGalleryAccess(projectId: string, userId: string) {
    const project = await this.appProjectModel.findById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const business = await this.businessModel.findById(project.businessId);
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const uploader = await this.userModel.findById(userId);
    if (!uploader) {
      throw new NotFoundException('User not found');
    }

    // Check if user is assigned to project or is business admin
    const isAssigned = project.assignedUsers.includes(userId);
    const isBusinessAdmin = business.adminUserId === userId;

    if (!isAssigned && !isBusinessAdmin) {
      throw new ForbiddenException('You are not assigned to this project');
    }

    return { project, business, uploader };
  }

  /**
   * Determine media type from MIME type
   */
  private determineMediaType(mimeType: string): MediaType {
    if (mimeType.startsWith('image/')) {
      return MediaType.IMAGE;
    } else if (mimeType.startsWith('video/')) {
      return MediaType.VIDEO;
    }
    throw new BadRequestException('Unsupported media type');
  }

  /**
   * Get MIME type from file
   */
  private getMimeType(fileName: string, fileBuffer: Buffer): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    // Image MIME types
    const imageMimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp'
    };

    // Video MIME types
    const videoMimeTypes = {
      'mp4': 'video/mp4',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',
      'webm': 'video/webm'
    };

    const mimeType = imageMimeTypes[extension] || videoMimeTypes[extension];
    
    if (!mimeType) {
      throw new BadRequestException(`Unsupported file extension: ${extension}`);
    }

    return mimeType;
  }

  /**
   * Check if file type is allowed
   */
  private isAllowedFileType(mimeType: string): boolean {
    const allowedTypes = [
      // Images
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      // Videos
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'video/webm'
    ];

    return allowedTypes.includes(mimeType);
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

  /**
   * Transform gallery item to response DTO
   */
  private transformGalleryItemToResponse(item: any, uploader: any): ProjectGalleryItemResponseDto {
    return {
      id: item._id.toString(),
      appProjectId: item.appProjectId,
      uploader: {
        id: uploader._id?.toString() || uploader.toString(),
        name: uploader.name ? `${uploader.name} ${uploader.surname || ''}`.trim() : 'Unknown User',
        email: uploader.email || ''
      },
      fileName: item.fileName,
      fileUrl: item.fileUrl,
      fileSize: item.fileSize,
      fileSizeFormatted: this.formatFileSize(item.fileSize),
      mimeType: item.mimeType,
      mediaType: item.mediaType,
      category: item.category,
      description: item.description,
      duration: item.duration,
      thumbnailUrl: item.thumbnailUrl,
      width: item.width,
      height: item.height,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      fileExtension: item.fileName.split('.').pop()?.toLowerCase(),
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