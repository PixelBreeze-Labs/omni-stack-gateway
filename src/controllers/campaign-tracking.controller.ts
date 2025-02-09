import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { CampaignTrackingService } from '../services/campaign-tracking.service';
import {
    TrackViewProductDto,
    TrackAddToCartDto,
    TrackPurchaseDto,
    ListCampaignStatsDto,
} from '../dtos/campaign-tracking.dto';
import { Client } from '../schemas/client.schema';

@ApiTags('Campaign Tracking')
@ApiBearerAuth()
@Controller('tracking/campaigns')
@UseGuards(ClientAuthGuard)
export class CampaignTrackingController {
    constructor(private readonly campaignTrackingService: CampaignTrackingService) {}

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

    @ApiOperation({ summary: 'Get campaign statistics' })
    @ApiResponse({ status: 200, description: 'Return campaign statistics' })
    @Get('stats')
    async getCampaignStats(
        @Req() req: Request & { client: Client },
        @Query() query: ListCampaignStatsDto,
    ) {
        // If a campaignId is provided in the query, use it for filtering
        if (query.campaignId) {
            return this.campaignTrackingService.getCampaignStats(req.client.id, query.campaignId);
        }
        return this.campaignTrackingService.getCampaignStats(req.client.id, query);
    }
}
