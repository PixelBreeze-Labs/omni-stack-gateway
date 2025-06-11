// src/controllers/project-gallery.controller.ts
import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    Headers,
    UnauthorizedException,
    NotFoundException,
    Logger,
    InternalServerErrorException,
    Req,
    UploadedFile,
    UseInterceptors,
    BadRequestException
  } from '@nestjs/common';
  import { FileInterceptor } from '@nestjs/platform-express';
  import {
    ApiTags,
    ApiOperation,
    ApiHeader,
    ApiParam,
    ApiBody,
    ApiResponse,
    ApiQuery,
    ApiConsumes
  } from '@nestjs/swagger';
  import { ProjectGalleryService } from '../services/project-gallery.service';
  import { BusinessService } from '../services/business.service';
  import { AppProject } from '../schemas/app-project.schema';
  import { GalleryCategory, MediaType } from '../schemas/project-gallery.schema';
  import {
    UploadGalleryItemDto,
    UpdateGalleryItemDto,
    ProjectGalleryItemResponseDto,
    ProjectGalleryListResponseDto,
    GalleryActionResponseDto
  } from '../dtos/project-gallery.dto';
  
  @ApiTags('Project Gallery')
  @Controller('projects/:projectId/gallery')
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class ProjectGalleryController {
    private readonly logger = new Logger(ProjectGalleryController.name);
  
    constructor(
      private readonly projectGalleryService: ProjectGalleryService,
      private readonly businessService: BusinessService
    ) {}
  
    @Get()
    @ApiOperation({ summary: 'Get project gallery items' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiQuery({ name: 'page', description: 'Page number', required: false, example: 1 })
    @ApiQuery({ name: 'limit', description: 'Items per page', required: false, example: 20 })
    @ApiQuery({ name: 'category', description: 'Filter by category', required: false, enum: GalleryCategory })
    @ApiQuery({ name: 'mediaType', description: 'Filter by media type', required: false, enum: MediaType })
    @ApiResponse({
      status: 200,
      description: 'Returns project gallery items with pagination',
      type: ProjectGalleryListResponseDto
    })
    async getProjectGallery(
      @Param('projectId') projectId: string,
      @Query('page') page?: number,
      @Query('limit') limit?: number,
      @Query('category') category?: GalleryCategory,
      @Query('mediaType') mediaType?: MediaType,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ProjectGalleryListResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID for audit logging
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        return this.projectGalleryService.getProjectGallery(
          projectId,
          {
            page: page ? parseInt(page.toString()) : 1,
            limit: limit ? parseInt(limit.toString()) : 20,
            category,
            mediaType
          },
          adminUserId,
          req
        );
      } catch (error) {
        this.logger.error(`Error getting project gallery: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Upload media to project gallery' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiBody({
      description: 'Media upload with metadata',
      schema: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: 'Media file (image or video)'
          },
          category: {
            type: 'string',
            enum: Object.values(GalleryCategory),
            description: 'Gallery category',
            example: GalleryCategory.PROGRESS
          },
          description: {
            type: 'string',
            description: 'Optional description',
            example: 'Foundation work completed'
          },
          location: {
            type: 'string',
            description: 'Location where media was captured',
            example: 'Building A, Floor 2'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags for the media',
            example: ['foundation', 'concrete']
          }
        },
        required: ['file', 'category']
      }
    })
    @ApiResponse({
      status: 201,
      description: 'Media uploaded successfully',
      type: GalleryActionResponseDto
    })
    async uploadMedia(
      @Param('projectId') projectId: string,
      @Body() body: {
        category: GalleryCategory;
        description?: string;
        location?: string;
        tags?: string[];
        metadata?: Record<string, any>;
      },
      @UploadedFile() file: Express.Multer.File,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<GalleryActionResponseDto> {
      try {
        if (!file) {
          throw new BadRequestException('Media file is required');
        }
  
        if (!body.category) {
          throw new BadRequestException('Category is required');
        }
  
        // Validate file type
        const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        const allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
        const allowedTypes = [...allowedImageTypes, ...allowedVideoTypes];
  
        if (!allowedTypes.includes(file.mimetype)) {
          throw new BadRequestException('Only image and video files are allowed (JPEG, PNG, GIF, WebP, MP4, MOV, AVI, WebM)');
        }
  
        // Validate file size (max 100MB for videos, 10MB for images)
        const isVideo = allowedVideoTypes.includes(file.mimetype);
        const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024; // 100MB for video, 10MB for image
  
        if (file.size > maxSize) {
          const maxSizeFormatted = isVideo ? '100MB' : '10MB';
          throw new BadRequestException(`File size cannot exceed ${maxSizeFormatted}`);
        }
  
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const uploadDto: UploadGalleryItemDto = {
          category: body.category,
          description: body.description,
          location: body.location,
          tags: body.tags,
          metadata: body.metadata
        };
  
        const galleryItem = await this.projectGalleryService.uploadMedia(
          projectId,
          file.buffer,
          file.originalname,
          uploadDto,
          adminUserId, // For now, admin is the uploader
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Media uploaded successfully',
          item: galleryItem
        };
      } catch (error) {
        this.logger.error(`Error uploading media: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || 
            error instanceof NotFoundException || 
            error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to upload media');
      }
    }
  
    @Get(':itemId')
    @ApiOperation({ summary: 'Get a specific gallery item' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'itemId', description: 'Gallery item ID' })
    @ApiResponse({
      status: 200,
      description: 'Returns gallery item details',
      type: ProjectGalleryItemResponseDto
    })
    async getGalleryItem(
      @Param('projectId') projectId: string,
      @Param('itemId') itemId: string,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ProjectGalleryItemResponseDto> {
      try {
        await this.validateProjectAccess(projectId, apiKey);
  
        return this.projectGalleryService.getGalleryItem(projectId, itemId);
      } catch (error) {
        this.logger.error(`Error getting gallery item: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Put(':itemId')
    @ApiOperation({ summary: 'Update gallery item metadata' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'itemId', description: 'Gallery item ID' })
    @ApiBody({ type: UpdateGalleryItemDto, description: 'Updated gallery item details' })
    @ApiResponse({
      status: 200,
      description: 'Gallery item updated successfully',
      type: GalleryActionResponseDto
    })
    async updateGalleryItem(
      @Param('projectId') projectId: string,
      @Param('itemId') itemId: string,
      @Body() updateDto: UpdateGalleryItemDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<GalleryActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const galleryItem = await this.projectGalleryService.updateGalleryItem(
          projectId,
          itemId,
          updateDto,
          adminUserId, // For now, admin is the editor
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Gallery item updated successfully',
          item: galleryItem
        };
      } catch (error) {
        this.logger.error(`Error updating gallery item: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Delete(':itemId')
    @ApiOperation({ summary: 'Delete gallery item' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'itemId', description: 'Gallery item ID' })
    @ApiResponse({
      status: 200,
      description: 'Gallery item deleted successfully',
      type: GalleryActionResponseDto
    })
    async deleteGalleryItem(
      @Param('projectId') projectId: string,
      @Param('itemId') itemId: string,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<GalleryActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const result = await this.projectGalleryService.deleteGalleryItem(
          projectId,
          itemId,
          adminUserId, // For now, admin is the deleter
          adminUserId,
          req
        );
  
        return {
          success: result.success,
          message: result.message
        };
      } catch (error) {
        this.logger.error(`Error deleting gallery item: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    // HELPER METHODS
    private async validateProjectAccess(projectId: string, apiKey: string): Promise<AppProject> {
      if (!apiKey) {
        throw new UnauthorizedException('Business API key missing');
      }
  
      const project = await this.projectGalleryService.getProjectById(projectId);
      if (!project) {
        throw new NotFoundException('Project not found');
      }
  
      const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
      if (!business) {
        throw new UnauthorizedException('Invalid API key for this business');
      }
  
      return project;
    }
  }