// src/controllers/vb-app-project-sync.controller.ts
import { Controller, Post, Body, Req, UseGuards, NotFoundException, Logger, InternalServerErrorException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { VBAppProjectSyncService } from '../services/vb-app-project-sync.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Request } from 'express';
import { Client } from '../schemas/client.schema';

@ApiTags('Project Synchronization')
@Controller('sync/projects')
@ApiBearerAuth()
@UseGuards(ClientAuthGuard)
export class VBAppProjectSyncController {
  private readonly logger = new Logger(VBAppProjectSyncController.name);

  constructor(
    private readonly projectSyncService: VBAppProjectSyncService
  ) {}

  @Post('create-or-update')
  @ApiOperation({ summary: 'Create or update a project from external system' })
  @ApiResponse({ status: 200, description: 'Project synchronized successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Invalid client' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async syncProject(
    @Req() req: Request & { client: Client },
    @Body() projectData: any
  ) {
    try {
      // Use client ID from the authenticated request
      const clientId = req.client.id;
      
      // Find business by venue ID and client ID
      const venueId = projectData.venueId;
      if (!venueId) {
        throw new NotFoundException('Venue ID is required');
      }
      
      // Proceed with project sync
      const result = await this.projectSyncService.createOrUpdateProject(projectData, clientId, venueId);
      return { success: true, message: 'Project synchronized successfully', data: result };
    } catch (error) {
      this.logger.error(`Error syncing project: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to sync project');
      }
    }
  }

  @Post('update-status')
  @ApiOperation({ summary: 'Update project status from external system' })
  @ApiResponse({ status: 200, description: 'Project status updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Invalid client' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async updateProjectStatus(
    @Req() req: Request & { client: Client },
    @Body() statusData: { projectId: string, venueId: string, status: string }
  ) {
    try {
      const clientId = req.client.id;
      const { projectId, venueId, status } = statusData;
      
      const result = await this.projectSyncService.updateProjectStatus(projectId, clientId, venueId, status);
      return { success: true, message: 'Project status updated successfully', data: result };
    } catch (error) {
      this.logger.error(`Error updating project status: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to update project status');
      }
    }
  }

  @Post('delete')
  @ApiOperation({ summary: 'Delete project from external system' })
  @ApiResponse({ status: 200, description: 'Project deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Invalid client' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async deleteProject(
    @Req() req: Request & { client: Client },
    @Body() deleteData: { projectId: string, venueId: string }
  ) {
    try {
      const clientId = req.client.id;
      const { projectId, venueId } = deleteData;
      
      const result = await this.projectSyncService.deleteProject(projectId, clientId, venueId);
      return { success: true, message: 'Project deleted successfully', data: result };
    } catch (error) {
      this.logger.error(`Error deleting project: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to delete project');
      }
    }
  }
  
}