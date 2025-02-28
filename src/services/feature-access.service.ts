// src/services/feature-access.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business, SubscriptionStatus } from '../schemas/business.schema';
import { TIER_FEATURES, TIER_LIMITS } from '../constants/features.constants';

@Injectable()
export class FeatureAccessService {
    private readonly logger = new Logger(FeatureAccessService.name);

    constructor(
        @InjectModel(Business.name) private businessModel: Model<Business>
    ) {}

    /**
     * Get the subscription plan tier from the business
     */
    private getSubscriptionTier(business: Business): string {
        // If business is in trial, use trialing tier
        if (business.subscriptionStatus === SubscriptionStatus.TRIALING) {
            return 'trialing';
        }

        // If business subscription is not active, no features are available
        if (business.subscriptionStatus !== SubscriptionStatus.ACTIVE) {
            return null;
        }

        // Get the tier from subscription details
        const planId = business.subscriptionDetails?.planId;
        if (!planId) {
            return null;
        }

        // Extract tier from plan ID
        const tierFromPlanId = planId.includes('basic') ? 'basic' :
            planId.includes('professional') ? 'professional' :
                planId.includes('enterprise') ? 'enterprise' : null;

        // Check metadata for tier info as fallback
        const tierFromMetadata = business.metadata?.get('subscriptionTier') || null;

        return tierFromPlanId || tierFromMetadata || null;
    }

    /**
     * Get all features available for the business based on subscription
     */
    async getBusinessFeatures(businessId: string): Promise<string[]> {
        try {
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                this.logger.warn(`Business not found: ${businessId}`);
                return [];
            }

            const tier = this.getSubscriptionTier(business);
            if (!tier) {
                this.logger.warn(`No valid subscription tier found for business: ${businessId}`);
                return [];
            }

            // Get features for the tier
            const features = TIER_FEATURES[tier] || [];

            // Get custom features from business metadata
            const customFeatures = this.getCustomFeatures(business);

            // Combine tier features with custom features and remove duplicates
            return [...new Set([...features, ...customFeatures])];
        } catch (error) {
            this.logger.error(`Error getting business features: ${error.message}`);
            return [];
        }
    }

    /**
     * Get custom features added to a business
     */
    private getCustomFeatures(business: Business): string[] {
        try {
            const customFeaturesStr = business.metadata?.get('customFeatures');
            if (customFeaturesStr) {
                return JSON.parse(customFeaturesStr);
            }
            return [];
        } catch (error) {
            this.logger.error(`Error parsing custom features: ${error.message}`);
            return [];
        }
    }

    /**
     * Check if a business has access to a specific feature
     */
    async hasFeatureAccess(businessId: string, featureKey: string): Promise<boolean> {
        const features = await this.getBusinessFeatures(businessId);
        return features.includes(featureKey);
    }

    /**
     * Get the feature limits for a business based on subscription tier
     */
    async getBusinessLimits(businessId: string): Promise<Record<string, any>> {
        try {
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                this.logger.warn(`Business not found: ${businessId}`);
                return {};
            }

            const tier = this.getSubscriptionTier(business);
            if (!tier) {
                this.logger.warn(`No valid subscription tier found for business: ${businessId}`);
                return {};
            }

            // Get limits for the tier
            const tierLimits = TIER_LIMITS[tier] || {};

            // Get custom limits from business metadata
            const customLimits = this.getCustomLimits(business);

            // Merge tier limits with custom limits (custom limits override tier limits)
            return { ...tierLimits, ...customLimits };
        } catch (error) {
            this.logger.error(`Error getting business limits: ${error.message}`);
            return {};
        }
    }

    /**
     * Get custom limits for a business
     */
    private getCustomLimits(business: Business): Record<string, any> {
        try {
            const customLimitsStr = business.metadata?.get('customLimits');
            if (customLimitsStr) {
                return JSON.parse(customLimitsStr);
            }
            return {};
        } catch (error) {
            this.logger.error(`Error parsing custom limits: ${error.message}`);
            return {};
        }
    }

    /**
     * Check if a business has reached a specific limit
     * Returns true if the business has not reached the limit
     * Returns false if the business has reached the limit
     */
    async checkFeatureLimit(businessId: string, limitKey: string, currentCount: number): Promise<boolean> {
        try {
            const limits = await this.getBusinessLimits(businessId);
            const limit = limits[limitKey];

            // If limit is undefined, assume no limit is set
            if (limit === undefined) {
                return true;
            }

            // If limit is -1, it means unlimited
            if (limit === -1) {
                return true;
            }

            // Check if current count is within the limit
            return currentCount < limit;
        } catch (error) {
            this.logger.error(`Error checking feature limit: ${error.message}`);
            return false;
        }
    }

    /**
     * Add a custom feature to a business
     */
    async addCustomFeature(businessId: string, featureKey: string): Promise<boolean> {
        try {
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                return false;
            }

            // Get current custom features
            const customFeatures = this.getCustomFeatures(business);

            // Add the feature if not already in the list
            if (!customFeatures.includes(featureKey)) {
                customFeatures.push(featureKey);
            }

            // Update metadata
            if (!business.metadata) {
                business.metadata = new Map<string, string>();
            }

            business.metadata.set('customFeatures', JSON.stringify(customFeatures));
            await business.save();

            return true;
        } catch (error) {
            this.logger.error(`Error adding custom feature: ${error.message}`);
            return false;
        }
    }

    /**
     * Remove a custom feature from a business
     */
    async removeCustomFeature(businessId: string, featureKey: string): Promise<boolean> {
        try {
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                return false;
            }

            // Get current custom features
            const customFeatures = this.getCustomFeatures(business);

            // Remove the feature if present
            const updatedFeatures = customFeatures.filter(f => f !== featureKey);

            // Update metadata only if there was a change
            if (customFeatures.length !== updatedFeatures.length) {
                if (!business.metadata) {
                    business.metadata = new Map<string, string>();
                }

                business.metadata.set('customFeatures', JSON.stringify(updatedFeatures));
                await business.save();
            }

            return true;
        } catch (error) {
            this.logger.error(`Error removing custom feature: ${error.message}`);
            return false;
        }
    }

    /**
     * Set a custom limit for a business
     */
    async setCustomLimit(businessId: string, limitKey: string, value: number): Promise<boolean> {
        try {
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                return false;
            }

            // Get current custom limits
            const customLimits = this.getCustomLimits(business);

            // Set the new limit value
            customLimits[limitKey] = value;

            // Update metadata
            if (!business.metadata) {
                business.metadata = new Map<string, string>();
            }

            business.metadata.set('customLimits', JSON.stringify(customLimits));
            await business.save();

            return true;
        } catch (error) {
            this.logger.error(`Error setting custom limit: ${error.message}`);
            return false;
        }
    }

    /**
     * Remove a custom limit from a business
     */
    async removeCustomLimit(businessId: string, limitKey: string): Promise<boolean> {
        try {
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                return false;
            }

            // Get current custom limits
            const customLimits = this.getCustomLimits(business);

            // Remove the limit if present
            if (limitKey in customLimits) {
                delete customLimits[limitKey];

                // Update metadata
                if (!business.metadata) {
                    business.metadata = new Map<string, string>();
                }

                business.metadata.set('customLimits', JSON.stringify(customLimits));
                await business.save();
            }

            return true;
        } catch (error) {
            this.logger.error(`Error removing custom limit: ${error.message}`);
            return false;
        }
    }
}