// src/tracking/services/campaign-tracking.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Campaign } from '../schemas/campaign.schema';
import { CampaignEvent } from '../schemas/campaign-event.schema';
import {
    CampaignParamsDto,
    TrackAddToCartDto,
    TrackPurchaseDto,
    ListCampaignStatsDto
} from '../dtos/campaign-tracking.dto';

@Injectable()
export class CampaignTrackingService {
    constructor(
        @InjectModel(Campaign.name) private campaignModel: Model<Campaign>,
        @InjectModel(CampaignEvent.name) private campaignEventModel: Model<CampaignEvent>,
    ) {}

    private async getOrCreateCampaign(clientId: string, params: CampaignParamsDto): Promise<Campaign> {
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
                    ...params
                }
            },
            {
                upsert: true,
                new: true
            }
        );

        return campaign;
    }

    async trackViewProduct(clientId: string, productId: string, campaignParams: CampaignParamsDto): Promise<void> {
        const campaign = await this.getOrCreateCampaign(clientId, campaignParams);

        await this.campaignEventModel.create({
            clientId,
            campaignId: campaign._id,
            eventType: 'view_product',
            productId,
            eventData: {}
        });
    }

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
                currency: data.currency
            }
        });
    }

    async trackPurchase(clientId: string, data: TrackPurchaseDto): Promise<void> {
        const campaign = await this.getOrCreateCampaign(clientId, data.campaignParams);

        await this.campaignEventModel.create({
            clientId,
            campaignId: campaign._id,
            eventType: 'purchase',
            orderId: data.orderId,
            eventData: {
                total: data.total,
                currency: data.currency
            }
        });
    }

    // Analytics methods
    async getCampaignStats(clientId: string, query: string | ListCampaignStatsDto) {
        let matchQuery: any = { clientId };

        if (typeof query === 'string') {
            // If query is a string, it's a campaignId
            matchQuery.campaignId = query;
        } else {
            // Handle filter parameters
            if (query.utmSource) matchQuery['campaign.utmSource'] = query.utmSource;
            if (query.utmCampaign) matchQuery['campaign.utmCampaign'] = query.utmCampaign;
            if (query.startDate) matchQuery.createdAt = { $gte: new Date(query.startDate) };
            if (query.endDate) matchQuery.createdAt = { ...matchQuery.createdAt, $lte: new Date(query.endDate) };
        }

        const [viewCount, cartCount, purchaseCount, revenue] = await Promise.all([
            this.campaignEventModel.countDocuments({ ...matchQuery, eventType: 'view_product' }),
            this.campaignEventModel.countDocuments({ ...matchQuery, eventType: 'add_to_cart' }),
            this.campaignEventModel.countDocuments({ ...matchQuery, eventType: 'purchase' }),
            this.campaignEventModel.aggregate([
                {
                    $match: { ...matchQuery, eventType: 'purchase' }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$eventData.total' }
                    }
                }
            ]).then(result => result[0]?.total || 0)
        ]);

        return {
            viewCount,
            cartCount,
            purchaseCount,
            revenue,
            conversionRate: purchaseCount > 0 ? (purchaseCount / viewCount * 100).toFixed(2) + '%' : '0%'
        };
    }
}