import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Campaign } from '../schemas/campaign.schema';
import { Product } from '../schemas/product.schema';
import { Order } from '../schemas/order.schema';
import { Client } from '../schemas/client.schema';
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
        @InjectModel(Product.name) private productModel: Model<Product>,
        @InjectModel(Order.name) private orderModel: Model<Order>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
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
    async trackViewProduct(clientId: string, data: TrackViewProductDto): Promise<void> {
        const campaign = await this.getOrCreateCampaign(clientId, data.campaignParams);

        const product = await this.productModel.findOne({
            clientId,
            external_ids: data.external_product_ids
        });

        await this.campaignEventModel.create({
            clientId,
            campaignId: campaign._id,
            eventType: 'view_product',
            external_product_ids: data.external_product_ids,
            internalProductId: product?._id,
            eventData: {},
        });
    }

    /**
     * Track an add-to-cart event.
     */
    async trackAddToCart(clientId: string, data: TrackAddToCartDto): Promise<void> {
        const campaign = await this.getOrCreateCampaign(clientId, data.campaignParams);

        const product = await this.productModel.findOne({
            clientId,
            external_ids: data.external_product_ids
        });

        await this.campaignEventModel.create({
            clientId,
            campaignId: campaign._id,
            eventType: 'add_to_cart',
            external_product_ids: data.external_product_ids,
            internalProductId: product?._id,
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

        const order = await this.orderModel.findOne({
            clientId,
            external_ids: data.external_order_ids
        });

        await this.campaignEventModel.create({
            clientId,
            campaignId: campaign._id,
            eventType: 'purchase',
            external_order_ids: data.external_order_ids,
            internalOrderId: order?._id,
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
            // If query is a string, assume it's a campaignId
            matchQuery = {
                clientId,
                campaignId: query  // This is where the fix is
            };
        } else {
            // Apply additional filters based on DTO values
            if (query.utmSource) matchQuery['campaign.utmSource'] = query.utmSource;
            if (query.utmCampaign) matchQuery['campaign.utmCampaign'] = query.utmCampaign;
            if (query.startDate) matchQuery.createdAt = { $gte: new Date(query.startDate) };
            if (query.endDate) matchQuery.createdAt = { ...matchQuery.createdAt, $lte: new Date(query.endDate) };
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
    async listCampaigns(clientId: string, options: { page?: number; limit?: number; search?: string }) {
        const page = options.page || 1;
        const limit = options.limit || 10;
        const skip = (page - 1) * limit;

        const client = await this.clientModel.findById(clientId);
        const connectedClientIds = await this.getConnectedClientIds(client);

        let query: any = { clientId: { $in: connectedClientIds } };
        if (options.search) {
            query.$or = [
                { utmCampaign: { $regex: options.search, $options: 'i' } },
                { utmSource: { $regex: options.search, $options: 'i' } },
                { utmMedium: { $regex: options.search, $options: 'i' } },
            ];
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

        const campaignsWithStats = await Promise.all(
            campaigns.map(async (campaign) => {
                const stats = await this.getCampaignStats(campaign.clientId, campaign._id);
                return {
                    ...campaign,
                    stats,
                    isConnectedCampaign: campaign.clientId.toString() !== clientId
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
        const client = await this.clientModel.findById(clientId);
        const connectedClientIds = await this.getConnectedClientIds(client);

        let dateFilter: any = {};
        if (timeframe) {
            const now = new Date();
            dateFilter = {
                $gte: new Date(now.setDate(now.getDate() - parseInt(timeframe)))
            };
        }

        const matchQuery = {
            clientId: { $in: connectedClientIds },
            ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {})
        };

        const [viewCount, cartCount, purchaseCount, revenue] = await Promise.all([
            this.campaignEventModel.countDocuments({ ...matchQuery, eventType: 'view_product' }),
            this.campaignEventModel.countDocuments({ ...matchQuery, eventType: 'add_to_cart' }),
            this.campaignEventModel.countDocuments({ ...matchQuery, eventType: 'purchase' }),
            this.campaignEventModel
                .aggregate([
                    { $match: { ...matchQuery, eventType: 'purchase' } },
                    { $group: { _id: null, total: { $sum: '$eventData.total' } } }
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
        const client = await this.clientModel.findById(clientId);
        const connectedClientIds = await this.getConnectedClientIds(client);

        const campaign = await this.campaignModel.findOne({
            _id: campaignId,
            clientId: { $in: connectedClientIds }
        });

        if (!campaign) {
            throw new NotFoundException('Campaign not found');
        }

        const stats = await this.getCampaignStats(campaign.clientId, campaignId);
        return {
            campaign,
            stats,
            isConnectedCampaign: campaign.clientId.toString() !== clientId
        };
    }


    private async getConnectedClientIds(client: any): Promise<string[]> {
        if (!client?.venueBoostConnection?.venueShortCode) {
            return [client._id.toString()];
        }

        const connectedClients = await this.clientModel.find({
            'venueBoostConnection.venueShortCode': client.venueBoostConnection.venueShortCode,
            'venueBoostConnection.status': 'connected'
        });

        return connectedClients.map(c => c._id.toString());
    }
}
