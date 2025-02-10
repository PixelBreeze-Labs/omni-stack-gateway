import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { CampaignTrackingService } from '../services/campaign-tracking.service';
import {
    TrackViewProductDto,
    TrackAddToCartDto,
    TrackPurchaseDto,
    ListCampaignStatsDto,
    CampaignParamsDto
} from '../dtos/campaign-tracking.dto';
import { Client } from '../schemas/client.schema';

@ApiTags('Campaign Tracking')
@ApiBearerAuth()
@Controller('tracking/campaigns')
@UseGuards(ClientAuthGuard)
export class CampaignTrackingController {
    constructor(private readonly campaignTrackingService: CampaignTrackingService) {}

    // Campaign Management
    @Post()
    @ApiOperation({ summary: 'Create a new campaign' })
    @ApiResponse({ status: 201, description: 'Campaign created successfully' })
    async createCampaign(
        @Req() req: Request & { client: Client },
        @Body() campaignDto: CampaignParamsDto,
    ) {
        return this.campaignTrackingService.getOrCreateCampaign(req.client.id, campaignDto);
    }

    @ApiOperation({ summary: 'Track product view event' })
    @ApiResponse({ status: 201, description: 'Product view tracked successfully' })
    @Post('view-product')
    async trackViewProduct(
        @Req() req: Request & { client: Client },
        @Body() trackViewDto: TrackViewProductDto,
    ) {
        await this.campaignTrackingService.trackViewProduct(
            req.client.id,
            trackViewDto.productId,
            trackViewDto.campaignParams,
        );
        return { success: true };
    }

    @ApiOperation({ summary: 'Track add to cart event' })
    @ApiResponse({ status: 201, description: 'Add to cart tracked successfully' })
    @Post('add-to-cart')
    async trackAddToCart(
        @Req() req: Request & { client: Client },
        @Body() trackCartDto: TrackAddToCartDto,
    ) {
        await this.campaignTrackingService.trackAddToCart(req.client.id, trackCartDto);
        return { success: true };
    }

    @ApiOperation({ summary: 'Track purchase event' })
    @ApiResponse({ status: 201, description: 'Purchase tracked successfully' })
    @Post('purchase')
    async trackPurchase(
        @Req() req: Request & { client: Client },
        @Body() trackPurchaseDto: TrackPurchaseDto,
    ) {
        await this.campaignTrackingService.trackPurchase(req.client.id, trackPurchaseDto);
        return { success: true };
    }



    @ApiOperation({ summary: 'List campaigns with stats' })
    @ApiResponse({ status: 200, description: 'Return campaigns list with stats' })
    @Get()
    async listCampaigns(
        @Req() req: Request & { client: Client },
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
    ) {
        return this.campaignTrackingService.listCampaigns(req.client.id, {
            page,
            limit,
            search,
        });
    }

    @ApiOperation({ summary: 'Get campaign overview stats' })
    @ApiResponse({ status: 200, description: 'Return campaign overview statistics' })
    @Get('overview')
    async getOverviewStats(
        @Req() req: Request & { client: Client },
        @Query('timeframe') timeframe?: string,
    ) {
        return this.campaignTrackingService.getOverviewStats(req.client.id, timeframe);
    }

    @ApiOperation({ summary: 'Get campaign details with stats' })
    @ApiResponse({ status: 200, description: 'Return campaign details and statistics' })
    @Get(':id')
    async getCampaignDetails(
        @Req() req: Request & { client: Client },
        @Param('id') id: string,
        @Query('timeframe') timeframe?: string,
    ) {
        return this.campaignTrackingService.getCampaignDetails(req.client.id, id, timeframe);
    }
}
