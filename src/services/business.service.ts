// src/services/business.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business } from '../schemas/business.schema';
import { Address } from '../schemas/address.schema';
import { StripePrice } from '../schemas/stripe-price.schema';
import { Client } from '../schemas/client.schema';
import Stripe from 'stripe';
import { VenueBoostService } from "./venueboost.service";
import { MagicLinkService } from "./magic-link.service";
import {User} from "../schemas/user.schema";
import {EmailService} from "./email.service";

@Injectable()
export class BusinessService {
    private readonly logger = new Logger(BusinessService.name);

    constructor(
        @InjectModel(Business.name) private businessModel: Model<Business>,
        @InjectModel(Address.name) private addressModel: Model<Address>,
        @InjectModel(StripePrice.name) private priceModel: Model<StripePrice>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        @InjectModel(User.name) private userModel: Model<User>,
        private venueBoostService: VenueBoostService,
        private magicLinkService: MagicLinkService,
        private emailService: EmailService,
    ) {}

    /**
     * Creates a Stripe instance for a specific client using their configuration
     */
    private async getStripeInstance(clientId: string): Promise<Stripe> {
        const client = await this.clientModel.findById(clientId)
            .select('+subscriptionConfig.stripeAccount.secretKey');

        if (!client) {
            throw new NotFoundException('Client not found');
        }

        const stripeConfig = client.subscriptionConfig?.stripeAccount;
        if (!stripeConfig?.secretKey) {
            throw new BadRequestException('Stripe configuration not found or incomplete');
        }

        return new Stripe(stripeConfig.secretKey, {
            apiVersion: '2025-02-24.acacia',
        });
    }

    async updateBusinessAndSubscribe(
        clientId: string,
        businessId: string,
        subscriptionData: {
            businessDetails?: {
                businessType?: string;
                phone?: string;
                address?: {
                    street?: string;
                    cityId?: string;  // Changed from city
                    stateId?: string; // Changed from state
                    zip?: string;
                    countryId?: string; // Changed from country
                };
                taxId?: string;
                vatNumber?: string;
            };
            subscription: {
                planId: string;
                interval: 'month' | 'year';
            };
        }
    ) {
        try {
            const { businessDetails, subscription } = subscriptionData;

            // Find business
            const business = await this.businessModel.findOne({
                _id: businessId,
                clientId
            });

            if (!business) {
                throw new NotFoundException('Business not found');
            }

            // 1. Update business details if provided
            if (businessDetails) {
                // Update basic business fields
                const updateFields: any = {};
                if (businessDetails.businessType) updateFields.type = businessDetails.businessType;
                if (businessDetails.phone) updateFields.phone = businessDetails.phone;
                if (businessDetails.taxId) updateFields.taxId = businessDetails.taxId;
                if (businessDetails.vatNumber) updateFields.vatNumber = businessDetails.vatNumber;

                if (Object.keys(updateFields).length > 0) {
                    await this.businessModel.updateOne(
                        { _id: businessId },
                        { $set: updateFields }
                    );
                }

                // Handle address separately
                if (businessDetails.address && Object.values(businessDetails.address).some(val => val)) {
                    // Check if address exists
                    let addressId = business.addressId;

                    // Map fields to use proper ID fields
                    const addressData = {
                        addressLine1: businessDetails.address.street || '',
                        cityId: businessDetails.address.cityId || null,
                        stateId: businessDetails.address.stateId || null,
                        countryId: businessDetails.address.countryId || null,
                        zip: businessDetails.address.zip || '',
                    };

                    if (addressId) {
                        // Update existing address
                        await this.addressModel.updateOne(
                            { _id: addressId },
                            { $set: addressData }
                        );
                    } else {
                        // Create new address with proper ID fields
                        const newAddress = await this.addressModel.create({
                            ...addressData,
                            businessId,
                            clientId
                        });

                        // Link address to business
                        await this.businessModel.updateOne(
                            { _id: businessId },
                            { $set: { addressId: newAddress._id } }
                        );
                    }
                }
            }

            // 2. Create Stripe checkout session
            const stripe = await this.getStripeInstance(clientId);

            // Get price for the requested plan
            const price = await this.priceModel.findOne({
                clientId,
                stripePriceId: subscription.planId,
                interval: subscription.interval
            });

            if (!price) {
                throw new NotFoundException('Price not found for the selected plan');
            }

            // Create or retrieve Stripe customer
            let stripeCustomerId = business.stripeCustomerId;

            if (!stripeCustomerId) {
                const customer = await stripe.customers.create({
                    email: business.email,
                    name: business.name,
                    metadata: {
                        businessId: business._id.toString(),
                        clientId
                    }
                });

                stripeCustomerId = customer.id;

                // Update business with Stripe customer ID
                await this.businessModel.updateOne(
                    { _id: businessId },
                    { $set: { stripeCustomerId } }
                );
            }

            // Create checkout session
            const session = await stripe.checkout.sessions.create({
                customer: stripeCustomerId,
                line_items: [
                    {
                        price: price.stripePriceId,
                        quantity: 1,
                    },
                ],
                mode: 'subscription',
                subscription_data: {
                    trial_period_days: 14,
                },
                success_url: `${process.env.FRONTEND_URL}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.FRONTEND_URL}/subscription?userId=${business.adminUserId}&businessId=${business._id}`,
                metadata: {
                    businessId: business._id.toString(),
                    clientId,
                    planId: subscription.planId,
                    interval: subscription.interval
                }
            });

            return {
                success: true,
                message: 'Checkout session created',
                checkoutUrl: session.url
            };
        } catch (error) {
            this.logger.error(`Error updating business and creating subscription: ${error.message}`);
            throw error;
        }
    }

    async finalizeSubscription(clientId: string, sessionId: string) {
        try {
            if (!sessionId) {
                throw new BadRequestException('Session ID is required');
            }

            this.logger.log(`Starting subscription finalization for session: ${sessionId}`);

            // Get the client's Stripe instance using the client ID from auth
            const stripe = await this.getStripeInstance(clientId);

            // Retrieve the session
            const session = await stripe.checkout.sessions.retrieve(
                sessionId,
                { expand: ['subscription'] }
            );

            if (!session.metadata?.businessId) {
                throw new BadRequestException('Session metadata missing businessId');
            }

            const businessId = session.metadata.businessId;

            // Verify the business belongs to this client
            const business = await this.businessModel.findOne({
                _id: businessId,
                clientId
            });

            if (!business) {
                throw new NotFoundException('Business not found');
            }

            // Verify the session is complete
            if (session.status !== 'complete') {
                throw new BadRequestException('Payment not completed');
            }

            // Get subscription info
            const subscriptionId = typeof session.subscription === 'string'
                ? session.subscription
                : session.subscription.id;

            const subscription = await stripe.subscriptions.retrieve(subscriptionId);

            // Update business with subscription details
            await this.businessModel.updateOne(
                { _id: businessId },
                {
                    $set: {
                        stripeSubscriptionId: subscriptionId,
                        subscriptionStatus: subscription.status,
                        subscriptionEndDate: new Date(subscription.current_period_end * 1000),
                        subscriptionDetails: {
                            planId: session.metadata.planId,
                            priceId: subscription.items.data[0].price.id,
                            interval: session.metadata.interval,
                            amount: subscription.items.data[0].price.unit_amount,
                            currency: subscription.items.data[0].price.currency.toUpperCase()
                        }
                    }
                }
            );

            // Get user details
            const user = await this.userModel.findById(business.adminUserId).select('email external_ids');

            // Get VenueBoost connection
            let auth_response = null;
            try {
                if (user && user.email && user.external_ids && user.external_ids.supabaseId) {
                    auth_response = await this.venueBoostService.getConnection(
                        user.email,
                        user.external_ids.supabaseId
                    );
                }
            } catch (error) {
                this.logger.error(`Error getting VenueBoost connection: ${error.message}`);
            }

            // Send magic link to user
            try {
                if (user) {
                    // Create a magic link token
                    const token = await this.magicLinkService.createMagicLinkToken(user._id.toString());

                    // Build the magic link URL
                    const magicLink = `${process.env.WEB_FRONTEND_URL}/subscription-success/login?token=${token}`;

                    // Send the email
                    await this.emailService.sendTemplateEmail(
                        'Staffluent',
                        'staffluent@omnistackhub.xyz',
                        user.email,
                        'Access Your Staffluent Account',
                        'templates/business/magic-link-login.html',
                        {
                            userName: user.name,
                            businessName: business.name,
                            magicLink
                        }
                    );

                    this.logger.log(`Sent magic link to user after subscription finalization`);
                } else {
                    this.logger.error(`Could not find admin user for business ${businessId}`);
                }

            } catch (error) {
                this.logger.error(`Error sending magic link: ${error.message}`);
                // Continue even if sending magic link fails
            }

            return {
                success: true,
                message: 'Subscription activated successfully',
                businessId,
                status: subscription.status,
                auth_response
            };
        } catch (error) {
            this.logger.error(`Error finalizing subscription: ${error.message}`, error.stack);
            throw error;
        }
    }

    async getBusinesses(
        clientId: string,
        options: {
            page?: number;
            limit?: number;
            search?: string;
            status?: string;
            isTrialing?: boolean;
            isTestAccount?: boolean;
            sort?: string;
        } = {}
    ) {
        try {
            const {
                page = 1,
                limit = 10,
                search = '',
                status,
                isTrialing = false,
                isTestAccount,
                sort = 'createdAt_desc'
            } = options;

            const skip = (page - 1) * limit;

            // Build the filter
            const filter: any = { clientId };

            // Add status filter if provided
            if (status) {
                filter.subscriptionStatus = status;
            }

            // Add trialing filter if specifically requested
            if (isTrialing) {
                filter.subscriptionStatus = 'trialing';
            }

            if (isTestAccount !== undefined) {
                filter['metadata.isTestAccount'] = isTestAccount ? 'true' : 'false';
            }

            // Add search filter if provided
            if (search) {
                filter.$or = [
                    { name: new RegExp(search, 'i') },
                    { email: new RegExp(search, 'i') }
                ];
            }

            // Get total count
            const total = await this.businessModel.countDocuments(filter);
            const totalPages = Math.ceil(total / limit);

            // Handle sorting
            const [sortField, sortDirection] = (sort || 'createdAt_desc').split('_');
            const sortOptions = {};
            sortOptions[sortField || 'createdAt'] = sortDirection === 'desc' ? -1 : 1;

            // Get businesses with pagination
            const businesses = await this.businessModel
                .find(filter)
                .sort(sortOptions)
                .skip(skip)
                .limit(limit)
                .populate('address')
                .populate({
                    path: 'adminUserId',
                    select: 'name surname email',
                    model: 'User'
                })
                .lean();

            // Format businesses to match the expected response structure
            const formattedBusinesses = businesses.map(business => {
                // Map adminUserId to adminUser with selected fields using a type assertion
                const adminUserData = business.adminUserId && typeof business.adminUserId !== 'string'
                    ? business.adminUserId as any  // Type assertion to avoid TypeScript errors
                    : null;

                const adminUser = adminUserData ? {
                    _id: adminUserData._id,
                    // Combine name and surname if surname exists
                    name: adminUserData.surname
                        ? `${adminUserData.name || ''} ${adminUserData.surname}`.trim()
                        : (adminUserData.name || ''),
                    email: adminUserData.email
                } : undefined;

                // Remove the actual adminUserId object to avoid duplication
                const { adminUserId, ...rest } = business;

                return {
                    ...rest,
                    adminUser
                };
            });

            // Get metrics for all statuses
            const metrics = await this.getBusinessMetrics(clientId);

            return {
                items: formattedBusinesses,
                total,
                pages: totalPages,
                page,
                limit,
                metrics
            };
        } catch (error) {
            this.logger.error(`Error fetching businesses: ${error.message}`);
            throw error;
        }
    }

    async getTrialBusinesses(
        clientId: string,
        options: {
            page?: number;
            limit?: number;
            search?: string;
            sort?: string;
        } = {}
    ) {
        try {
            // Override options to ensure we only get trial businesses
            return this.getBusinesses(clientId, {
                ...options,
                status: 'trialing',
                isTrialing: true
            });
        } catch (error) {
            this.logger.error(`Error fetching trial businesses: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get business metrics for the dashboard
     */
    private async getBusinessMetrics(clientId: string) {
        try {
            // Total businesses
            const totalBusinesses = await this.businessModel.countDocuments({ clientId });

            // Active businesses
            const activeBusinesses = await this.businessModel.countDocuments({
                clientId,
                subscriptionStatus: 'active'
            });

            // Trial businesses
            const trialBusinesses = await this.businessModel.countDocuments({
                clientId,
                subscriptionStatus: 'trialing'
            });

            // Businesses by status
            const businessesByStatus = {
                active: activeBusinesses,
                trialing: trialBusinesses,
                pastDue: await this.businessModel.countDocuments({
                    clientId,
                    subscriptionStatus: 'past_due'
                }),
                canceled: await this.businessModel.countDocuments({
                    clientId,
                    subscriptionStatus: 'canceled'
                }),
                incomplete: await this.businessModel.countDocuments({
                    clientId,
                    subscriptionStatus: 'incomplete'
                })
            };

            // Calculate trends (new businesses in the last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const sixtyDaysAgo = new Date();
            sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

            // New businesses in last 30 days
            const newBusinessesLast30Days = await this.businessModel.countDocuments({
                clientId,
                createdAt: { $gte: thirtyDaysAgo }
            });

            // New businesses in previous 30 days (30-60 days ago)
            const newBusinessesPrevious30Days = await this.businessModel.countDocuments({
                clientId,
                createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo }
            });

            // Calculate percentage change
            let newBusinessesPercentage = 0;
            if (newBusinessesPrevious30Days > 0) {
                newBusinessesPercentage = ((newBusinessesLast30Days - newBusinessesPrevious30Days) / newBusinessesPrevious30Days) * 100;
            }

            // Calculate churn rate (businesses that canceled in the last 30 days)
            const canceledLast30Days = await this.businessModel.countDocuments({
                clientId,
                subscriptionStatus: 'canceled',
                updatedAt: { $gte: thirtyDaysAgo }
            });

            // Churn rate calculation (canceled / total active at the beginning of period)
            const activeAtBeginning = activeBusinesses + canceledLast30Days;
            const churnRate = activeAtBeginning > 0 ? (canceledLast30Days / activeAtBeginning) * 100 : 0;

            // Calculate churn rate trend
            const canceledPrevious30Days = await this.businessModel.countDocuments({
                clientId,
                subscriptionStatus: 'canceled',
                updatedAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo }
            });

            let churnRatePercentage = 0;
            if (canceledPrevious30Days > 0) {
                churnRatePercentage = ((canceledLast30Days - canceledPrevious30Days) / canceledPrevious30Days) * 100;
            }

            return {
                totalBusinesses,
                activeBusinesses,
                trialBusinesses,
                businessesByStatus,
                trends: {
                    newBusinesses: {
                        value: newBusinessesLast30Days,
                        percentage: Math.round(newBusinessesPercentage * 10) / 10
                    },
                    churnRate: {
                        value: Math.round(churnRate * 10) / 10,
                        percentage: Math.round(churnRatePercentage * 10) / 10
                    }
                }
            };
        } catch (error) {
            this.logger.error(`Error calculating business metrics: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update business active status (activate/deactivate)
     */
    async updateBusinessStatus(clientId: string, businessId: string, isActive: boolean) {
        try {
            // Verify business exists and belongs to this client
            const business = await this.businessModel.findOne({
                _id: businessId,
                clientId
            });

            if (!business) {
                throw new NotFoundException('Business not found');
            }

            // Update the business status
            const updatedBusiness = await this.businessModel.findByIdAndUpdate(
                businessId,
                { $set: { isActive } },
                { new: true }
            );

            // If deactivating, also deactivate associated users
            if (!isActive) {
                await this.userModel.updateMany(
                    { _id: { $in: business.userIds } },
                    { $set: { isActive: false } }
                );
                this.logger.log(`Deactivated ${business.userIds.length} users associated with business ${businessId}`);
            }

            return {
                success: true,
                business: updatedBusiness,
                message: isActive
                    ? 'Business activated successfully'
                    : 'Business deactivated successfully'
            };
        } catch (error) {
            this.logger.error(`Error updating business status: ${error.message}`);
            throw error;
        }
    }

    /**
     * Mark/unmark a business as a test account
     */
    async updateBusinessTestStatus(clientId: string, businessId: string, isTestAccount: boolean) {
        try {
            // Verify business exists and belongs to this client
            const business = await this.businessModel.findOne({
                _id: businessId,
                clientId
            });

            if (!business) {
                throw new NotFoundException('Business not found');
            }

            // Update the metadata to mark as test account
            const updatedBusiness = await this.businessModel.findByIdAndUpdate(
                businessId,
                {
                    $set: {
                        'metadata.isTestAccount': isTestAccount ? 'true' : 'false'
                    }
                },
                { new: true }
            );

            return {
                success: true,
                business: updatedBusiness,
                message: isTestAccount
                    ? 'Business marked as test account successfully'
                    : 'Test account flag removed successfully'
            };
        } catch (error) {
            this.logger.error(`Error updating business test status: ${error.message}`);
            throw error;
        }
    }
}