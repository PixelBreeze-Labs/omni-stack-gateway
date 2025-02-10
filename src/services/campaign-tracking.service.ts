import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Campaign } from '../schemas/campaign.schema';
import { CampaignEvent } from '../schemas/campaign-event.schema';
import {
    CampaignParamsDto,
    TrackAddToCartDto,
    TrackPurchaseDto,
    ListCampaignStatsDto,
    TrackViewProductDto,
} from '../dtos/campaign-tracking.dto';

@Injectable()
export class CampaignTrackingService {
    constructor(
        @InjectModel(Campaign.name) private campaignModel: Model<Campaign>,
        @InjectModel(CampaignEvent.name) private campaignEventModel: Model<CampaignEvent>,
    ) {}

    /**
     * Get an existing campaign matching the provided UTM parameters or create a new one.
     */
    async getOrCreateCampaign(clientId: string, params: CampaignParamsDto): Promise<Campaign> {
        const campaign = await this.campaignModel.findOneAndUpdate(
            {
                clientId,
                utmSource: params.utmSource,
                utmMedium: params.utmMedium,
                utmCampaign: params.utmCampaign,
                utmContent: params.utmContent,
            },
            {
                $setOnInsert: {
                    clientId,
                    ...params,
                },
            },
            {
                upsert: true,
                new: true,
            }
        );
        return campaign;
    }

    /**
     * Track a product view event.
     */
    async trackViewProduct(clientId: string, productId: string, campaignParams: CampaignParamsDto): Promise<void> {
        const campaign = await this.getOrCreateCampaign(clientId, campaignParams);
        await this.campaignEventModel.create({
            clientId,
            campaignId: campaign._id,
            eventType: 'view_product',
            productId,
            eventData: {},
        });
    }

    /**
     * Track an add-to-cart event.
     */
    async trackAddToCart(clientId: string, data: TrackAddToCartDto): Promise<void> {
        const campaign = await this.getOrCreateCampaign(clientId, data.campaignParams);
        await this.campaignEventModel.create({
            clientId,
            campaignId: campaign._id,
            eventType: 'add_to_cart',
            productId: data.productId,
            eventData: {
                quantity: data.quantity,
                price: data.price,
                currency: data.currency,
            },
        });
    }

    /**
     * Track a purchase event.
     */
    async trackPurchase(clientId: string, data: TrackPurchaseDto): Promise<void> {
        const campaign = await this.getOrCreateCampaign(clientId, data.campaignParams);
        await this.campaignEventModel.create({
            clientId,
            campaignId: campaign._id,
            eventType: 'purchase',
            orderId: data.orderId,
            eventData: {
                total: data.total,
                currency: data.currency,
            },
        });
    }

    /**
     * Get aggregated campaign statistics.
     * The query parameter can be a campaign ID string or a filter DTO.
     */
    async getCampaignStats(clientId: string, query: string | ListCampaignStatsDto) {
        let matchQuery: any = { clientId };

        if (typeof query === 'string') {
            // If query is a string, assume it's a campaignId.
            matchQuery.campaignId = query;
        } else {
            // Apply additional filters based on DTO values.
            if (query.utmSource) matchQuery['campaign.utmSource'] = query.utmSource;
            if (query.utmCampaign) matchQuery['campaign.utmCampaign'] = query.utmCampaign;
            if (query.startDate) matchQuery.createdAt = { $gte: new Date(query.startDate) };
            if (query.endDate)
                matchQuery.createdAt = { ...matchQuery.createdAt, $lte: new Date(query.endDate) };
        }

        const [viewCount, cartCount, purchaseCount, revenue] = await Promise.all([
            this.campaignEventModel.countDocuments({ ...matchQuery, eventType: 'view_product' }),
            this.campaignEventModel.countDocuments({ ...matchQuery, eventType: 'add_to_cart' }),
            this.campaignEventModel.countDocuments({ ...matchQuery, eventType: 'purchase' }),
            this.campaignEventModel
                .aggregate([
                    {
                        $match: { ...matchQuery, eventType: 'purchase' },
                    },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: '$eventData.total' },
                        },
                    },
                ])
                .then((result) => result[0]?.total || 0),
        ]);

        return {
            viewCount,
            cartCount,
            purchaseCount,
            revenue,
            conversionRate: viewCount ? (purchaseCount / viewCount * 100).toFixed(2) + '%' : '0%',
        };
    }

    /**
     * Get campaigns list with pagination and search
     */
    async listCampaigns(clientId: string, options: {
        page?: number;
        limit?: number;
        search?: string;
    }) {
        const page = options.page || 1;
        const limit = options.limit || 10;
        const skip = (page - 1) * limit;

        let query: any = { clientId };
        if (options.search) {
            query = {
                ...query,
                $or: [
                    { utmCampaign: { $regex: options.search, $options: 'i' } },
                    { utmSource: { $regex: options.search, $options: 'i' } },
                    { utmMedium: { $regex: options.search, $options: 'i' } },
                ]
            };
        }

        const [campaigns, total] = await Promise.all([
            this.campaignModel
                .find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            this.campaignModel.countDocuments(query)
        ]);

        // Get stats for each campaign
        const campaignsWithStats = await Promise.all(
            campaigns.map(async (campaign) => {
                const stats = await this.getCampaignStats(clientId, campaign._id);
                return {
                    ...campaign,
                    stats
                };
            })
        );

        return {
            items: campaignsWithStats,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        };
    }

    /**
     * Get overview statistics for all campaigns
     */
    async getOverviewStats(clientId: string, timeframe?: string) {
        let dateFilter: any = {};

        // Apply timeframe filter if provided
        if (timeframe) {
            const now = new Date();
            switch (timeframe) {
                case '7d':
                    dateFilter = { $gte: new Date(now.setDate(now.getDate() - 7)) };
                    break;
                case '30d':
                    dateFilter = { $gte: new Date(now.setDate(now.getDate() - 30)) };
                    break;
                case '90d':
                    dateFilter = { $gte: new Date(now.setDate(now.getDate() - 90)) };
                    break;
            }
        }

        const matchQuery = {
            clientId,
            ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {})
        };

        const [viewCount, cartCount, purchaseCount, revenue] = await Promise.all([
            this.campaignEventModel.countDocuments({ ...matchQuery, eventType: 'view_product' }),
            this.campaignEventModel.countDocuments({ ...matchQuery, eventType: 'add_to_cart' }),
            this.campaignEventModel.countDocuments({ ...matchQuery, eventType: 'purchase' }),
            this.campaignEventModel
                .aggregate([
                    {
                        $match: { ...matchQuery, eventType: 'purchase' }
                    },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: '$eventData.total' }
                        }
                    }
                ])
                .then((result) => result[0]?.total || 0)
        ]);

        return {
            viewCount,
            cartCount,
            purchaseCount,
            revenue,
            conversionRate: viewCount ? (purchaseCount / viewCount * 100).toFixed(2) + '%' : '0%'
        };
    }

    /**
     * Get detailed campaign statistics with timeframe filter
     */
    async getCampaignDetails(clientId: string, campaignId: string, timeframe?: string) {
        const campaign = await this.campaignModel.findOne({ _id: campaignId, clientId });
        if (!campaign) {
            throw new NotFoundException('Campaign not found');
        }

        const stats = await this.getCampaignStats(clientId, campaignId);
        return {
            campaign,
            stats
        };
    }
}
