// src/services/promotion.service.ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Promotion } from '../schemas/promotion.schema';
import { Client } from '../schemas/client.schema';
import { VenueBoostService } from './venueboost.service';

interface FindAllOptions {
    page: number;
    limit: number;
    search?: string;
    status?: boolean;
    type?: string;
}

@Injectable()
export class PromotionService {
    private readonly logger = new Logger(PromotionService.name);

    constructor(
        @InjectModel(Promotion.name) private promotionModel: Model<Promotion>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        private readonly venueBoostService: VenueBoostService
    ) {}

    /**
     * Find all promotions with filtering and pagination
     */
    async findAll(clientId: string, options: FindAllOptions) {
        try {
            const { page, limit, search, status, type } = options;
            const skip = (page - 1) * limit;

            // Build the filter
            const filter: any = { clientId };

            // Add status filter if provided
            if (status !== undefined) {
                filter.status = status;
            }

            // Add type filter if provided
            if (type) {
                filter.type = type;
            }

            // Add search filter if provided
            if (search) {
                filter.$or = [
                    { title: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } }
                ];
            }

            // Execute the query with pagination
            const [promotions, total] = await Promise.all([
                this.promotionModel
                    .find(filter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                this.promotionModel.countDocuments(filter)
            ]);

            // Calculate pagination metadata
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPrevPage = page > 1;

            return {
                data: promotions,
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
            this.logger.error(`Error finding promotions: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Find a promotion by ID
     */
    async findById(clientId: string, id: string) {
        const promotion = await this.promotionModel.findOne({
            _id: id,
            clientId
        }).lean();

        if (!promotion) {
            throw new NotFoundException('Promotion not found');
        }

        return { data: promotion };
    }

    /**
     * Sync promotions from VenueBoost for a client
     */
    async syncPromotionsFromVenueBoost(clientId: string): Promise<{
        success: boolean;
        message: string;
        created: number;
        updated: number;
        unchanged: number;
        errors: number;
        errorDetails?: Array<{promotionId: string, error: string}>;
    }> {
        try {
            // Get the client
            const client = await this.clientModel.findById(clientId);
            if (!client) {
                throw new NotFoundException('Client not found');
            }

            // Get promotions from VenueBoost
            const response = await this.venueBoostService.listPromotions(clientId);
            const promotions = response.data || [];

            // Tracking stats
            let created = 0, updated = 0, unchanged = 0, errors = 0;
            const errorDetails = [];

            // Process each promotion
            for (const vbPromotion of promotions) {
                try {
                    // Check if the promotion already exists in our system
                    const existingPromotion = await this.promotionModel.findOne({
                        'externalIds.venueBoostId': vbPromotion.id.toString()
                    });

                    if (existingPromotion) {
                        // Promotion exists - check if it needs to be updated
                        let needsUpdate = false;

                        if (existingPromotion.title !== vbPromotion.title) {
                            existingPromotion.title = vbPromotion.title;
                            needsUpdate = true;
                        }

                        if (existingPromotion.description !== vbPromotion.description) {
                            existingPromotion.description = vbPromotion.description;
                            needsUpdate = true;
                        }

                        if (existingPromotion.type !== vbPromotion.type) {
                            existingPromotion.type = vbPromotion.type;
                            needsUpdate = true;
                        }

                        if (existingPromotion.status !== vbPromotion.status) {
                            existingPromotion.status = vbPromotion.status;
                            needsUpdate = true;
                        }

                        // Check if the start time or end time is different
                        if (vbPromotion.start_time && (!existingPromotion.startTime ||
                            existingPromotion.startTime.getTime() !== new Date(vbPromotion.start_time).getTime())) {
                            existingPromotion.startTime = new Date(vbPromotion.start_time);
                            needsUpdate = true;
                        }

                        if (vbPromotion.end_time && (!existingPromotion.endTime ||
                            existingPromotion.endTime.getTime() !== new Date(vbPromotion.end_time).getTime())) {
                            existingPromotion.endTime = new Date(vbPromotion.end_time);
                            needsUpdate = true;
                        }

                        // Initialize metadata if it doesn't exist
                        if (!existingPromotion.metadata) {
                            existingPromotion.metadata = new Map<string, any>();
                        }

                        // Update venueId in metadata
                        if (existingPromotion.metadata.get('venueId') !== vbPromotion.venue_id) {
                            existingPromotion.metadata.set('venueId', vbPromotion.venue_id);
                            needsUpdate = true;
                        }

                        if (needsUpdate) {
                            await existingPromotion.save();
                            updated++;
                        } else {
                            unchanged++;
                        }

                        // Check if we need to update the external ID in VenueBoost
                        const vbExternalIds = vbPromotion.external_ids || {};
                        if (!vbExternalIds.omniStackId || vbExternalIds.omniStackId !== existingPromotion._id.toString()) {
                            // Send our ID to VenueBoost
                            await this.venueBoostService.updatePromotionExternalId(
                                clientId,
                                vbPromotion.id.toString(),
                                existingPromotion._id.toString()
                            );
                        }
                    } else {
                        // Promotion doesn't exist - create it
                        // Create metadata map with venueId
                        const metadata = new Map<string, any>();
                        metadata.set('venueId', vbPromotion.venue_id);

                        const newPromotion = await this.promotionModel.create({
                            clientId,
                            title: vbPromotion.title,
                            description: vbPromotion.description,
                            type: vbPromotion.type,
                            status: vbPromotion.status,
                            startTime: vbPromotion.start_time ? new Date(vbPromotion.start_time) : undefined,
                            endTime: vbPromotion.end_time ? new Date(vbPromotion.end_time) : undefined,
                            externalIds: {
                                venueBoostId: vbPromotion.id.toString()
                            },
                            metadata: metadata
                        });

                        // Send our ID to VenueBoost
                        await this.venueBoostService.updatePromotionExternalId(
                            clientId,
                            vbPromotion.id.toString(),
                            newPromotion._id.toString()
                        );

                        created++;
                    }
                } catch (error) {
                    const errorMsg = `Error processing promotion: ${error.message}`;
                    this.logger.error(`Error processing promotion ${vbPromotion.id}: ${error.message}`);
                    errorDetails.push({ promotionId: vbPromotion.id.toString(), error: errorMsg });
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
            this.logger.error(`Error syncing promotions from VenueBoost: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Delete a promotion
     */
    async deletePromotion(clientId: string, promotionId: string): Promise<{ success: boolean; message: string }> {
        try {
            // Find the promotion to get VenueBoost ID
            const promotion = await this.promotionModel.findOne({
                _id: promotionId,
                clientId
            });

            if (!promotion) {
                return {
                    success: false,
                    message: 'Promotion not found or does not belong to this client'
                };
            }

            // Check if this promotion has VenueBoost integration
            if (promotion.externalIds?.venueBoostId) {
                // Delete in VenueBoost first
                const vbResult = await this.venueBoostService.deletePromotion(
                    clientId,
                    promotion.externalIds.venueBoostId
                );

                // If VenueBoost deletion fails with something other than "not found", stop the process
                if (!vbResult.success && vbResult.statusCode !== 404) {
                    return {
                        success: false,
                        message: `Failed to delete promotion in VenueBoost: ${vbResult.message}`
                    };
                }
            }

            // Delete the promotion from our database
            await this.promotionModel.findByIdAndDelete(promotionId);

            return {
                success: true,
                message: 'Promotion deleted successfully'
            };
        } catch (error) {
            this.logger.error(`Error deleting promotion: ${error.message}`, error.stack);
            return {
                success: false,
                message: `Error deleting promotion: ${error.message}`
            };
        }
    }
}