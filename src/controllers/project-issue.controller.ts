// src/controllers/project-issue.controller.ts
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
    UploadedFiles,
    UseInterceptors,
    BadRequestException
  } from '@nestjs/common';
  import { FilesInterceptor } from '@nestjs/platform-express';
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
  import { ProjectIssueService } from '../services/project-issue.service';
  import { BusinessService } from '../services/business.service';
  import { AppProject } from '../schemas/app-project.schema';
  import { IssuePriority, IssueStatus, IssueCategory } from '../schemas/project-issue.schema';
  import {
    CreateProjectIssueDto,
    UpdateProjectIssueDto,
    ProjectIssueResponseDto,
    ProjectIssuesListResponseDto,
    IssueActionResponseDto
  } from '../dtos/project-issue.dto';
  
  @ApiTags('Project Issues')
  @Controller('projects/:projectId/issues')
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class ProjectIssueController {
    private readonly logger = new Logger(ProjectIssueController.name);
  
    constructor(
      private readonly projectIssueService: ProjectIssueService,
      private readonly businessService: BusinessService
    ) {}
  
    @Get()
    @ApiOperation({ summary: 'Get project issues' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiQuery({ name: 'page', description: 'Page number', required: false, example: 1 })
    @ApiQuery({ name: 'limit', description: 'Issues per page', required: false, example: 20 })
    @ApiQuery({ name: 'status', description: 'Filter by status', required: false, enum: IssueStatus })
    @ApiQuery({ name: 'priority', description: 'Filter by priority', required: false, enum: IssuePriority })
    @ApiQuery({ name: 'category', description: 'Filter by category', required: false, enum: IssueCategory })
    @ApiQuery({ name: 'assignedTo', description: 'Filter by assigned user ID', required: false })
    @ApiResponse({
      status: 200,
      description: 'Returns project issues with pagination',
      type: ProjectIssuesListResponseDto
    })
    async getProjectIssues(
      @Param('projectId') projectId: string,
      @Query('page') page?: number,
      @Query('limit') limit?: number,
      @Query('status') status?: IssueStatus,
      @Query('priority') priority?: IssuePriority,
      @Query('category') category?: IssueCategory,
      @Query('assignedTo') assignedTo?: string,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ProjectIssuesListResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        return this.projectIssueService.getProjectIssues(
          projectId,
          {
            page: page ? parseInt(page.toString()) : 1,
            limit: limit ? parseInt(limit.toString()) : 20,
            status,
            priority,
            category,
            assignedTo
          },
          adminUserId,
          req
        );
      } catch (error) {
        this.logger.error(`Error getting project issues: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Post()
    @ApiOperation({ summary: 'Report a new issue' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiBody({ type: CreateProjectIssueDto, description: 'Issue details' })
    @ApiResponse({
      status: 201,
      description: 'Issue reported successfully',
      type: IssueActionResponseDto
    })
    async reportIssue(
      @Param('projectId') projectId: string,
      @Body() createIssueDto: CreateProjectIssueDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<IssueActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const issue = await this.projectIssueService.reportIssue(
          projectId,
          createIssueDto,
          adminUserId,
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Issue reported successfully',
          issue
        };
      } catch (error) {
        this.logger.error(`Error reporting issue: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to report issue');
      }
    }
  
    @Post('upload-photos')
    @UseInterceptors(FilesInterceptor('photos', 5))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Report issue with photo attachments' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiResponse({
      status: 201,
      description: 'Issue with photos reported successfully',
      type: IssueActionResponseDto
    })
    async reportIssueWithPhotos(
      @Param('projectId') projectId: string,
      @Body() body: {
        title: string;
        description: string;
        priority: IssuePriority;
        category: IssueCategory;
        location?: string;
        assignedTo?: string;
        dueDate?: string;
        estimatedCost?: number;
        timeImpact?: number;
        tags?: string[];
      },
      @UploadedFiles() files: Express.Multer.File[],
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<IssueActionResponseDto> {
      try {
        if (!files || files.length === 0) {
          throw new BadRequestException('At least one photo is required');
        }
  
        if (!body.title || !body.description || !body.priority || !body.category) {
          throw new BadRequestException('Title, description, priority, and category are required');
        }
  
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const createIssueDto: CreateProjectIssueDto = {
          title: body.title,
          description: body.description,
          priority: body.priority,
          category: body.category,
          location: body.location,
          assignedTo: body.assignedTo,
          dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
          estimatedCost: body.estimatedCost,
          timeImpact: body.timeImpact,
          tags: body.tags
        };
  
        const issue = await this.projectIssueService.reportIssueWithPhotos(
          projectId,
          createIssueDto,
          files,
          adminUserId,
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Issue with photos reported successfully',
          issue
        };
      } catch (error) {
        this.logger.error(`Error reporting issue with photos: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to report issue with photos');
      }
    }
  
    @Get(':issueId')
    @ApiOperation({ summary: 'Get a specific issue' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'issueId', description: 'Issue ID' })
    @ApiResponse({
      status: 200,
      description: 'Returns issue details',
      type: ProjectIssueResponseDto
    })
    async getIssue(
      @Param('projectId') projectId: string,
      @Param('issueId') issueId: string,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<ProjectIssueResponseDto> {
      try {
        await this.validateProjectAccess(projectId, apiKey);
  
        return this.projectIssueService.getIssue(projectId, issueId);
      } catch (error) {
        this.logger.error(`Error getting issue: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Put(':issueId')
    @ApiOperation({ summary: 'Update an issue' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'issueId', description: 'Issue ID' })
    @ApiBody({ type: UpdateProjectIssueDto, description: 'Updated issue details' })
    @ApiResponse({
      status: 200,
      description: 'Issue updated successfully',
      type: IssueActionResponseDto
    })
    async updateIssue(
      @Param('projectId') projectId: string,
      @Param('issueId') issueId: string,
      @Body() updateDto: UpdateProjectIssueDto,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<IssueActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const issue = await this.projectIssueService.updateIssue(
          projectId,
          issueId,
          updateDto,
          adminUserId,
          adminUserId,
          req
        );
  
        return {
          success: true,
          message: 'Issue updated successfully',
          issue
        };
      } catch (error) {
        this.logger.error(`Error updating issue: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Delete(':issueId')
    @ApiOperation({ summary: 'Delete an issue' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'issueId', description: 'Issue ID' })
    @ApiResponse({
      status: 200,
      description: 'Issue deleted successfully',
      type: IssueActionResponseDto
    })
    async deleteIssue(
      @Param('projectId') projectId: string,
      @Param('issueId') issueId: string,
      @Headers('business-x-api-key') apiKey?: string,
      @Req() req?: any
    ): Promise<IssueActionResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
  
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
  
        const result = await this.projectIssueService.deleteIssue(
          projectId,
          issueId,
          adminUserId,
          adminUserId,
          req
        );
  
        return {
          success: result.success,
          message: result.message
        };
      } catch (error) {
        this.logger.error(`Error deleting issue: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    // HELPER METHODS
    private async validateProjectAccess(projectId: string, apiKey: string): Promise<AppProject> {
      if (!apiKey) {
        throw new UnauthorizedException('Business API key missing');
      }
  
      const project = await this.projectIssueService.getProjectById(projectId);
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