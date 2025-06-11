// src/services/project-assignment.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppProject } from '../schemas/app-project.schema';
import { Business } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import { AuditLogService } from './audit-log.service';
import { AppActivityService } from './app-activity.service';
import { AuditAction, AuditSeverity, ResourceType } from '../schemas/audit-log.schema';
import { ActivityType } from '../schemas/app-activity.schema';

interface UserAssignment {
  userId: string;
  role?: string;
  assignedAt: Date;
  assignedBy: string;
  isActive: boolean;
  metadata?: Record<string, any>;
}

interface TeamAssignment {
  teamId: string;
  teamName: string;
  assignedAt: Date;
  assignedBy: string;
  isActive: boolean;
  role?: string;
  metadata?: Record<string, any>;
}

interface ProjectAssignmentResponse {
  projectId: string;
  assignedUsers: Array<{
    userId: string;
    userName: string;
    userEmail: string;
    role?: string;
    assignedAt: Date;
    isActive: boolean;
    metadata?: Record<string, any>;
  }>;
  assignedTeams: Array<{
    teamId: string;
    teamName: string;
    role?: string;
    assignedAt: Date;
    isActive: boolean;
    metadata?: Record<string, any>;
  }>;
  summary: {
    totalUsers: number;
    totalTeams: number;
    projectManager?: any;
    teamLeaders: any[];
    lastUpdated: Date;
  };
}

@Injectable()
export class ProjectAssignmentService {
  private readonly logger = new Logger(ProjectAssignmentService.name);

  constructor(
    @InjectModel(AppProject.name) private appProjectModel: Model<AppProject>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly auditLogService: AuditLogService,
    private readonly appActivityService: AppActivityService
  ) {}

  /**
   * Get project by ID
   */
  async getProjectById(projectId: string): Promise<AppProject | null> {
    try {
      return await this.appProjectModel.findById(projectId).exec();
    } catch (error) {
      this.logger.error(`Error finding project ${projectId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all assignments for a project with detailed information
   */
  async getProjectAssignments(
    projectId: string,
    adminUserId?: string,
    req?: any
  ): Promise<ProjectAssignmentResponse> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');

    try {
      const project = await this.appProjectModel.findById(projectId).exec();
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      // Get user details for all assigned users
      const userDetails = await this.userModel
        .find({ _id: { $in: project.assignedUsers } })
        .select('_id name surname email')
        .exec();

      // Map user assignments with details
      const assignedUsers = project.userAssignments
        .filter(assignment => assignment.isActive)
        .map(assignment => {
          const user = userDetails.find(u => u._id.toString() === assignment.userId);
          return {
            userId: assignment.userId,
            userName: user ? `${user.name} ${user.surname}`.trim() : 'Unknown User',
            userEmail: user?.email || '',
            role: assignment.role,
            assignedAt: assignment.assignedAt,
            isActive: assignment.isActive,
            metadata: assignment.metadata || {}
          };
        });

      // Map team assignments
      const assignedTeams = project.teamAssignments
        .filter(assignment => assignment.isActive)
        .map(assignment => ({
          teamId: assignment.teamId,
          teamName: assignment.teamName,
          role: assignment.role,
          assignedAt: assignment.assignedAt,
          isActive: assignment.isActive,
          metadata: assignment.metadata || {}
        }));

      // Generate summary
      const projectManager = assignedUsers.find(user => user.role === 'project_manager');
      const teamLeaders = assignedUsers.filter(user => user.role === 'team_leader');

      // 🎯 AUDIT LOG - Business viewing assignments (security/compliance)
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_ASSIGNMENTS_VIEWED,
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
            assignedUsersCount: assignedUsers.length,
            assignedTeamsCount: assignedTeams.length,
            hasProjectManager: !!projectManager,
            teamLeadersCount: teamLeaders.length
          }
        });
      }

      return {
        projectId: project._id.toString(),
        assignedUsers,
        assignedTeams,
        summary: {
          totalUsers: assignedUsers.length,
          totalTeams: assignedTeams.length,
          projectManager,
          teamLeaders,
          lastUpdated: project.updatedAt || project.createdAt
        }
      };
    } catch (error) {
      this.logger.error(`Error getting project assignments: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Assign a user to a project
   */
  async assignUserToProject(
    projectId: string,
    userId: string,
    role?: string,
    metadata?: Record<string, any>,
    assignedBy?: string,
    adminUserId?: string,
    req?: any,
    businessId?: string | undefined | any
  ): Promise<UserAssignment> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      const project = await this.appProjectModel.findById(projectId).exec();
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      // Verify user exists
      const user = await this.userModel.findById(userId).exec();
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Check if user is already assigned
      const existingAssignment = project.userAssignments.find(
        assignment => assignment.userId === userId && assignment.isActive
      );

      if (existingAssignment) {
        throw new BadRequestException('User is already assigned to this project');
      }

      const newAssignment: UserAssignment = {
        userId,
        role,
        assignedAt: new Date(),
        assignedBy: assignedBy || 'system',
        isActive: true,
        metadata: metadata || {}
      };

      // Update both arrays
      project.assignedUsers.push(userId);
      project.userAssignments.push(newAssignment);

      // Update assignment summary in metadata
      this.updateAssignmentSummary(project);

      await project.save();

      // 🎯 AUDIT LOG - Business action (security/compliance)
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_USER_ASSIGNED,
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
            assignedUserId: userId,
            assignedUserName: `${user.name} ${user.surname || ''}`.trim(),
            assignedUserEmail: user.email,
            userRole: role,
            assignmentMetadata: metadata,
            operationDuration: Date.now() - startTime,
            totalUsersAfterAssignment: project.assignedUsers.length
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity (activity feed)
      if (adminUserId) {
        const adminUser = await this.userModel.findById(adminUserId).exec();
        
        await this.appActivityService.createActivity({
          businessId: project.businessId,
          userId: adminUserId,
          userName: adminUser ? `${adminUser.name} ${adminUser.surname || ''}`.trim() : 'Admin',
          userEmail: adminUser?.email || '',
          type: ActivityType.TASK_ASSIGNED,
          action: `Assigned ${user.name} ${user.surname || ''} to project`,
          description: role ? `Assigned as ${role} to ${project.name}` : `Assigned to ${project.name}`,
          projectId,
          projectName: project.name,
          resourceType: 'project_assignment',
          resourceId: projectId,
          resourceName: `${user.name} assignment`,
          data: {
            assignedUserId: userId,
            assignedUserName: `${user.name} ${user.surname || ''}`.trim(),
            assignedUserEmail: user.email,
            userRole: role,
            projectName: project.name,
            assignmentType: 'user_assignment'
          }
        });
      }

      this.logger.log(`User ${userId} assigned to project ${projectId} with role ${role}`);
      return newAssignment;
    } catch (error) {
      // 🎯 AUDIT LOG - Error for business actions only
      if (adminUserId && this.shouldLogError(error)) {
        await this.auditLogService.createAuditLog({
          businessId: businessId || 'unknown',
          userId: adminUserId,
          action: AuditAction.PROJECT_USER_ASSIGNED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project assignment: ${projectId}`,
          success: false,
          errorMessage: 'Error assigning user to project',
          severity: AuditSeverity.HIGH,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            assignedUserId: userId,
            userRole: role,
            errorReason: this.categorizeError(error),
            errorName: error.name,
            errorMessage: error.message,
            operationDuration: Date.now() - startTime
          }
        });
      }

      this.logger.error(`Error assigning user to project: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Assign a team to a project
   */
  async assignTeamToProject(
    projectId: string,
    teamId: string,
    role?: string,
    metadata?: Record<string, any>,
    assignedBy?: string,
    adminUserId?: string,
    req?: any,
    businessId?: string | undefined | any
  ): Promise<TeamAssignment> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      const project = await this.appProjectModel.findById(projectId).exec();
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      // Get business and verify team exists
      const business = await this.businessModel.findById(project.businessId).exec();
      if (!business) {
        throw new NotFoundException('Business not found');
      }

      const team = business.teams.find(t => t.id === teamId);
      if (!team) {
        throw new NotFoundException('Team not found in business');
      }

      // Check if team is already assigned
      const existingAssignment = project.teamAssignments.find(
        assignment => assignment.teamId === teamId && assignment.isActive
      );

      if (existingAssignment) {
        throw new BadRequestException('Team is already assigned to this project');
      }

      const newAssignment: TeamAssignment = {
        teamId,
        teamName: team.name,
        assignedAt: new Date(),
        assignedBy: assignedBy || 'system',
        isActive: true,
        role,
        metadata: metadata || {}
      };

      // Update both arrays
      project.assignedTeams.push(teamId);
      project.teamAssignments.push(newAssignment);

      // Update assignment summary in metadata
      this.updateAssignmentSummary(project);

      await project.save();

      // 🎯 AUDIT LOG - Business action (security/compliance)
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_TEAM_ASSIGNED,
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
            assignedTeamId: teamId,
            assignedTeamName: team.name,
            teamRole: role,
            assignmentMetadata: metadata,
            operationDuration: Date.now() - startTime,
            totalTeamsAfterAssignment: project.assignedTeams.length
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity (activity feed)
      if (adminUserId) {
        const adminUser = await this.userModel.findById(adminUserId).exec();
        
        await this.appActivityService.createActivity({
          businessId: project.businessId,
          userId: adminUserId,
          userName: adminUser ? `${adminUser.name} ${adminUser.surname || ''}`.trim() : 'Admin',
          userEmail: adminUser?.email || '',
          type: ActivityType.TEAM_UPDATED,
          action: `Assigned team ${team.name} to project`,
          description: role ? `Assigned as ${role} to ${project.name}` : `Assigned to ${project.name}`,
          projectId,
          projectName: project.name,
          team: team.name,
          resourceType: 'project_assignment',
          resourceId: projectId,
          resourceName: `${team.name} assignment`,
          data: {
            assignedTeamId: teamId,
            assignedTeamName: team.name,
            teamRole: role,
            projectName: project.name,
            assignmentType: 'team_assignment'
          }
        });
      }

      this.logger.log(`Team ${teamId} assigned to project ${projectId} with role ${role}`);
      return newAssignment;
    } catch (error) {
      // 🎯 AUDIT LOG - Error for business actions only
      if (adminUserId && this.shouldLogError(error)) {
        await this.auditLogService.createAuditLog({
          businessId: businessId || 'unknown',
          userId: adminUserId,
          action: AuditAction.PROJECT_TEAM_ASSIGNED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project team assignment: ${projectId}`,
          success: false,
          errorMessage: 'Error assigning team to project',
          severity: AuditSeverity.HIGH,
          ipAddress,
          userAgent,
          metadata: {
            projectId,
            assignedTeamId: teamId,
            teamRole: role,
            errorReason: this.categorizeError(error),
            errorName: error.name,
            errorMessage: error.message,
            operationDuration: Date.now() - startTime
          }
        });
      }

      this.logger.error(`Error assigning team to project: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Unassign a user from a project
   */
  async unassignUserFromProject(
    projectId: string, 
    userId: string,
    adminUserId?: string,
    req?: any
  ): Promise<void> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      const project = await this.appProjectModel.findById(projectId).exec();
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      // Find and deactivate the assignment
      const assignmentIndex = project.userAssignments.findIndex(
        assignment => assignment.userId === userId && assignment.isActive
      );

      if (assignmentIndex === -1) {
        throw new NotFoundException('User assignment not found or already inactive');
      }

      const assignment = project.userAssignments[assignmentIndex];
      const user = await this.userModel.findById(userId).exec();

      // Mark assignment as inactive instead of removing it (for audit trail)
      project.userAssignments[assignmentIndex].isActive = false;

      // Remove from simple array
      project.assignedUsers = project.assignedUsers.filter(id => id !== userId);

      // Update assignment summary
      this.updateAssignmentSummary(project);

      await project.save();

      // 🎯 AUDIT LOG - Business action (security/compliance)
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_USER_UNASSIGNED,
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
            unassignedUserId: userId,
            unassignedUserName: user ? `${user.name} ${user.surname || ''}`.trim() : 'Unknown User',
            previousRole: assignment.role,
            operationDuration: Date.now() - startTime,
            totalUsersAfterUnassignment: project.assignedUsers.length
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity (activity feed)
      if (adminUserId && user) {
        const adminUser = await this.userModel.findById(adminUserId).exec();
        
        await this.appActivityService.createActivity({
          businessId: project.businessId,
          userId: adminUserId,
          userName: adminUser ? `${adminUser.name} ${adminUser.surname || ''}`.trim() : 'Admin',
          userEmail: adminUser?.email || '',
          type: ActivityType.TASK_UPDATE,
          action: `Removed ${user.name} ${user.surname || ''} from project`,
          description: `Unassigned from ${project.name}`,
          projectId,
          projectName: project.name,
          resourceType: 'project_assignment',
          resourceId: projectId,
          resourceName: `${user.name} unassignment`,
          data: {
            unassignedUserId: userId,
            unassignedUserName: `${user.name} ${user.surname || ''}`.trim(),
            unassignedUserEmail: user.email,
            previousRole: assignment.role,
            projectName: project.name,
            assignmentType: 'user_unassignment'
          }
        });
      }

      this.logger.log(`User ${userId} unassigned from project ${projectId}`);
    } catch (error) {
      this.logger.error(`Error unassigning user from project: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Unassign a team from a project
   */
  async unassignTeamFromProject(
    projectId: string, 
    teamId: string,
    adminUserId?: string,
    req?: any
  ): Promise<void> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      const project = await this.appProjectModel.findById(projectId).exec();
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      // Find and deactivate the assignment
      const assignmentIndex = project.teamAssignments.findIndex(
        assignment => assignment.teamId === teamId && assignment.isActive
      );

      if (assignmentIndex === -1) {
        throw new NotFoundException('Team assignment not found or already inactive');
      }

      const assignment = project.teamAssignments[assignmentIndex];

      // Mark assignment as inactive
      project.teamAssignments[assignmentIndex].isActive = false;

      // Remove from simple array
      project.assignedTeams = project.assignedTeams.filter(id => id !== teamId);

      // Update assignment summary
      this.updateAssignmentSummary(project);

      await project.save();

      // 🎯 AUDIT LOG - Business action (security/compliance)
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_TEAM_UNASSIGNED,
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
            unassignedTeamId: teamId,
            unassignedTeamName: assignment.teamName,
            previousRole: assignment.role,
            operationDuration: Date.now() - startTime,
            totalTeamsAfterUnassignment: project.assignedTeams.length
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity (activity feed)
      if (adminUserId) {
        const adminUser = await this.userModel.findById(adminUserId).exec();
        
        await this.appActivityService.createActivity({
          businessId: project.businessId,
          userId: adminUserId,
          userName: adminUser ? `${adminUser.name} ${adminUser.surname || ''}`.trim() : 'Admin',
          userEmail: adminUser?.email || '',
          type: ActivityType.TEAM_UPDATED,
          action: `Removed team ${assignment.teamName} from project`,
          description: `Unassigned from ${project.name}`,
          projectId,
          projectName: project.name,
          team: assignment.teamName,
          resourceType: 'project_assignment',
          resourceId: projectId,
          resourceName: `${assignment.teamName} unassignment`,
          data: {
            unassignedTeamId: teamId,
            unassignedTeamName: assignment.teamName,
            previousRole: assignment.role,
            projectName: project.name,
            assignmentType: 'team_unassignment'
          }
        });
      }

      this.logger.log(`Team ${teamId} unassigned from project ${projectId}`);
    } catch (error) {
      this.logger.error(`Error unassigning team from project: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update user assignment details
   */
  async updateUserAssignment(
    projectId: string,
    userId: string,
    updateData: {
      role?: string;
      metadata?: Record<string, any>;
    },
    adminUserId?: string,
    req?: any
  ): Promise<UserAssignment> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      const project = await this.appProjectModel.findById(projectId).exec();
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const assignmentIndex = project.userAssignments.findIndex(
        assignment => assignment.userId === userId && assignment.isActive
      );

      if (assignmentIndex === -1) {
        throw new NotFoundException('User assignment not found');
      }

      const oldValues: any = {};
      const newValues: any = {};
      const user = await this.userModel.findById(userId).exec();

      // Update the assignment
      if (updateData.role !== undefined) {
        oldValues.role = project.userAssignments[assignmentIndex].role;
        newValues.role = updateData.role;
        project.userAssignments[assignmentIndex].role = updateData.role;
      }

      if (updateData.metadata) {
        oldValues.metadata = project.userAssignments[assignmentIndex].metadata;
        newValues.metadata = {
          ...project.userAssignments[assignmentIndex].metadata,
          ...updateData.metadata
        };
        project.userAssignments[assignmentIndex].metadata = newValues.metadata;
      }

      // Update assignment summary
      this.updateAssignmentSummary(project);

      await project.save();

      // 🎯 AUDIT LOG - Business action (security/compliance)
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_USER_ROLE_UPDATED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.MEDIUM,
          ipAddress,
          userAgent,
          oldValues,
          newValues,
          changedFields: Object.keys(updateData),
          metadata: {
            projectId,
            projectName: project.name,
            updatedUserId: userId,
            updatedUserName: user ? `${user.name} ${user.surname || ''}`.trim() : 'Unknown User',
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity (activity feed)
      if (adminUserId && updateData.role && oldValues.role !== newValues.role) {
        const adminUser = await this.userModel.findById(adminUserId).exec();
        
        await this.appActivityService.createActivity({
          businessId: project.businessId,
          userId: adminUserId,
          userName: adminUser ? `${adminUser.name} ${adminUser.surname || ''}`.trim() : 'Admin',
          userEmail: adminUser?.email || '',
          type: ActivityType.TASK_UPDATE,
          action: `Updated ${user?.name || 'user'}'s role in project`,
          description: `Changed role from ${oldValues.role || 'none'} to ${newValues.role} in ${project.name}`,
          projectId,
          projectName: project.name,
          resourceType: 'project_assignment',
          resourceId: projectId,
          resourceName: `${user?.name || 'user'} role update`,
          data: {
            updatedUserId: userId,
            updatedUserName: user ? `${user.name} ${user.surname || ''}`.trim() : 'Unknown User',
            oldRole: oldValues.role,
            newRole: newValues.role,
            projectName: project.name,
            assignmentType: 'user_role_update'
          }
        });
      }

      this.logger.log(`User assignment updated for ${userId} in project ${projectId}`);
      return project.userAssignments[assignmentIndex];
    } catch (error) {
      this.logger.error(`Error updating user assignment: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update team assignment details
   */
  async updateTeamAssignment(
    projectId: string,
    teamId: string,
    updateData: {
      role?: string;
      metadata?: Record<string, any>;
    },
    adminUserId?: string,
    req?: any
  ): Promise<TeamAssignment> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');
    const startTime = Date.now();

    try {
      const project = await this.appProjectModel.findById(projectId).exec();
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const assignmentIndex = project.teamAssignments.findIndex(
        assignment => assignment.teamId === teamId && assignment.isActive
      );

      if (assignmentIndex === -1) {
        throw new NotFoundException('Team assignment not found');
      }

      const oldValues: any = {};
      const newValues: any = {};

      // Update the assignment
      if (updateData.role !== undefined) {
        oldValues.role = project.teamAssignments[assignmentIndex].role;
        newValues.role = updateData.role;
        project.teamAssignments[assignmentIndex].role = updateData.role;
      }

      if (updateData.metadata) {
        oldValues.metadata = project.teamAssignments[assignmentIndex].metadata;
        newValues.metadata = {
          ...project.teamAssignments[assignmentIndex].metadata,
          ...updateData.metadata
        };
        project.teamAssignments[assignmentIndex].metadata = newValues.metadata;
      }

      // Update assignment summary
      this.updateAssignmentSummary(project);

      await project.save();

      // 🎯 AUDIT LOG - Business action (security/compliance)
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_ASSIGNMENT_UPDATED,
          resourceType: ResourceType.PROJECT,
          resourceId: projectId,
          resourceName: `Project: ${project.name}`,
          success: true,
          severity: AuditSeverity.MEDIUM,
          ipAddress,
          userAgent,
          oldValues,
          newValues,
          changedFields: Object.keys(updateData),
          metadata: {
            projectId,
            projectName: project.name,
            updatedTeamId: teamId,
            updatedTeamName: project.teamAssignments[assignmentIndex].teamName,
            operationDuration: Date.now() - startTime
          }
        });
      }

      // 🎯 APP ACTIVITY - User-facing activity (activity feed)
      if (adminUserId && updateData.role && oldValues.role !== newValues.role) {
        const adminUser = await this.userModel.findById(adminUserId).exec();
        const teamName = project.teamAssignments[assignmentIndex].teamName;
        
        await this.appActivityService.createActivity({
          businessId: project.businessId,
          userId: adminUserId,
          userName: adminUser ? `${adminUser.name} ${adminUser.surname || ''}`.trim() : 'Admin',
          userEmail: adminUser?.email || '',
          type: ActivityType.TEAM_UPDATED,
          action: `Updated ${teamName}'s role in project`,
          description: `Changed role from ${oldValues.role || 'none'} to ${newValues.role} in ${project.name}`,
          projectId,
          projectName: project.name,
          team: teamName,
          resourceType: 'project_assignment',
          resourceId: projectId,
          resourceName: `${teamName} role update`,
          data: {
            updatedTeamId: teamId,
            updatedTeamName: teamName,
            oldRole: oldValues.role,
            newRole: newValues.role,
            projectName: project.name,
            assignmentType: 'team_role_update'
          }
        });
      }

      this.logger.log(`Team assignment updated for ${teamId} in project ${projectId}`);
      return project.teamAssignments[assignmentIndex];
    } catch (error) {
      this.logger.error(`Error updating team assignment: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get project assignment statistics
   */
  async getProjectAssignmentStats(
    projectId: string,
    adminUserId?: string,
    req?: any
  ): Promise<{
    totalUsers: number;
    totalTeams: number;
    roleBreakdown: Record<string, number>;
    recentAssignments: any[];
  }> {
    const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
    const userAgent = req?.get('User-Agent');

    try {
      const project = await this.appProjectModel.findById(projectId).exec();
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const activeUserAssignments = project.userAssignments.filter(a => a.isActive);
      const activeTeamAssignments = project.teamAssignments.filter(a => a.isActive);

      // Calculate role breakdown
      const roleBreakdown: Record<string, number> = {};
      activeUserAssignments.forEach(assignment => {
        const role = assignment.role || 'unassigned';
        roleBreakdown[role] = (roleBreakdown[role] || 0) + 1;
      });

      // Get recent assignments (last 10)
      const allAssignments = [
        ...activeUserAssignments.map(a => ({ ...a, type: 'user' })),
        ...activeTeamAssignments.map(a => ({ ...a, type: 'team' }))
      ];
      
      const recentAssignments = allAssignments
        .sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime())
        .slice(0, 10);

      // 🎯 AUDIT LOG - Business viewing stats (security/compliance)
      if (adminUserId) {
        await this.auditLogService.createAuditLog({
          businessId: project.businessId,
          userId: adminUserId,
          action: AuditAction.PROJECT_STATS_VIEWED,
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
            totalUsers: activeUserAssignments.length,
            totalTeams: activeTeamAssignments.length,
            roleBreakdown
          }
        });
      }

      return {
        totalUsers: activeUserAssignments.length,
        totalTeams: activeTeamAssignments.length,
        roleBreakdown,
        recentAssignments
      };
    } catch (error) {
      this.logger.error(`Error getting assignment stats: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get projects assigned to a specific user (INTERNAL - NO AUDIT LOG OR ACTIVITY)
   */
  async getUserProjects(userId: string): Promise<AppProject[]> {
    try {
      return await this.appProjectModel.find({
        assignedUsers: userId,
        isDeleted: false
      }).exec();
    } catch (error) {
      this.logger.error(`Error getting user projects: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get projects assigned to a specific team (INTERNAL - NO AUDIT LOG OR ACTIVITY)
   */
  async getTeamProjects(teamId: string): Promise<AppProject[]> {
    try {
      return await this.appProjectModel.find({
        assignedTeams: teamId,
        isDeleted: false
      }).exec();
    } catch (error) {
      this.logger.error(`Error getting team projects: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Bulk assign users to project
   */
  async bulkAssignUsersToProject(
    projectId: string,
    userAssignments: Array<{
      userId: string;
      role?: string;
      metadata?: Record<string, any>;
    }>,
    assignedBy?: string,
    adminUserId?: string,
    req?: any
  ): Promise<UserAssignment[]> {
    try {
      const project = await this.appProjectModel.findById(projectId).exec();
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const results: UserAssignment[] = [];
      const successfulAssignments: string[] = [];

      for (const assignment of userAssignments) {
        try {
          const result = await this.assignUserToProject(
            projectId,
            assignment.userId,
            assignment.role,
            assignment.metadata,
            assignedBy,
            adminUserId,
            req
          );
          results.push(result);
          successfulAssignments.push(assignment.userId);
        } catch (error) {
          this.logger.error(`Failed to assign user ${assignment.userId}: ${error.message}`);
          // Continue with other assignments
        }
      }

      // 🎯 APP ACTIVITY - Bulk assignment summary (activity feed)
      if (adminUserId && successfulAssignments.length > 0) {
        const adminUser = await this.userModel.findById(adminUserId).exec();
        
        await this.appActivityService.createActivity({
          businessId: project.businessId,
          userId: adminUserId,
          userName: adminUser ? `${adminUser.name} ${adminUser.surname || ''}`.trim() : 'Admin',
          userEmail: adminUser?.email || '',
          type: ActivityType.TASK_ASSIGNED,
          action: `Bulk assigned ${successfulAssignments.length} users to project`,
          description: `Assigned ${successfulAssignments.length} team members to ${project.name}`,
          projectId,
          projectName: project.name,
          resourceType: 'project_assignment',
          resourceId: projectId,
          resourceName: `Bulk assignment`,
          data: {
            assignedUserIds: successfulAssignments,
            totalAttempted: userAssignments.length,
            totalSuccessful: successfulAssignments.length,
            projectName: project.name,
            assignmentType: 'bulk_user_assignment'
          }
        });
      }

      return results;
    } catch (error) {
      this.logger.error(`Error in bulk assign users: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update assignment summary in project metadata
   */
  private updateAssignmentSummary(project: AppProject): void {
    const activeUserAssignments = project.userAssignments.filter(a => a.isActive);
    const activeTeamAssignments = project.teamAssignments.filter(a => a.isActive);

    const projectManagerId = activeUserAssignments.find(a => a.role === 'project_manager')?.userId;
    const teamLeaderIds = activeUserAssignments
      .filter(a => a.role === 'team_leader')
      .map(a => a.userId);

    if (!project.metadata) {
      project.metadata = {};
    }

    project.metadata.assignmentSummary = {
      totalUsers: activeUserAssignments.length,
      totalTeams: activeTeamAssignments.length,
      projectManagerId,
      teamLeaderIds,
      lastAssignmentUpdate: new Date()
    };

    // Mark the document as modified
    project.markModified('metadata');
  }

  /**
   * Helper method to extract IP address from request
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
    const validationErrors = ['BadRequestException', 'ValidationError', 'NotFoundException'];
    return !validationErrors.includes(error.name);
  }

  /**
   * Categorize error for audit logging
   */
  private categorizeError(error: any): string {
    if (error.name === 'NotFoundException') return 'resource_not_found';
    if (error.name === 'BadRequestException') return 'validation_error';
    if (error.name === 'UnauthorizedException') return 'access_denied';
    return 'unexpected_error';
  }
}