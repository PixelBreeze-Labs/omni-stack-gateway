// src/controllers/project-assignment.controller.ts
import { 
    Controller, 
    Get, 
    Post, 
    Delete, 
    Body, 
    Param, 
    Headers, 
    UnauthorizedException, 
    NotFoundException, 
    Logger, 
    InternalServerErrorException, 
    Put,
    Req
  } from '@nestjs/common';
  import { 
    ApiTags, 
    ApiOperation, 
    ApiHeader, 
    ApiParam, 
    ApiBody, 
    ApiResponse
  } from '@nestjs/swagger';
  import { ProjectAssignmentService } from '../services/project-assignment.service';
  import { BusinessService } from '../services/business.service';
  import { AppProject } from '../schemas/app-project.schema';
  import {
    AssignUserToProjectDto,
    AssignTeamToProjectDto,
    UpdateUserAssignmentDto,
    UpdateTeamAssignmentDto,
    BulkAssignUsersToProjectDto,
    ProjectAssignmentResponseDto,
    AssignmentSuccessResponseDto,
    AssignmentStatsResponseDto
  } from '../dtos/project-assignment.dto';
  
  @ApiTags('Project Assignment')
  @Controller('projects/:projectId/assignments')
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class ProjectAssignmentController {
    private readonly logger = new Logger(ProjectAssignmentController.name);
  
    constructor(
      private readonly projectAssignmentService: ProjectAssignmentService,
      private readonly businessService: BusinessService
    ) {}
  
    @Get()
    @ApiOperation({ summary: 'Get all assignments for a project' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiResponse({ 
      status: 200, 
      description: 'Returns project assignments',
      type: ProjectAssignmentResponseDto 
    })
    async getProjectAssignments(
      @Param('projectId') projectId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Req() req?: any
    ): Promise<ProjectAssignmentResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
        
        // Get business and admin user ID for audit logging
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
        
        return this.projectAssignmentService.getProjectAssignments(
          projectId,
          adminUserId,
          req
        );
      } catch (error) {
        this.logger.error(`Error getting project assignments: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Post('users')
    @ApiOperation({ summary: 'Assign a user to the project' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiBody({ type: AssignUserToProjectDto, description: 'User assignment details' })
    @ApiResponse({ 
      status: 200, 
      description: 'User assigned successfully',
      type: AssignmentSuccessResponseDto 
    })
    async assignUserToProject(
      @Param('projectId') projectId: string,
      @Body() assignUserDto: AssignUserToProjectDto,
      @Headers('business-x-api-key') apiKey: string,
      @Req() req?: any
    ): Promise<AssignmentSuccessResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
        
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
        
        const result = await this.projectAssignmentService.assignUserToProject(
          projectId,
          assignUserDto.userId,
          assignUserDto.role,
          assignUserDto.metadata,
          adminUserId, // Who assigned
          adminUserId, // Admin user for audit logging
          req, // Request for IP/UserAgent
          business._id // Business ID for audit logging
        );
        
        return {
          success: true,
          message: 'User assigned to project successfully',
          assignment: result
        };
      } catch (error) {
        this.logger.error(`Error assigning user to project: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to assign user to project');
      }
    }
  
    @Post('teams')
    @ApiOperation({ summary: 'Assign a team to the project' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiBody({ type: AssignTeamToProjectDto, description: 'Team assignment details' })
    @ApiResponse({ 
      status: 200, 
      description: 'Team assigned successfully',
      type: AssignmentSuccessResponseDto 
    })
    async assignTeamToProject(
      @Param('projectId') projectId: string,
      @Body() assignTeamDto: AssignTeamToProjectDto,
      @Headers('business-x-api-key') apiKey: string,
      @Req() req?: any
    ): Promise<AssignmentSuccessResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
        
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
        
        const result = await this.projectAssignmentService.assignTeamToProject(
          projectId,
          assignTeamDto.teamId,
          assignTeamDto.role,
          assignTeamDto.metadata,
          adminUserId, // Who assigned
          adminUserId, // Admin user for audit logging
          req, // Request for IP/UserAgent,
          business._id,
        );
        
        return {
          success: true,
          message: 'Team assigned to project successfully',
          assignment: result
        };
      } catch (error) {
        this.logger.error(`Error assigning team to project: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to assign team to project');
      }
    }
  
    @Delete('users/:userId')
    @ApiOperation({ summary: 'Unassign a user from the project' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'userId', description: 'User ID to unassign' })
    @ApiResponse({ 
      status: 200, 
      description: 'User unassigned successfully',
      type: AssignmentSuccessResponseDto 
    })
    async unassignUserFromProject(
      @Param('projectId') projectId: string,
      @Param('userId') userId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Req() req?: any
    ): Promise<AssignmentSuccessResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
        
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
        
        await this.projectAssignmentService.unassignUserFromProject(
          projectId, 
          userId,
          adminUserId,
          req
        );
        
        return {
          success: true,
          message: 'User unassigned from project successfully'
        };
      } catch (error) {
        this.logger.error(`Error unassigning user from project: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to unassign user from project');
      }
    }
  
    @Delete('teams/:teamId')
    @ApiOperation({ summary: 'Unassign a team from the project' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'teamId', description: 'Team ID to unassign' })
    @ApiResponse({ 
      status: 200, 
      description: 'Team unassigned successfully',
      type: AssignmentSuccessResponseDto 
    })
    async unassignTeamFromProject(
      @Param('projectId') projectId: string,
      @Param('teamId') teamId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Req() req?: any
    ): Promise<AssignmentSuccessResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
        
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
        
        await this.projectAssignmentService.unassignTeamFromProject(
          projectId, 
          teamId,
          adminUserId,
          req
        );
        
        return {
          success: true,
          message: 'Team unassigned from project successfully'
        };
      } catch (error) {
        this.logger.error(`Error unassigning team from project: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to unassign team from project');
      }
    }
  
    @Put('users/:userId')
    @ApiOperation({ summary: 'Update user assignment details' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'userId', description: 'User ID' })
    @ApiBody({ type: UpdateUserAssignmentDto, description: 'Updated assignment details' })
    @ApiResponse({ 
      status: 200, 
      description: 'User assignment updated successfully',
      type: AssignmentSuccessResponseDto 
    })
    async updateUserAssignment(
      @Param('projectId') projectId: string,
      @Param('userId') userId: string,
      @Body() updateData: UpdateUserAssignmentDto,
      @Headers('business-x-api-key') apiKey: string,
      @Req() req?: any
    ): Promise<AssignmentSuccessResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
        
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
        
        const result = await this.projectAssignmentService.updateUserAssignment(
          projectId,
          userId,
          updateData,
          adminUserId,
          req
        );
        
        return {
          success: true,
          message: 'User assignment updated successfully',
          assignment: result
        };
      } catch (error) {
        this.logger.error(`Error updating user assignment: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Put('teams/:teamId')
    @ApiOperation({ summary: 'Update team assignment details' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiParam({ name: 'teamId', description: 'Team ID' })
    @ApiBody({ type: UpdateTeamAssignmentDto, description: 'Updated team assignment details' })
    @ApiResponse({ 
      status: 200, 
      description: 'Team assignment updated successfully',
      type: AssignmentSuccessResponseDto 
    })
    async updateTeamAssignment(
      @Param('projectId') projectId: string,
      @Param('teamId') teamId: string,
      @Body() updateData: UpdateTeamAssignmentDto,
      @Headers('business-x-api-key') apiKey: string,
      @Req() req?: any
    ): Promise<AssignmentSuccessResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
        
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
        
        const result = await this.projectAssignmentService.updateTeamAssignment(
          projectId,
          teamId,
          updateData,
          adminUserId,
          req
        );
        
        return {
          success: true,
          message: 'Team assignment updated successfully',
          assignment: result
        };
      } catch (error) {
        this.logger.error(`Error updating team assignment: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Post('users/bulk')
    @ApiOperation({ summary: 'Bulk assign multiple users to the project' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiBody({ type: BulkAssignUsersToProjectDto, description: 'Bulk user assignment details' })
    @ApiResponse({ 
      status: 200, 
      description: 'Users assigned successfully',
      type: AssignmentSuccessResponseDto 
    })
    async bulkAssignUsersToProject(
      @Param('projectId') projectId: string,
      @Body() bulkAssignDto: BulkAssignUsersToProjectDto,
      @Headers('business-x-api-key') apiKey: string,
      @Req() req?: any
    ): Promise<AssignmentSuccessResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
        
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
        
        const results = await this.projectAssignmentService.bulkAssignUsersToProject(
          projectId,
          bulkAssignDto.userAssignments,
          adminUserId,
          adminUserId,
          req
        );
        
        return {
          success: true,
          message: `Successfully assigned ${results.length} users to project`,
          assignment: results
        };
      } catch (error) {
        this.logger.error(`Error in bulk assign users: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Get('stats')
    @ApiOperation({ summary: 'Get project assignment statistics' })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiResponse({ 
      status: 200, 
      description: 'Returns assignment statistics',
      type: AssignmentStatsResponseDto 
    })
    async getProjectAssignmentStats(
      @Param('projectId') projectId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Req() req?: any
    ): Promise<AssignmentStatsResponseDto> {
      try {
        const project = await this.validateProjectAccess(projectId, apiKey);
        
        // Get business and admin user ID
        const business = await this.businessService.findByIdAndApiKey(project.businessId, apiKey);
        const adminUserId = business.adminUserId;
        
        return this.projectAssignmentService.getProjectAssignmentStats(
          projectId,
          adminUserId,
          req
        );
      } catch (error) {
        this.logger.error(`Error getting assignment stats: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    // INTERNAL ENDPOINTS (NO AUDIT LOGGING)
    @Get('user/:userId/projects')
    @ApiOperation({ summary: 'Get all projects assigned to a specific user (Internal)' })
    @ApiParam({ name: 'userId', description: 'User ID' })
    @ApiResponse({ 
      status: 200, 
      description: 'Returns projects assigned to user',
      type: [Object] 
    })
    async getUserProjects(
      @Param('userId') userId: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<{ projects: AppProject[]; count: number }> {
      try {
        
        const projects = await this.projectAssignmentService.getUserProjects(userId);
        
        return {
          projects,
          count: projects.length
        };
      } catch (error) {
        this.logger.error(`Error getting user projects: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    @Get('team/:teamId/projects')
    @ApiOperation({ summary: 'Get all projects assigned to a specific team (Internal)' })
    @ApiParam({ name: 'teamId', description: 'Team ID' })
    @ApiResponse({ 
      status: 200, 
      description: 'Returns projects assigned to team',
      type: [Object] 
    })
    async getTeamProjects(
      @Param('teamId') teamId: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<{ projects: AppProject[]; count: number }> {
      try {
        const projects = await this.projectAssignmentService.getTeamProjects(teamId);
        
        return {
          projects,
          count: projects.length
        };
      } catch (error) {
        this.logger.error(`Error getting team projects: ${error.message}`, error.stack);
        throw error;
      }
    }
  
    // HELPER METHODS
    private async validateProjectAccess(projectId: string, apiKey: string) {
      if (!apiKey) {
        throw new UnauthorizedException('Business API key missing');
      }
      
      const project = await this.projectAssignmentService.getProjectById(projectId);
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