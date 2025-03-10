// src/controllers/general-campaign.controller.ts
import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    UseGuards,
    Req,
    Query,
    DefaultValuePipe,
    ParseIntPipe,
    ParseBoolPipe
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { GeneralCampaignService } from '../services/general-campaign.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { CampaignStatus, CampaignType } from '../schemas/general-campaign.schema';
import { Client } from '../schemas/client.schema';

@ApiTags('Campaigns')
@ApiBearerAuth()
@Controller('campaigns')
@UseGuards(ClientAuthGuard)
export class GeneralCampaignController {
    constructor(
        private readonly campaignService: GeneralCampaignService
    ) {}

    /**
     * Get all campaigns with filtering and pagination
     */
    @Get()
    @ApiOperation({ summary: 'Get all campaigns with filtering and pagination' })
    @ApiResponse({
        status: 200,
        description: 'Returns a list of campaigns'
    })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'search', required: false, type: String })
    @ApiQuery({ name: 'status', required: false, enum: CampaignStatus })
    @ApiQuery({ name: 'type', required: false, enum: CampaignType })
    @ApiQuery({ name: 'sent', required: false, type: Boolean })
    async getCampaigns(
        @Req() req: Request & { client: Client },
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
        @Query('status') status?: CampaignStatus,
        @Query('type') type?: CampaignType,
        @Query('sent') sent?: boolean
    ) {
        return this.campaignService.findAll(req.client.id, {
            page,
            limit,
            search,
            status,
            type,
            sent
        });
    }

    /**
     * Get a campaign by ID
     */
    @Get(':id')
    @ApiOperation({ summary: 'Get a campaign by ID' })
    @ApiResponse({
        status: 200,
        description: 'Returns a campaign by ID'
    })
    async getCampaignById(
        @Req() req: Request & { client: Client },
        @Param('id') id: string
    ) {
        return this.campaignService.findById(req.client.id, id);
    }

    /**
     * Sync campaigns from VenueBoost
     */
    @Post('sync')
    @ApiOperation({ summary: 'Sync campaigns from VenueBoost' })
    @ApiResponse({
        status: 200,
        description: 'Campaigns synced successfully'
    })
    async syncCampaigns(@Req() req: Request & { client: Client }) {
        return this.campaignService.syncCampaignsFromVenueBoost(req.client.id);
    }

    /**
     * Delete a campaign
     */
    @Delete(':id')
    @ApiOperation({ summary: 'Delete a campaign' })
    @ApiResponse({
        status: 200,
        description: 'Campaign deleted successfully'
    })
    @ApiResponse({
        status: 404,
        description: 'Campaign not found'
    })
    async deleteCampaign(
        @Req() req: Request & { client: Client },
        @Param('id') id: string
    ) {
        return this.campaignService.deleteCampaign(req.client.id, id);
    }
}