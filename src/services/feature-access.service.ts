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

        // Check if plan contains tier info - extract from planId or metadata
        // This assumes the planId format is something like "price_basic_monthly" or "price_enterprise_yearly"
        // Alternatively, you could store the tier info in metadata
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

            // Check for feature overrides in metadata
            const enabledOverrides = this.getEnabledFeatureOverrides(business);
            const disabledOverrides = this.getDisabledFeatureOverrides(business);

            // Apply overrides (add enabled features, remove disabled features)
            return [...new Set([...features, ...enabledOverrides])]
                .filter(feature => !disabledOverrides.includes(feature));
        } catch (error) {
            this.logger.error(`Error getting business features: ${error.message}`);
            return [];
        }
    }

    /**
     * Get any features that are explicitly enabled for this business
     */
    private getEnabledFeatureOverrides(business: Business): string[] {
        try {
            const enabledFeaturesStr = business.metadata?.get('enabledFeatures');
            if (enabledFeaturesStr) {
                return JSON.parse(enabledFeaturesStr);
            }
            return [];
        } catch (error) {
            this.logger.error(`Error parsing enabled features: ${error.message}`);
            return [];
        }
    }

    /**
     * Get any features that are explicitly disabled for this business
     */
    private getDisabledFeatureOverrides(business: Business): string[] {
        try {
            const disabledFeaturesStr = business.metadata?.get('disabledFeatures');
            if (disabledFeaturesStr) {
                return JSON.parse(disabledFeaturesStr);
            }
            return [];
        } catch (error) {
            this.logger.error(`Error parsing disabled features: ${error.message}`);
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

            // Check for limit overrides in metadata
            const limitsOverride = this.getLimitsOverrides(business);

            // Merge tier limits with overrides
            return { ...tierLimits, ...limitsOverride };
        } catch (error) {
            this.logger.error(`Error getting business limits: ${error.message}`);
            return {};
        }
    }

    /**
     * Get any feature limit overrides for this business
     */
    private getLimitsOverrides(business: Business): Record<string, any> {
        try {
            const limitsStr = business.metadata?.get('featureLimits');
            if (limitsStr) {
                return JSON.parse(limitsStr);
            }
            return {};
        } catch (error) {
            this.logger.error(`Error parsing feature limits: ${error.message}`);
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
     * Enable a specific feature for a business
     */
    async enableFeature(businessId: string, featureKey: string): Promise<boolean> {
        try {
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                return false;
            }

            // Get current enabled features
            const enabledFeatures = this.getEnabledFeatureOverrides(business);

            // Add the feature if not already enabled
            if (!enabledFeatures.includes(featureKey)) {
                enabledFeatures.push(featureKey);
            }

            // Remove from disabled features if present
            const disabledFeatures = this.getDisabledFeatureOverrides(business);
            const updatedDisabledFeatures = disabledFeatures.filter(f => f !== featureKey);

            // Update metadata
            if (!business.metadata) {
                business.metadata = new Map<string, string>();
            }

            business.metadata.set('enabledFeatures', JSON.stringify(enabledFeatures));
            business.metadata.set('disabledFeatures', JSON.stringify(updatedDisabledFeatures));

            await business.save();
            return true;
        } catch (error) {
            this.logger.error(`Error enabling feature: ${error.message}`);
            return false;
        }
    }

    /**
     * Disable a specific feature for a business
     */
    async disableFeature(businessId: string, featureKey: string): Promise<boolean> {
        try {
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                return false;
            }

            // Get current disabled features
            const disabledFeatures = this.getDisabledFeatureOverrides(business);

            // Add the feature if not already disabled
            if (!disabledFeatures.includes(featureKey)) {
                disabledFeatures.push(featureKey);
            }

            // Remove from enabled features if present
            const enabledFeatures = this.getEnabledFeatureOverrides(business);
            const updatedEnabledFeatures = enabledFeatures.filter(f => f !== featureKey);

            // Update metadata
            if (!business.metadata) {
                business.metadata = new Map<string, string>();
            }

            business.metadata.set('enabledFeatures', JSON.stringify(updatedEnabledFeatures));
            business.metadata.set('disabledFeatures', JSON.stringify(disabledFeatures));

            await business.save();
            return true;
        } catch (error) {
            this.logger.error(`Error disabling feature: ${error.message}`);
            return false;
        }
    }

    /**
     * Set a custom limit for a specific feature
     */
    async setFeatureLimit(businessId: string, limitKey: string, value: number): Promise<boolean> {
        try {
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                return false;
            }

            // Get current limits
            const limits = this.getLimitsOverrides(business);

            // Set the new limit value
            limits[limitKey] = value;

            // Update metadata
            if (!business.metadata) {
                business.metadata = new Map<string, string>();
            }

            business.metadata.set('featureLimits', JSON.stringify(limits));

            await business.save();
            return true;
        } catch (error) {
            this.logger.error(`Error setting feature limit: ${error.message}`);
            return false;
        }
    }
}