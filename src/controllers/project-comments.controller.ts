// src/controllers/project-comments.controller.ts
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
  import { ProjectCommentsService } from '../services/project-comments.service';
  import { BusinessService } from '../services/business.service';
  import { AppProject } from '../schemas/app-project.schema';
  import {
    CreateProjectCommentDto,
    UpdateProjectCommentDto,
    ProjectCommentResponseDto,
    ProjectCommentsListResponseDto,
    CommentActionResponseDto,
    UploadCommentImageDto
  } from '../dtos/project-comment.dto';
  
  @ApiTags('Project Comments')
  @Controller('projects/:projectId/comments')
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class ProjectCommentsController {
    private readonly logger = new Logger(ProjectCommentsController.name);
  
    constructor(
      private readonly projectCommentsService: ProjectCommentsService,
      private readonly businessService: BusinessService
    ) {}
  
    @Get()
    @ApiOperation({ summary: 'Get all comments for a project' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiQuery({ name: 'page', description: 'Page number', required: false, example: 1 })
    @ApiQuery({ name: 'limit', description: 'Comments per page', required: false, example: 20 })
    @ApiQuery({ name: 'parentOnly', description: 'Get only top-level comments', required: false, example: false })
    @ApiResponse({
      status: 200,
      description: 'Returns project comments with pagination',
      type: ProjectCommentsListResponseDto
    })
    async getProjectComments(
      @Param('projectId') projectId: string,
      @Query('page') page?: number,
      @Query('limit') limit?: number,
      @Query('parentOnly') parentOnly?: boolean,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ProjectCommentsListResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID for audit logging
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        return this.projectCommentsService.getProjectComments(
          projectId,
          {
            page: page ? parseInt(page.toString()) : 1,
            limit: limit ? parseInt(limit.toString()) : 20,
            // @ts-ignore
            parentOnly: parentOnly === true || parentOnly === 'true'
          },
          adminUserId,
          req
        );
      } catch (error) {
        this.logger.error(`Error getting project comments: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Post()
    @ApiOperation({ summary: 'Create a new comment on the project' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiBody({ type: CreateProjectCommentDto, description: 'Comment details' })
    @ApiResponse({
      status: 201,
      description: 'Comment created successfully',
      type: CommentActionResponseDto
    })
    async createComment(
      @Param('projectId') projectId: string,
      @Body() createCommentDto: CreateProjectCommentDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<CommentActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const comment = await this.projectCommentsService.createComment(
          projectId,
          createCommentDto,
          adminUserId, // For now, admin is the author
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Comment created successfully',
          comment
        };
      } catch (error) {
        this.logger.error(`Error creating comment: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to create comment');
      }
    }
  
    @Post('upload-image')
    @UseInterceptors(FileInterceptor('image'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Create a comment with image attachment' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiBody({
      description: 'Comment with image',
      schema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'Comment text content',
            example: 'Here is a photo of the completed work'
          },
          parentCommentId: {
            type: 'string',
            description: 'Parent comment ID for replies',
            example: '507f1f77bcf86cd799439011'
          },
          image: {
            type: 'string',
            format: 'binary',
            description: 'Image file to attach'
          }
        }
      }
    })
    @ApiResponse({
      status: 201,
      description: 'Comment with image created successfully',
      type: CommentActionResponseDto
    })
    async createCommentWithImage(
      @Param('projectId') projectId: string,
      @Body() body: { content: string; parentCommentId?: string; metadata?: Record<string, any> },
      @UploadedFile() file: Express.Multer.File,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<CommentActionResponseDto> {
      try {
        if (!file) {
          throw new BadRequestException('Image file is required');
        }
  
        if (!body.content) {
          throw new BadRequestException('Comment content is required');
        }
  
        // Validate file type (images only)
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
          throw new BadRequestException('Only image files (JPEG, PNG, GIF, WebP) are allowed');
        }
  
        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
          throw new BadRequestException('Image file size cannot exceed 10MB');
        }
  
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const comment = await this.projectCommentsService.createCommentWithImage(
          projectId,
          body.content,
          file.buffer,
          file.originalname,
          adminUserId, // For now, admin is the author
          body.parentCommentId,
          body.metadata,
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Comment with image created successfully',
          comment
        };
      } catch (error) {
        this.logger.error(`Error creating comment with image: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || 
            error instanceof NotFoundException || 
            error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to create comment with image');
      }
    }
  
    @Get(':commentId/replies')
    @ApiOperation({ summary: 'Get replies for a specific comment' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'commentId', description: 'Comment ID to get replies for' })
    @ApiQuery({ name: 'page', description: 'Page number', required: false, example: 1 })
    @ApiQuery({ name: 'limit', description: 'Replies per page', required: false, example: 10 })
    @ApiResponse({
      status: 200,
      description: 'Returns comment replies',
      type: [ProjectCommentResponseDto]
    })
    async getCommentReplies(
      @Param('projectId') projectId: string,
      @Param('commentId') commentId: string,
      @Query('page') page?: number,
      @Query('limit') limit?: number,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ProjectCommentResponseDto[]> {
      try {
        await this.validateProjectAccess(projectId, apiKey);
  
        return this.projectCommentsService.getCommentReplies(
          projectId,
          commentId,
          page ? parseInt(page.toString()) : 1,
          limit ? parseInt(limit.toString()) : 10
        );
      } catch (error) {
        this.logger.error(`Error getting comment replies: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Put(':commentId')
    @ApiOperation({ summary: 'Update a comment' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'commentId', description: 'Comment ID to update' })
    @ApiBody({ type: UpdateProjectCommentDto, description: 'Updated comment details' })
    @ApiResponse({
      status: 200,
      description: 'Comment updated successfully',
      type: CommentActionResponseDto
    })
    async updateComment(
      @Param('projectId') projectId: string,
      @Param('commentId') commentId: string,
      @Body() updateCommentDto: UpdateProjectCommentDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<CommentActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const comment = await this.projectCommentsService.updateComment(
          projectId,
          commentId,
          updateCommentDto,
          adminUserId, // For now, admin is the editor
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Comment updated successfully',
          comment
        };
      } catch (error) {
        this.logger.error(`Error updating comment: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Delete(':commentId')
    @ApiOperation({ summary: 'Delete a comment' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'commentId', description: 'Comment ID to delete' })
    @ApiResponse({
      status: 200,
      description: 'Comment deleted successfully',
      type: CommentActionResponseDto
    })
    async deleteComment(
      @Param('projectId') projectId: string,
      @Param('commentId') commentId: string,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<CommentActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const result = await this.projectCommentsService.deleteComment(
          projectId,
          commentId,
          adminUserId, // For now, admin is the deleter
          adminUserId,
          req
        );
  
        return {
          success: result.success,
          message: result.message
        };
      } catch (error) {
        this.logger.error(`Error deleting comment: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Get('stats')
    @ApiOperation({ summary: 'Get comment statistics for the project' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiResponse({
      status: 200,
      description: 'Returns comment statistics',
      schema: {
        type: 'object',
        properties: {
          totalComments: { type: 'number', example: 45 },
          totalReplies: { type: 'number', example: 12 },
          commentsWithImages: { type: 'number', example: 8 },
          topCommenters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                userId: { type: 'string' },
                userName: { type: 'string' },
                commentCount: { type: 'number' }
              }
            }
          },
          recentActivity: { type: 'string', format: 'date-time' },
          commentsToday: { type: 'number', example: 3 },
          commentsThisWeek: { type: 'number', example: 15 }
        }
      }
    })
    async getCommentStats(
      @Param('projectId') projectId: string,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<any> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        // Get business and admin user ID for audit logging
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        return this.projectCommentsService.getProjectCommentStats(
          projectId,
          adminUserId,
          req
        );
      } catch (error) {
        this.logger.error(`Error getting comment stats: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    // HELPER METHODS
    private async validateProjectAccess(projectId: string, apiKey: string): Promise<AppProject> {
      if (!apiKey) {
        throw new UnauthorizedException('Business API key missing');
      }
  
      const project = await this.projectCommentsService.getProjectById(projectId);
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