// services/auth.service.ts
import { Injectable, UnauthorizedException, Logger, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from './user.service';
import { FeatureAccessService } from './feature-access.service';
import * as bcrypt from 'bcrypt';
import { SalesAssociateLoginDto } from "../dtos/user.dto";
import { StaffluentsBusinessAdminLoginDto } from "../dtos/staffluent-login.dto";
import { Store } from "../schemas/store.schema";
import { User, RegistrationSource } from "../schemas/user.schema";
import { Business } from "../schemas/business.schema";
import { Model } from 'mongoose';
import { InjectModel } from "@nestjs/mongoose";
import { VenueBoostService } from './venueboost.service';
import { TIER_FEATURES, TIER_LIMITS } from '../constants/features.constants';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private userService: UserService,
        private jwtService: JwtService,
        private featureAccessService: FeatureAccessService,
        private venueBoostService: VenueBoostService,
        @InjectModel(Store.name) private storeModel: Model<Store>,
        @InjectModel(User.name) private userModel: Model<User>,
        @InjectModel(Business.name) private businessModel: Model<Business>
    ) {}

    async salesAssociateLogin(loginDto: SalesAssociateLoginDto) {
        // Find user first
        const user = await this.userService.findByEmailForStore(loginDto.email);

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // If user has storeIds, get the first store
        let store = null;
        if (user.storeIds && user.storeIds.length > 0) {
            const firstStore = await this.storeModel.findById(user.storeIds[0])
                .populate('address')
                .exec();

            if (firstStore) {
                store = {
                    id: firstStore._id,
                    name: firstStore.name,
                    code: firstStore.code,
                    address: firstStore.address,
                    clientId: firstStore.clientId,
                    externalIds: firstStore.externalIds,
                    metadata: firstStore.metadata
                };
            }
        }

        // Rest of your code...
        const token = this.jwtService.sign({
            sub: user.id,
            email: user.email,
            // permissions: verificationResult.permissions,
            store: store,
            clientId: store.clientId
        });

        return {
            token,
            user: {
                id: user.id,
                name: user.name,
                surname: user.surname,
                email: user.email,
                // permissions: verificationResult.permissions,
                store: store,
                external_ids: user.external_ids,
                client_ids: user.client_ids,
                metadata: user.metadata,
                storeIds: user.storeIds
            }
        };
    }

    async staffluentsBusinessAdminLogin(loginDto: StaffluentsBusinessAdminLoginDto) {
        try {
            // Find user by email for Staffluent
            const user = await this.userModel.findOne({
                email: loginDto.email,
                registrationSource: RegistrationSource.STAFFLUENT
            });

            if (!user) {
                throw new UnauthorizedException('Invalid credentials');
            }

            // Verify password
            const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
            if (!isPasswordValid) {
                throw new UnauthorizedException('Invalid credentials');
            }

            // Find the business for this admin user
            const business = await this.businessModel.findOne({ adminUserId: user._id });
            if (!business) {
                throw new NotFoundException('No business found for this user');
            }

            // Get VenueBoost authentication data if available
            let auth_response = null;
            try {
                if (user.external_ids?.supabaseId) {
                    auth_response = await this.venueBoostService.getConnection(
                        user.email,
                        user.external_ids.supabaseId
                    );
                }
            } catch (error) {
                this.logger.error(`Error getting VenueBoost connection: ${error.message}`);
                // Continue even if getting auth response fails
            }

            // Get features and subscription details
            const businessFeatures = await this.getBusinessFeaturesForLogin(business._id.toString());

            // Generate JWT token
            const token = this.jwtService.sign({
                sub: user._id.toString(),
                email: user.email,
                businessId: business._id.toString(),
                clientId: business.clientId,
                role: 'business_admin'
            });

            return {
                status: 'success',
                message: 'Authentication successful',
                token,
                userId: user._id.toString(),
                has_changed_password: user.metadata?.get('has_changed_password') === 'true',
                businessId: business._id.toString(),
                business: {
                    name: business.name,
                    email: business.email,
                    type: business.type,
                    subscriptionStatus: business.subscriptionStatus,
                    subscriptionEndDate: business.subscriptionEndDate
                },
                auth_response,
                ...businessFeatures
            };
        } catch (error) {
            this.logger.error(`Error in staffluentsBusinessAdminLogin: ${error.message}`);
            if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
                throw error;
            }
            throw new UnauthorizedException('Login failed');
        }
    }

    /**
     * Get business features and subscription details for login response
     */
    async getBusinessFeaturesForLogin(businessId: string) {
        try {
            // Get business and determine tier
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                return {
                    features: [],
                    featureLimits: {},
                    customFeatures: [],
                    customLimits: {},
                    subscription: { status: 'not_found' }
                };
            }

            // Get available features
            const features = await this.featureAccessService.getBusinessFeatures(businessId);

            // Get feature limits
            const featureLimits = await this.featureAccessService.getBusinessLimits(businessId);

            // Get custom features
            let customFeatures = [];
            try {
                const customFeaturesStr = business.metadata?.get('customFeatures');
                if (customFeaturesStr) {
                    customFeatures = JSON.parse(customFeaturesStr);
                }
            } catch (error) {
                this.logger.error(`Error parsing custom features: ${error.message}`);
                customFeatures = [];
            }

            // Get custom limits
            let customLimits = {};
            try {
                const customLimitsStr = business.metadata?.get('customLimits');
                if (customLimitsStr) {
                    customLimits = JSON.parse(customLimitsStr);
                }
            } catch (error) {
                this.logger.error(`Error parsing custom limits: ${error.message}`);
                customLimits = {};
            }

            // Determine tier for frontend information
            let tier = 'basic';
            if (business.subscriptionStatus === 'trialing') {
                tier = 'trialing';
            } else if (business.subscriptionDetails?.planId) {
                // Extract tier from plan ID or metadata
                const planId = business.subscriptionDetails.planId;
                tier = planId.includes('basic') ? 'basic' :
                    planId.includes('professional') ? 'professional' :
                        planId.includes('enterprise') ? 'enterprise' : 'basic';

                // Check metadata for tier info as fallback
                const tierFromMetadata = business.metadata?.get('subscriptionTier') || null;
                if (tierFromMetadata) {
                    tier = tierFromMetadata;
                }
            }

            return {
                features,
                featureLimits,
                customFeatures,
                customLimits,
                subscription: {
                    status: business.subscriptionStatus,
                    endDate: business.subscriptionEndDate,
                    tier,
                    details: business.subscriptionDetails
                },
                tierFeatures: TIER_FEATURES,
                tierLimits: TIER_LIMITS
            };
        } catch (error) {
            this.logger.error(`Error getting business features for login: ${error.message}`);
            return {
                features: [],
                featureLimits: {},
                customFeatures: [],
                customLimits: {},
                subscription: { status: 'error' }
            };
        }
    }
}