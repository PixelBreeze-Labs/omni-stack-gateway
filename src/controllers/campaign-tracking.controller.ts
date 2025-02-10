import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    Req,
    UseGuards,
    Headers,
    UnauthorizedException, Logger
} from '@nestjs/common';
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
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@ApiTags('Campaign Tracking')
@Controller('tracking/campaigns')
export class CampaignTrackingController {
    private readonly logger = new Logger(CampaignTrackingController.name);

    constructor(
        private readonly campaignTrackingService: CampaignTrackingService,
        @InjectModel(Client.name) private clientModel: Model<Client>
    ) {}

    private async getClientFromHeaders(
        venueShortCode: string,
        webhookApiKey: string,
    ): Promise<Client> {
        const client = await this.clientModel.findOne({
            'venueBoostConnection.venueShortCode': venueShortCode,
            'venueBoostConnection.webhookApiKey': webhookApiKey,
            'venueBoostConnection.status': 'connected'
        });

        if (!client) {
            throw new UnauthorizedException('Invalid venue or webhook key');
        }

        return client;
    }

    // Webhook-based tracking endpoints
    @Post(':venueShortCode/view-product')
    async trackViewProductWebhook(
        @Param('venueShortCode') venueShortCode: string,
        @Headers('webhook-api-key') webhookApiKey: string,
        @Headers('x-api-key') apiKey: string,
        @Body() trackViewDto: TrackViewProductDto,
    ) {
        const client = await this.getClientFromHeaders(venueShortCode, webhookApiKey);
        await this.campaignTrackingService.trackViewProduct(client._id.toString(), trackViewDto);
        return { success: true };
    }

    @Post(':venueShortCode/add-to-cart')
    async trackAddToCartWebhook(
        @Param('venueShortCode') venueShortCode: string,
        @Headers('webhook-api-key') webhookApiKey: string,
        @Headers('x-api-key') apiKey: string,
        @Body() trackCartDto: TrackAddToCartDto,
    ) {
        const client = await this.getClientFromHeaders(venueShortCode, webhookApiKey);
        await this.campaignTrackingService.trackAddToCart(client._id.toString(), trackCartDto);
        return { success: true };
    }

    @Post(':venueShortCode/purchase')
    async trackPurchaseWebhook(
        @Param('venueShortCode') venueShortCode: string,
        @Headers('webhook-api-key') webhookApiKey: string,
        @Headers('x-api-key') apiKey: string,
        @Body() trackPurchaseDto: TrackPurchaseDto,
    ) {
        const client = await this.getClientFromHeaders(venueShortCode, webhookApiKey);
        await this.campaignTrackingService.trackPurchase(client._id.toString(), trackPurchaseDto);
        return { success: true };
    }


    @UseGuards(ClientAuthGuard)
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

    @UseGuards(ClientAuthGuard)
    @Get('overview')
    async getOverviewStats(
        @Req() req: Request & { client: Client },
        @Query('timeframe') timeframe?: string,
    ) {
        return this.campaignTrackingService.getOverviewStats(req.client.id, timeframe);
    }

    @UseGuards(ClientAuthGuard)
    @Get(':id')
    async getCampaignDetails(
        @Req() req: Request & { client: Client },
        @Param('id') id: string,
        @Query('timeframe') timeframe?: string,
    ) {
        return this.campaignTrackingService.getCampaignDetails(req.client.id, id, timeframe);
    }
}