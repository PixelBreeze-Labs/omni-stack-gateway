// src/controllers/vb-construction-site-sync.controller.ts
import { Controller, Post, Body, Req, UseGuards, NotFoundException, Logger, InternalServerErrorException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { VBConstructionSiteSyncService } from '../services/vb-construction-site-sync.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Request } from 'express';
import { Client } from '../schemas/client.schema';

@ApiTags('Construction Site Synchronization')
@Controller('sync/construction-sites')
@ApiBearerAuth()
@UseGuards(ClientAuthGuard)
export class VBConstructionSiteSyncController {
  private readonly logger = new Logger(VBConstructionSiteSyncController.name);

  constructor(
    private readonly siteSyncService: VBConstructionSiteSyncService
  ) {}

  @Post('create-or-update')
  @ApiOperation({ summary: 'Create or update a construction site from external system' })
  @ApiResponse({ status: 200, description: 'Construction site synchronized successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Invalid client' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async syncSite(
    @Req() req: Request & { client: Client },
    @Body() siteData: any
  ) {
    try {
      // Use client ID from the authenticated request
      const clientId = req.client.id;
      
      // Find business by venue ID and client ID
      const venueId = siteData.venueId;
      if (!venueId) {
        throw new NotFoundException('Venue ID is required');
      }
      
      // Proceed with construction site sync
      const result = await this.siteSyncService.createOrUpdateSite(siteData, clientId, venueId);
      return { success: true, message: 'Construction site synchronized successfully', data: result };
    } catch (error) {
      this.logger.error(`Error syncing construction site: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to sync construction site');
      }
    }
  }

  @Post('update-status')
  @ApiOperation({ summary: 'Update construction site status from external system' })
  @ApiResponse({ status: 200, description: 'Construction site status updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Invalid client' })
  @ApiResponse({ status: 404, description: 'Construction site not found' })
  async updateSiteStatus(
    @Req() req: Request & { client: Client },
    @Body() statusData: { siteId: string, venueId: string, status: string }
  ) {
    try {
      const clientId = req.client.id;
      const { siteId, venueId, status } = statusData;
      
      const result = await this.siteSyncService.updateSiteStatus(siteId, clientId, venueId, status);
      return { success: true, message: 'Construction site status updated successfully', data: result };
    } catch (error) {
      this.logger.error(`Error updating construction site status: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to update construction site status');
      }
    }
  }

  @Post('delete')
  @ApiOperation({ summary: 'Delete construction site from external system' })
  @ApiResponse({ status: 200, description: 'Construction site deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Invalid client' })
  @ApiResponse({ status: 404, description: 'Construction site not found' })
  async deleteSite(
    @Req() req: Request & { client: Client },
    @Body() deleteData: { siteId: string, venueId: string }
  ) {
    try {
      const clientId = req.client.id;
      const { siteId, venueId } = deleteData;
      
      const result = await this.siteSyncService.deleteSite(siteId, clientId, venueId);
      return { success: true, message: 'Construction site deleted successfully', data: result };
    } catch (error) {
      this.logger.error(`Error deleting construction site: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to delete construction site');
      }
    }
  }
}