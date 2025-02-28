// src/guards/feature.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureAccessService } from '../services/feature-access.service';

/**
 * Custom decorator to require a specific feature for an endpoint
 */
export const RequireFeature = (feature: string | string[]) =>
    Reflect.metadata('requiredFeatures', feature);

/**
 * Custom decorator to check a feature limit for an endpoint
 */
export const CheckFeatureLimit = (limitKey: string, getCountFn: (request: any) => number) =>
    Reflect.metadata('featureLimit', { limitKey, getCountFn });

@Injectable()
export class FeatureGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private featureAccessService: FeatureAccessService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Check for required features
        const requiredFeatures = this.reflector.get<string | string[]>(
            'requiredFeatures',
            context.getHandler(),
        );

        // Check for feature limit
        const featureLimit = this.reflector.get<{ limitKey: string, getCountFn: (request: any) => number }>(
            'featureLimit',
            context.getHandler(),
        );

        // If neither required features nor feature limit is specified, allow access
        if (!requiredFeatures && !featureLimit) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const businessId = request.user?.businessId;

        if (!businessId) {
            throw new UnauthorizedException('Business ID not found in user context');
        }

        // Check for required features
        if (requiredFeatures) {
            const hasFeatureAccess = await this.checkFeatureAccess(businessId, requiredFeatures);
            if (!hasFeatureAccess) {
                throw new ForbiddenException('Your subscription plan does not include access to this feature');
            }
        }

        // Check for feature limit
        if (featureLimit) {
            const withinLimit = await this.checkLimit(businessId, featureLimit.limitKey, featureLimit.getCountFn(request));
            if (!withinLimit) {
                throw new ForbiddenException(`You have reached the limit for ${featureLimit.limitKey} in your subscription plan`);
            }
        }

        return true;
    }

    /**
     * Check if the business has access to all required features
     */
    private async checkFeatureAccess(businessId: string, requiredFeatures: string | string[]): Promise<boolean> {
        // Convert to array if a single feature string was provided
        const features = Array.isArray(requiredFeatures) ? requiredFeatures : [requiredFeatures];

        // Check each required feature
        for (const feature of features) {
            const hasAccess = await this.featureAccessService.hasFeatureAccess(businessId, feature);
            if (!hasAccess) {
                return false;
            }
        }

        return true;
    }

    /**
     * Check if the business is within the limit for a specific feature
     */
    private async checkLimit(businessId: string, limitKey: string, currentCount: number): Promise<boolean> {
        return this.featureAccessService.checkFeatureLimit(businessId, limitKey, currentCount);
    }
}