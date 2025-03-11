// src/services/discount.service.ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Discount, DiscountType } from '../schemas/discount.schema';
import { Client } from '../schemas/client.schema';
import { VenueBoostService } from './venueboost.service';

interface FindAllOptions {
    page: number;
    limit: number;
    search?: string;
    status?: boolean;
    type?: DiscountType;
}

@Injectable()
export class DiscountService {
    private readonly logger = new Logger(DiscountService.name);

    constructor(
        @InjectModel(Discount.name) private discountModel: Model<Discount>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        private readonly venueBoostService: VenueBoostService
    ) {}

    /**
     * Find all discounts with filtering and pagination
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
                    { 'metadata.product.title': { $regex: search, $options: 'i' } },
                    { 'metadata.category.name': { $regex: search, $options: 'i' } },
                    { 'metadata.rentalUnit.name': { $regex: search, $options: 'i' } }
                ];
            }

            // Execute the query with pagination
            const [discounts, total] = await Promise.all([
                this.discountModel
                    .find(filter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                this.discountModel.countDocuments(filter)
            ]);

            // Calculate pagination metadata
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPrevPage = page > 1;

            return {
                data: discounts,
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
            this.logger.error(`Error finding discounts: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Find a discount by ID
     */
    async findById(clientId: string, id: string) {
        const discount = await this.discountModel.findOne({
            _id: id,
            clientId
        }).lean();

        if (!discount) {
            throw new NotFoundException('Discount not found');
        }

        return { data: discount };
    }

    /**
     * Sync discounts from VenueBoost for a client
     */
    async syncDiscountsFromVenueBoost(clientId: string): Promise<{
        success: boolean;
        message: string;
        created: number;
        updated: number;
        unchanged: number;
        errors: number;
        errorDetails?: Array<{discountId: string, error: string}>;
    }> {
        try {
            // Get the client
            const client = await this.clientModel.findById(clientId);
            if (!client) {
                throw new NotFoundException('Client not found');
            }

            // Get discounts from VenueBoost
            const response = await this.venueBoostService.listDiscounts(clientId);
            const discounts = response.data || [];

            // Tracking stats
            let created = 0, updated = 0, unchanged = 0, errors = 0;
            const errorDetails = [];

            // Process each discount
            for (const vbDiscount of discounts) {
                try {
                    // Check if the discount already exists in our system
                    const existingDiscount = await this.discountModel.findOne({
                        'externalIds.venueBoostId': vbDiscount.id.toString()
                    });

                    // Map discount type
                    const discountType = this.mapVenueBoostTypeToDiscountType(vbDiscount.type);

                    if (existingDiscount) {
                        // Discount exists - check if it needs to be updated
                        let needsUpdate = false;

                        if (existingDiscount.type !== discountType) {
                            existingDiscount.type = discountType;
                            needsUpdate = true;
                        }

                        if (existingDiscount.value !== vbDiscount.value) {
                            existingDiscount.value = vbDiscount.value;
                            needsUpdate = true;
                        }

                        if (existingDiscount.status !== vbDiscount.status) {
                            existingDiscount.status = vbDiscount.status;
                            needsUpdate = true;
                        }

                        if (existingDiscount.reservationCount !== vbDiscount.reservation_count) {
                            existingDiscount.reservationCount = vbDiscount.reservation_count;
                            needsUpdate = true;
                        }

                        // Check if the start time or end time is different
                        const startTime = new Date(vbDiscount.start_time);
                        if (existingDiscount.startTime.getTime() !== startTime.getTime()) {
                            existingDiscount.startTime = startTime;
                            needsUpdate = true;
                        }

                        const endTime = new Date(vbDiscount.end_time);
                        if (existingDiscount.endTime.getTime() !== endTime.getTime()) {
                            existingDiscount.endTime = endTime;
                            needsUpdate = true;
                        }

                        // Initialize metadata if it doesn't exist
                        if (!existingDiscount.metadata) {
                            existingDiscount.metadata = new Map<string, any>();
                        }

                        // Update venueId in metadata
                        if (existingDiscount.metadata.get('venueId') !== vbDiscount.venue_id) {
                            existingDiscount.metadata.set('venueId', vbDiscount.venue_id);
                            needsUpdate = true;
                        }

                        // Update promotion data in metadata
                        if (vbDiscount.promotion) {
                            if (JSON.stringify(existingDiscount.metadata.get('promotion')) !== JSON.stringify(vbDiscount.promotion)) {
                                existingDiscount.metadata.set('promotion', vbDiscount.promotion);
                                needsUpdate = true;
                            }

                            if (existingDiscount.metadata.get('vbPromotionId') !== vbDiscount.promotion.id) {
                                existingDiscount.metadata.set('vbPromotionId', vbDiscount.promotion.id);
                                needsUpdate = true;
                            }
                        } else if (existingDiscount.metadata.has('promotion') || existingDiscount.metadata.has('vbPromotionId')) {
                            existingDiscount.metadata.delete('promotion');
                            existingDiscount.metadata.delete('vbPromotionId');
                            needsUpdate = true;
                        }

                        // Update product data in metadata
                        if (vbDiscount.product) {
                            if (JSON.stringify(existingDiscount.metadata.get('product')) !== JSON.stringify(vbDiscount.product)) {
                                existingDiscount.metadata.set('product', vbDiscount.product);
                                needsUpdate = true;
                            }
                        } else if (existingDiscount.metadata.has('product')) {
                            existingDiscount.metadata.delete('product');
                            needsUpdate = true;
                        }

                        // Update category data in metadata
                        if (vbDiscount.category) {
                            if (JSON.stringify(existingDiscount.metadata.get('category')) !== JSON.stringify(vbDiscount.category)) {
                                existingDiscount.metadata.set('category', vbDiscount.category);
                                needsUpdate = true;
                            }
                        } else if (existingDiscount.metadata.has('category')) {
                            existingDiscount.metadata.delete('category');
                            needsUpdate = true;
                        }

                        // Update rental unit data in metadata
                        if (vbDiscount.rental_unit) {
                            if (JSON.stringify(existingDiscount.metadata.get('rentalUnit')) !== JSON.stringify(vbDiscount.rental_unit)) {
                                existingDiscount.metadata.set('rentalUnit', vbDiscount.rental_unit);
                                needsUpdate = true;
                            }
                        } else if (existingDiscount.metadata.has('rentalUnit')) {
                            existingDiscount.metadata.delete('rentalUnit');
                            needsUpdate = true;
                        }

                        // Update userId in metadata
                        if (existingDiscount.metadata.get('userId') !== vbDiscount.user_id) {
                            existingDiscount.metadata.set('userId', vbDiscount.user_id);
                            needsUpdate = true;
                        }

                        // Update selectedProduct in metadata
                        if (existingDiscount.metadata.get('selectedProduct') !== vbDiscount.selected_product) {
                            existingDiscount.metadata.set('selectedProduct', vbDiscount.selected_product);
                            needsUpdate = true;
                        }

                        // Update additional fields
                        if (existingDiscount.productId !== vbDiscount.product_id) {
                            existingDiscount.productId = vbDiscount.product_id;
                            needsUpdate = true;
                        }

                        if (existingDiscount.categoryId !== vbDiscount.category_id) {
                            existingDiscount.categoryId = vbDiscount.category_id;
                            needsUpdate = true;
                        }

                        if (existingDiscount.rentalUnitId !== vbDiscount.rental_unit_id) {
                            existingDiscount.rentalUnitId = vbDiscount.rental_unit_id;
                            needsUpdate = true;
                        }

                        if (existingDiscount.productIds !== vbDiscount.product_ids) {
                            existingDiscount.productIds = vbDiscount.product_ids;
                            needsUpdate = true;
                        }

                        if (existingDiscount.applyFor !== vbDiscount.apply_for) {
                            existingDiscount.applyFor = vbDiscount.apply_for;
                            needsUpdate = true;
                        }

                        if (existingDiscount.minimumSpent !== vbDiscount.minimum_spent) {
                            existingDiscount.minimumSpent = vbDiscount.minimum_spent;
                            needsUpdate = true;
                        }

                        if (existingDiscount.usageLimitPerCoupon !== vbDiscount.usage_limit_per_coupon) {
                            existingDiscount.usageLimitPerCoupon = vbDiscount.usage_limit_per_coupon;
                            needsUpdate = true;
                        }

                        if (existingDiscount.usageLimitPerCustomer !== vbDiscount.usage_limit_per_customer) {
                            existingDiscount.usageLimitPerCustomer = vbDiscount.usage_limit_per_customer;
                            needsUpdate = true;
                        }

                        if (existingDiscount.couponUse !== vbDiscount.coupon_use) {
                            existingDiscount.couponUse = vbDiscount.coupon_use;
                            needsUpdate = true;
                        }

                        if (existingDiscount.userId !== vbDiscount.user_id) {
                            existingDiscount.userId = vbDiscount.user_id;
                            needsUpdate = true;
                        }

                        if (existingDiscount.selectedProduct !== vbDiscount.selected_product) {
                            existingDiscount.selectedProduct = vbDiscount.selected_product;
                            needsUpdate = true;
                        }

                        if (needsUpdate) {
                            await existingDiscount.save();
                            updated++;
                        } else {
                            unchanged++;
                        }

                        // Check if we need to update the external ID in VenueBoost
                        const vbExternalIds = vbDiscount.external_ids || {};
                        if (!vbExternalIds.omniStackId || vbExternalIds.omniStackId !== existingDiscount._id.toString()) {
                            // Send our ID to VenueBoost
                            await this.venueBoostService.updateDiscountExternalId(
                                clientId,
                                vbDiscount.id.toString(),
                                existingDiscount._id.toString()
                            );
                        }
                    } else {
                        // Discount doesn't exist - create it
                        // Create metadata map for additional information
                        const metadata = new Map<string, any>();

                        // Store all relevant metadata
                        metadata.set('venueId', vbDiscount.venue_id);

                        if (vbDiscount.promotion) {
                            metadata.set('promotion', vbDiscount.promotion);
                            metadata.set('vbPromotionId', vbDiscount.promotion.id);
                        }

                        if (vbDiscount.product) {
                            metadata.set('product', vbDiscount.product);
                        }

                        if (vbDiscount.category) {
                            metadata.set('category', vbDiscount.category);
                        }

                        if (vbDiscount.rental_unit) {
                            metadata.set('rentalUnit', vbDiscount.rental_unit);
                        }

                        if (vbDiscount.user_id) {
                            metadata.set('userId', vbDiscount.user_id);
                        }

                        if (vbDiscount.selected_product) {
                            metadata.set('selectedProduct', vbDiscount.selected_product);
                        }

                        const newDiscount = await this.discountModel.create({
                            clientId,
                            type: discountType,
                            value: vbDiscount.value,
                            status: vbDiscount.status,
                            startTime: new Date(vbDiscount.start_time),
                            endTime: new Date(vbDiscount.end_time),
                            reservationCount: vbDiscount.reservation_count || 0,
                            productId: vbDiscount.product_id,
                            categoryId: vbDiscount.category_id,
                            rentalUnitId: vbDiscount.rental_unit_id,
                            productIds: vbDiscount.product_ids,
                            applyFor: vbDiscount.apply_for,
                            minimumSpent: vbDiscount.minimum_spent,
                            usageLimitPerCoupon: vbDiscount.usage_limit_per_coupon,
                            usageLimitPerCustomer: vbDiscount.usage_limit_per_customer,
                            couponUse: vbDiscount.coupon_use || 0,
                            userId: vbDiscount.user_id,
                            selectedProduct: vbDiscount.selected_product,
                            externalIds: {
                                venueBoostId: vbDiscount.id.toString()
                            },
                            metadata: metadata
                        });

                        // Send our ID to VenueBoost
                        await this.venueBoostService.updateDiscountExternalId(
                            clientId,
                            vbDiscount.id.toString(),
                            newDiscount._id.toString()
                        );

                        created++;
                    }
                } catch (error) {
                    const errorMsg = `Error processing discount: ${error.message}`;
                    this.logger.error(`Error processing discount ${vbDiscount.id}: ${error.message}`);
                    errorDetails.push({ discountId: vbDiscount.id.toString(), error: errorMsg });
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
            this.logger.error(`Error syncing discounts from VenueBoost: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Delete a discount
     */
    async deleteDiscount(clientId: string, discountId: string): Promise<{ success: boolean; message: string }> {
        try {
            // Find the discount to get VenueBoost ID
            const discount = await this.discountModel.findOne({
                _id: discountId,
                clientId
            });

            if (!discount) {
                return {
                    success: false,
                    message: 'Discount not found or does not belong to this client'
                };
            }

            // Check if this discount has VenueBoost integration
            if (discount.externalIds?.venueBoostId) {
                // Delete in VenueBoost first
                const vbResult = await this.venueBoostService.deleteDiscount(
                    clientId,
                    discount.externalIds.venueBoostId
                );

                // If VenueBoost deletion fails with something other than "not found", stop the process
                if (!vbResult.success && vbResult.statusCode !== 404) {
                    return {
                        success: false,
                        message: `Failed to delete discount in VenueBoost: ${vbResult.message}`
                    };
                }
            }

            // Delete the discount from our database
            await this.discountModel.findByIdAndDelete(discountId);

            return {
                success: true,
                message: 'Discount deleted successfully'
            };
        } catch (error) {
            this.logger.error(`Error deleting discount: ${error.message}`, error.stack);
            return {
                success: false,
                message: `Error deleting discount: ${error.message}`
            };
        }
    }

    /**
     * Map VenueBoost type to DiscountType enum
     */
    private mapVenueBoostTypeToDiscountType(vbType: string): DiscountType {
        switch (vbType?.toLowerCase()) {
            case 'fixed':
                return DiscountType.FIXED;
            case 'percentage':
                return DiscountType.PERCENTAGE;
            default:
                return DiscountType.FIXED;
        }
    }
}