// src/controllers/admin-feature.controller.ts
import { Controller, Get, Post, Delete, Param, Body, UseGuards, Req, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { FeatureAccessService } from '../services/feature-access.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { STAFFLUENT_FEATURES, TIER_FEATURES, TIER_LIMITS } from '../constants/features.constants';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business } from '../schemas/business.schema';
import { Client } from '../schemas/client.schema';

@ApiTags('Admin Features')
@Controller('admin/features')
@UseGuards(ClientAuthGuard)
@ApiBearerAuth()
export class AdminFeatureController {
    constructor(
        private featureAccessService: FeatureAccessService,
        @InjectModel(Business.name) private businessModel: Model<Business>,
    ) {}

    /**
     * Get all features configuration
     */
    @Get('config')
    @ApiOperation({ summary: 'Get all features configuration' })
    @ApiResponse({ status: 200, description: 'Returns features configuration' })
    async getFeatureConfig() {
        return {
            features: STAFFLUENT_FEATURES,
            tierFeatures: TIER_FEATURES,
            tierLimits: TIER_LIMITS
        };
    }

    /**
     * Get features for a specific business
     */
    @Get('business/:id')
    @ApiOperation({ summary: 'Get features for a specific business' })
    @ApiResponse({ status: 200, description: 'Returns business features' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getBusinessFeatures(
        @Param('id') businessId: string,
        @Req() req: Request & { client: Client }
    ) {
        // Ensure the client has access to this business
        await this.verifyBusinessAccess(req.client.id, businessId);

        // Get business details
        const business = await this.businessModel.findById(businessId);
        if (!business) {
            throw new NotFoundException('Business not found');
        }

        // Get features and limits
        const features = await this.featureAccessService.getBusinessFeatures(businessId);
        const limits = await this.featureAccessService.getBusinessLimits(businessId);

        // Get custom features and limits
        let customFeatures = [];
        let customLimits = {};

        try {
            if (business.metadata?.get('customFeatures')) {
                customFeatures = JSON.parse(business.metadata.get('customFeatures'));
            }
        } catch (error) {
            customFeatures = [];
        }

        try {
            if (business.metadata?.get('customLimits')) {
                customLimits = JSON.parse(business.metadata.get('customLimits'));
            }
        } catch (error) {
            customLimits = {};
        }

        return {
            businessId,
            business: {
                name: business.name,
                email: business.email,
                type: business.type,
                subscriptionStatus: business.subscriptionStatus,
                subscriptionEndDate: business.subscriptionEndDate,
                subscription: {
                    tier: this.getTierFromBusiness(business),
                    status: business.subscriptionStatus,
                    endDate: business.subscriptionEndDate,
                    details: business.subscriptionDetails
                }
            },
            features,
            limits,
            customFeatures,
            customLimits,
            allFeatures: STAFFLUENT_FEATURES
        };
    }

    /**
     * Add a custom feature to a business
     */
    @Post('business/:id/custom-feature')
    @ApiOperation({ summary: 'Add a custom feature to a business' })
    @ApiResponse({ status: 200, description: 'Feature added successfully' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async addCustomFeature(
        @Param('id') businessId: string,
        @Body() data: { featureKey: string },
        @Req() req: Request & { client: Client }
    ) {
        // Ensure the client has access to this business
        await this.verifyBusinessAccess(req.client.id, businessId);

        if (!data.featureKey || !STAFFLUENT_FEATURES[data.featureKey]) {
            throw new BadRequestException('Invalid feature key');
        }

        const success = await this.featureAccessService.addCustomFeature(businessId, data.featureKey);

        return {
            success,
            message: success
                ? `Custom feature ${data.featureKey} added successfully`
                : `Failed to add custom feature ${data.featureKey}`
        };
    }

    /**
     * Remove a custom feature from a business
     */
    @Delete('business/:id/custom-feature/:featureKey')
    @ApiOperation({ summary: 'Remove a custom feature from a business' })
    @ApiResponse({ status: 200, description: 'Feature removed successfully' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async removeCustomFeature(
        @Param('id') businessId: string,
        @Param('featureKey') featureKey: string,
        @Req() req: Request & { client: Client }
    ) {
        // Ensure the client has access to this business
        await this.verifyBusinessAccess(req.client.id, businessId);

        const success = await this.featureAccessService.removeCustomFeature(businessId, featureKey);

        return {
            success,
            message: success
                ? `Custom feature ${featureKey} removed successfully`
                : `Failed to remove custom feature ${featureKey}`
        };
    }

    /**
     * Set a custom limit for a business
     */
    @Post('business/:id/custom-limit')
    @ApiOperation({ summary: 'Set a custom limit for a business' })
    @ApiResponse({ status: 200, description: 'Limit set successfully' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async setCustomLimit(
        @Param('id') businessId: string,
        @Body() data: { limitKey: string, value: number },
        @Req() req: Request & { client: Client }
    ) {
        // Ensure the client has access to this business
        await this.verifyBusinessAccess(req.client.id, businessId);

        if (!data.limitKey || data.value === undefined) {
            throw new BadRequestException('Limit key and value are required');
        }

        const tierKeys = Object.keys(TIER_LIMITS['enterprise'] || {});
        if (!tierKeys.includes(data.limitKey)) {
            throw new BadRequestException('Invalid limit key');
        }

        const success = await this.featureAccessService.setCustomLimit(businessId, data.limitKey, data.value);

        return {
            success,
            message: success
                ? `Custom limit for ${data.limitKey} set to ${data.value} successfully`
                : `Failed to set custom limit for ${data.limitKey}`
        };
    }

    /**
     * Remove a custom limit from a business
     */
    @Delete('business/:id/custom-limit/:limitKey')
    @ApiOperation({ summary: 'Remove a custom limit from a business' })
    @ApiResponse({ status: 200, description: 'Limit removed successfully' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async removeCustomLimit(
        @Param('id') businessId: string,
        @Param('limitKey') limitKey: string,
        @Req() req: Request & { client: Client }
    ) {
        // Ensure the client has access to this business
        await this.verifyBusinessAccess(req.client.id, businessId);

        const success = await this.featureAccessService.removeCustomLimit(businessId, limitKey);

        return {
            success,
            message: success
                ? `Custom limit for ${limitKey} removed successfully`
                : `Failed to remove custom limit for ${limitKey}`
        };
    }

    /**
     * Get subscription tier from business
     */
    private getTierFromBusiness(business: Business): string {
        // If business is in trial, use trialing tier
        if (business.subscriptionStatus === 'trialing') {
            return 'trialing';
        }

        // If business subscription is not active, return null
        if (business.subscriptionStatus !== 'active') {
            return null;
        }

        // Get the tier from subscription details
        const planId = business.subscriptionDetails?.planId;
        if (!planId) {
            return 'basic'; // Default to basic if no plan ID
        }

        // Extract tier from plan ID
        const tierFromPlanId = planId.includes('basic') ? 'basic' :
            planId.includes('professional') ? 'professional' :
                planId.includes('enterprise') ? 'enterprise' : 'basic';

        // Check metadata for tier info as fallback
        const tierFromMetadata = business.metadata?.get('subscriptionTier') || null;

        return tierFromPlanId || tierFromMetadata || 'basic';
    }

    /**
     * Verify if client has access to a business
     */
    private async verifyBusinessAccess(clientId: string, businessId: string): Promise<void> {
        const business = await this.businessModel.findOne({
            _id: businessId,
            clientId
        });

        if (!business) {
            throw new ForbiddenException('You do not have access to this business');
        }
    }
}