// src/services/general-campaign.service.ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GeneralCampaign, CampaignStatus, CampaignType } from '../schemas/general-campaign.schema';
import { Client } from '../schemas/client.schema';
import { VenueBoostService } from './venueboost.service';

interface FindAllOptions {
    page: number;
    limit: number;
    search?: string;
    status?: CampaignStatus;
    type?: CampaignType;
    sent?: boolean;
}

@Injectable()
export class GeneralCampaignService {
    private readonly logger = new Logger(GeneralCampaignService.name);

    constructor(
        @InjectModel(GeneralCampaign.name) private campaignModel: Model<GeneralCampaign>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        private readonly venueBoostService: VenueBoostService
    ) {}

    /**
     * Find all campaigns with filtering and pagination
     */
    async findAll(clientId: string, options: FindAllOptions) {
        try {
            const { page, limit, search, status, type, sent } = options;
            const skip = (page - 1) * limit;

            // Build the filter
            const filter: any = { clientId };

            // Add status filter if provided
            if (status) {
                filter.status = status;
            }

            // Add type filter if provided
            if (type) {
                filter.type = type;
            }

            // Add sent filter if provided
            if (sent !== undefined) {
                filter.sent = sent;
            }

            // Add search filter if provided
            if (search) {
                filter.$or = [
                    { title: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } }
                ];
            }

            // Execute the query with pagination
            const [campaigns, total] = await Promise.all([
                this.campaignModel
                    .find(filter)
                    .sort({ scheduledDate: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                this.campaignModel.countDocuments(filter)
            ]);

            // Calculate pagination metadata
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPrevPage = page > 1;

            return {
                data: campaigns,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                    hasNextPage,
                    hasPrevPage
                }
            };
        } catch (error) {
            this.logger.error(`Error finding campaigns: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Find a campaign by ID
     */
    async findById(clientId: string, id: string) {
        const campaign = await this.campaignModel.findOne({
            _id: id,
            clientId
        }).lean();

        if (!campaign) {
            throw new NotFoundException('Campaign not found');
        }

        return { data: campaign };
    }

    /**
     * Sync campaigns from VenueBoost for a client
     */
    async syncCampaignsFromVenueBoost(clientId: string): Promise<{
        success: boolean;
        message: string;
        created: number;
        updated: number;
        unchanged: number;
        errors: number;
        errorDetails?: Array<{campaignId: string, error: string}>;
    }> {
        try {
            // Get the client
            const client = await this.clientModel.findById(clientId);
            if (!client) {
                throw new NotFoundException('Client not found');
            }

            // Get campaigns from VenueBoost
            const response = await this.venueBoostService.listCampaigns(clientId);
            const campaigns = response.data || [];

            // Tracking stats
            let created = 0, updated = 0, unchanged = 0, errors = 0;
            const errorDetails = [];

            // Process each campaign
            for (const vbCampaign of campaigns) {
                try {
                    // Check if the campaign already exists in our system
                    const existingCampaign = await this.campaignModel.findOne({
                        'externalIds.venueBoostId': vbCampaign.id.toString()
                    });

                    // Map status
                    const campaignStatus = vbCampaign.sent ?
                        CampaignStatus.SENT : CampaignStatus.SCHEDULED;

                    // Map type
                    const campaignType = this.mapVenueBoostTypeToCampaignType(vbCampaign.type);

                    if (existingCampaign) {
                        // Campaign exists - check if it needs to be updated
                        let needsUpdate = false;

                        if (existingCampaign.status !== campaignStatus) {
                            existingCampaign.status = campaignStatus;
                            needsUpdate = true;
                        }

                        if (existingCampaign.title !== vbCampaign.title) {
                            existingCampaign.title = vbCampaign.title;
                            needsUpdate = true;
                        }

                        if (existingCampaign.description !== vbCampaign.description) {
                            existingCampaign.description = vbCampaign.description;
                            needsUpdate = true;
                        }

                        if (existingCampaign.link !== vbCampaign.link) {
                            existingCampaign.link = vbCampaign.link;
                            needsUpdate = true;
                        }

                        if (existingCampaign.type !== campaignType) {
                            existingCampaign.type = campaignType;
                            needsUpdate = true;
                        }

                        if (existingCampaign.target !== vbCampaign.target) {
                            existingCampaign.target = vbCampaign.target;
                            needsUpdate = true;
                        }

                        // Check if the scheduled date is different
                        const scheduledDate = new Date(vbCampaign.scheduled_date);
                        if (existingCampaign.scheduledDate.getTime() !== scheduledDate.getTime()) {
                            existingCampaign.scheduledDate = scheduledDate;
                            needsUpdate = true;
                        }

                        if (existingCampaign.sent !== vbCampaign.sent) {
                            existingCampaign.sent = vbCampaign.sent;
                            needsUpdate = true;
                        }

                        // Initialize metadata if it doesn't exist
                        if (!existingCampaign.metadata) {
                            existingCampaign.metadata = new Map<string, any>();
                        }

                        // Update venueId in metadata
                        if (existingCampaign.metadata.get('venueId') !== vbCampaign.venue_id) {
                            existingCampaign.metadata.set('venueId', vbCampaign.venue_id);
                            needsUpdate = true;
                        }

                        // Update promotion and vbPromotionId in metadata
                        if (vbCampaign.promotion) {
                            if (existingCampaign.metadata.get('vbPromotionId') !== vbCampaign.promotion.id) {
                                existingCampaign.metadata.set('vbPromotionId', vbCampaign.promotion.id);
                                needsUpdate = true;
                            }

                            if (JSON.stringify(existingCampaign.metadata.get('promotion')) !== JSON.stringify(vbCampaign.promotion)) {
                                existingCampaign.metadata.set('promotion', vbCampaign.promotion);
                                needsUpdate = true;
                            }
                        } else if (existingCampaign.metadata.has('vbPromotionId') || existingCampaign.metadata.has('promotion')) {
                            // Remove promotion data if it's no longer present
                            existingCampaign.metadata.delete('vbPromotionId');
                            existingCampaign.metadata.delete('promotion');
                            needsUpdate = true;
                        }

                        if (needsUpdate) {
                            await existingCampaign.save();
                            updated++;
                        } else {
                            unchanged++;
                        }

                        // Check if we need to update the external ID in VenueBoost
                        const vbExternalIds = vbCampaign.external_ids || {};
                        if (!vbExternalIds.omniStackId || vbExternalIds.omniStackId !== existingCampaign._id.toString()) {
                            // Send our ID to VenueBoost
                            await this.venueBoostService.updateCampaignExternalId(
                                clientId,
                                vbCampaign.id.toString(),
                                existingCampaign._id.toString()
                            );
                        }
                    } else {
                        // Campaign doesn't exist - create it
                        // Create metadata map with venueId, promotion, and vbPromotionId
                        const metadata = new Map<string, any>();
                        metadata.set('venueId', vbCampaign.venue_id);

                        if (vbCampaign.promotion) {
                            metadata.set('vbPromotionId', vbCampaign.promotion.id);
                            metadata.set('promotion', vbCampaign.promotion);
                        }

                        const newCampaign = await this.campaignModel.create({
                            clientId,
                            title: vbCampaign.title,
                            description: vbCampaign.description,
                            link: vbCampaign.link,
                            type: campaignType,
                            target: vbCampaign.target,
                            scheduledDate: new Date(vbCampaign.scheduled_date),
                            sent: vbCampaign.sent,
                            status: campaignStatus,
                            externalIds: {
                                venueBoostId: vbCampaign.id.toString()
                            },
                            metadata: metadata
                        });

                        // Send our ID to VenueBoost
                        await this.venueBoostService.updateCampaignExternalId(
                            clientId,
                            vbCampaign.id.toString(),
                            newCampaign._id.toString()
                        );

                        created++;
                    }
                } catch (error) {
                    const errorMsg = `Error processing campaign: ${error.message}`;
                    this.logger.error(`Error processing campaign ${vbCampaign.id}: ${error.message}`);
                    errorDetails.push({ campaignId: vbCampaign.id.toString(), error: errorMsg });
                    errors++;
                }
            }

            return {
                success: true,
                message: `Sync completed: ${created} created, ${updated} updated, ${unchanged} unchanged, ${errors} errors`,
                created,
                updated,
                unchanged,
                errors,
                errorDetails
            };
        } catch (error) {
            this.logger.error(`Error syncing campaigns from VenueBoost: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Delete a campaign
     */
    async deleteCampaign(clientId: string, campaignId: string): Promise<{ success: boolean; message: string }> {
        try {
            // Find the campaign to get VenueBoost ID
            const campaign = await this.campaignModel.findOne({
                _id: campaignId,
                clientId
            });

            if (!campaign) {
                return {
                    success: false,
                    message: 'Campaign not found or does not belong to this client'
                };
            }

            // Check if this campaign has VenueBoost integration
            if (campaign.externalIds?.venueBoostId) {
                // Delete in VenueBoost first
                const vbResult = await this.venueBoostService.deleteCampaign(
                    clientId,
                    campaign.externalIds.venueBoostId
                );

                // If VenueBoost deletion fails with something other than "not found", stop the process
                if (!vbResult.success && vbResult.statusCode !== 404) {
                    return {
                        success: false,
                        message: `Failed to delete campaign in VenueBoost: ${vbResult.message}`
                    };
                }
            }

            // Delete the campaign from our database
            await this.campaignModel.findByIdAndDelete(campaignId);

            return {
                success: true,
                message: 'Campaign deleted successfully'
            };
        } catch (error) {
            this.logger.error(`Error deleting campaign: ${error.message}`, error.stack);
            return {
                success: false,
                message: `Error deleting campaign: ${error.message}`
            };
        }
    }

    /**
     * Map VenueBoost type to CampaignType enum
     */
    private mapVenueBoostTypeToCampaignType(vbType: string): CampaignType {
        switch (vbType) {
            case 'SMS':
                return CampaignType.SMS;
            case 'Email':
                return CampaignType.EMAIL;
            default:
                return CampaignType.EMAIL; // Default to email if unknown
        }
    }
}