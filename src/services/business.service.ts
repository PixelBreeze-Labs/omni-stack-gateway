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
import {RegistrationSource, User} from "../schemas/user.schema";
import {EmailService} from "./email.service";
import {FeatureAccessService} from "./feature-access.service";
import {SidebarFeatureService} from "./sidebar-feature.service";
import {AuthService} from "./auth.service";
import {AppClient, ClientType} from "../schemas/app-client.schema";
import {Employee} from "../schemas/employee.schema";
import * as bcrypt from 'bcrypt';

@Injectable()
export class BusinessService {
    private readonly logger = new Logger(BusinessService.name);

    constructor(
        @InjectModel(Business.name) private businessModel: Model<Business>,
        @InjectModel(Address.name) private addressModel: Model<Address>,
        @InjectModel(StripePrice.name) private priceModel: Model<StripePrice>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        @InjectModel(User.name) private userModel: Model<User>,
        @InjectModel(Employee.name) private employeeModel: Model<Employee>,
        @InjectModel(AppClient.name) private appClientModel: Model<AppClient>,
        private venueBoostService: VenueBoostService,
        private magicLinkService: MagicLinkService,
        private emailService: EmailService,
        private featureAccessService: FeatureAccessService,
        private sidebarFeatureService: SidebarFeatureService,
        private authService: AuthService
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
                    postcode?: string;
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
                
                    // Prepare address data with proper ID fields
                    const addressData = {
                        addressLine1: businessDetails.address.street || '',
                        cityId: businessDetails.address.cityId || null,
                        stateId: businessDetails.address.stateId || null,
                        countryId: businessDetails.address.countryId || null,
                        postcode: businessDetails.address.postcode || '',
                        businessId,
                        clientId
                    };
                
                    if (addressId) {
                        // Update existing address - make sure to explicitly include postcode
                        await this.addressModel.updateOne(
                            { _id: addressId },
                            { 
                                $set: {
                                    addressLine1: addressData.addressLine1,
                                    cityId: addressData.cityId,
                                    stateId: addressData.stateId,
                                    countryId: addressData.countryId,
                                    postcode: addressData.postcode
                                } 
                            }
                        );
                        this.logger.log(`Updated address for business: ${businessId}`);
                    } else {
                        // Create new address
                        const newAddress = await this.addressModel.create(addressData);
                
                        // Link address to business
                        await this.businessModel.updateOne(
                            { _id: businessId },
                            { $set: { addressId: newAddress._id } }
                        );
                        this.logger.log(`Created new address for business: ${businessId}`);
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

            // Get business features and sidebar links
            let businessFeatures = {};
            let sidebarLinks = [];

            try {
                // Assuming featureAccessService and sidebarFeatureService are injected in the constructor
                businessFeatures = await this.authService.getBusinessFeaturesForLogin(businessId);
                sidebarLinks = await this.sidebarFeatureService.getBusinessSidebarLinks(businessId);
            } catch (error) {
                this.logger.error(`Error getting business features and sidebar links: ${error.message}`);
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
                userId: user._id.toString(),
                has_changed_password: user.metadata?.get('has_changed_password') === 'true',
                status: subscription.status,
                auth_response,
                sidebarLinks,  // Include sidebar links in the response
                ...businessFeatures  // Include business features in the response
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
            isActive?: boolean;
            sort?: string;
            includeDeleted?: boolean; // New option to include deleted businesses if needed
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
                isActive,
                sort = 'createdAt_desc',
                includeDeleted = false // Default to excluding deleted businesses
            } = options;
    
            const skip = (page - 1) * limit;
    
            // Build the filter
            const filter: any = { clientId };
    
            // Exclude soft-deleted businesses by default
            if (!includeDeleted) {
                filter.isDeleted = { $ne: true };
            }
    
            // Rest of the filter logic remains the same
            if (status) {
                filter.subscriptionStatus = status;
            }
    
            if (isTrialing) {
                filter.subscriptionStatus = 'trialing';
            }
    
            if (isActive !== undefined) {
                filter.isActive = isActive;
            }
    
           // Updated filter logic for isTestAccount
            if (isTestAccount !== undefined) {
                if (isTestAccount) {
                    // If we want to include only test accounts
                    filter['metadata.isTestAccount'] = 'true';
                } else {
                    // If we want to exclude test accounts, we need to handle the case where metadata doesn't exist
                    filter.$or = [
                        { 'metadata.isTestAccount': { $ne: 'true' } },
                        { 'metadata.isTestAccount': { $exists: false } },
                        { metadata: { $exists: false } }
                    ];
                    
                    // If we already have $or conditions from the search filter, we need to combine them
                    if (search) {
                        const searchConditions = [
                            { name: new RegExp(search, 'i') },
                            { email: new RegExp(search, 'i') }
                        ];
                        
                        // Use $and to combine the existing $or conditions with the new ones
                        filter.$and = [
                            { $or: filter.$or },
                            { $or: searchConditions }
                        ];
                        
                        // Remove the original $or since we've combined it with the search conditions
                        delete filter.$or;
                    }
                }
            }
                
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
            const baseFilter = { clientId, isDeleted: { $ne: true } };

            // Total businesses (excluding deleted)
            const totalBusinesses = await this.businessModel.countDocuments(baseFilter);

            // Active businesses (excluding deleted)
            const activeBusinesses = await this.businessModel.countDocuments({
                ...baseFilter,
                subscriptionStatus: 'active'
            });

            const trialBusinesses = await this.businessModel.countDocuments({
                ...baseFilter,
                subscriptionStatus: 'trialing'
            });

            // Businesses by status (excluding deleted)
            const businessesByStatus = {
                active: activeBusinesses,
                trialing: trialBusinesses,
                pastDue: await this.businessModel.countDocuments({
                    ...baseFilter,
                    subscriptionStatus: 'past_due'
                }),
                canceled: await this.businessModel.countDocuments({
                    ...baseFilter,
                    subscriptionStatus: 'canceled'
                }),
                incomplete: await this.businessModel.countDocuments({
                    ...baseFilter,
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

            const newBusinessesPrevious30Days = await this.businessModel.countDocuments({
                clientId,
                createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo }
            });

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

    /**
     * Create a new App Client for a business
     */
    async createAppClient(
        clientId: string,
        data: {
            name: string;
            adminUserId: string;
            type?: ClientType;
            contact_person?: string;
            email?: string;
            phone?: string;
            notes?: string;
            password?: string;
            createAccount?: boolean;
            external_ids?: Record<string, any>;
            metadata?: Record<string, any>;
        }
    ) {
        try {
            this.logger.log(`Creating new app client for client: ${clientId}`);

            // Step 1: Find business by adminUserId
            const business = await this.businessModel.findOne({
                clientId,
                adminUserId: data.adminUserId
            });

            if (!business) {
                throw new NotFoundException('Business not found for the provided admin user');
            }

            const businessId = business._id.toString();

            // Step 2: Create user account if requested
            let userId;
            if (data.createAccount && data.email) {
                this.logger.log(`Creating user account for app client`);

                // Check if user already exists
                const existingUser = await this.userModel.findOne({ email: data.email });
                if (existingUser) {
                    throw new BadRequestException('A user with this email already exists');
                }

                // Hash the password
                const hashedPassword = await bcrypt.hash(data.password, 10);

                let firstName = data.name;
                let lastName = '-';

                if (data.name && data.name.includes(' ')) {
                    const nameParts = data.name.split(' ');
                    firstName = nameParts[0];
                    // Join all remaining parts as the surname
                    lastName = nameParts.slice(1).join(' ');
                }

                // Create the user
                const user = await this.userModel.create({
                    name: firstName,
                    surname: lastName,
                    email: data.email,
                    password: hashedPassword, // Use the hashed password
                    registrationSource: RegistrationSource.STAFFLUENT,
                    external_ids: data.external_ids || {},
                    client_ids: [clientId],
                    metadata: new Map(Object.entries(data.metadata || {})),
                    isActive: true
                });

                userId = user._id;
            }

            // Step 3: Create the app client
            const appClient = await this.appClientModel.create({
                clientId,
                businessId,
                name: data.name,
                type: data.type || ClientType.INDIVIDUAL,
                contact_person: data.contact_person,
                email: data.email,
                phone: data.phone,
                notes: data.notes,
                user_id: userId, // Link to the created user if exists
                external_ids: data.external_ids || {},
                metadata: data.metadata || {},
                is_active: true
            });

            // Step 4: Update the business's client list
            await this.businessModel.findByIdAndUpdate(
                businessId,
                { $addToSet: { appClientIds: appClient._id } }
            );

            // Step 5: Send welcome email if an account was created
            if (data.createAccount && data.email) {
                await this.sendClientWelcomeEmail({
                    name: data.name,
                    email: data.email
                }, business.name);
            }

            return {
                success: true,
                message: 'App client created successfully',
                appClient,
                userId: userId || null
            };
        } catch (error) {
            this.logger.error(`Error creating app client: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create a new Employee for a business
     */
    async createEmployee(
        clientId: string,
        data: {
            name: string;
            surname: string;
            email: string;
            adminUserId: string; // Admin user ID to find the business
            createAccount?: boolean; // Flag to create user account
            password?: string; // Password provided from PHP side
            external_ids?: Record<string, any>;
            metadata?: Record<string, any>;
            allow_clockinout?: boolean; // Employee-specific clock in/out capability
            has_app_access?: boolean; // Employee-specific app access capability
            allow_checkin?: boolean; // Employee-specific check in capability
        }
    ) {
        try {
            this.logger.log(`Creating new employee for client: ${clientId}`);

            // Step 1: Find business by adminUserId
            const business = await this.businessModel.findOne({
                clientId,
                adminUserId: data.adminUserId
            });

            if (!business) {
                throw new NotFoundException('Business not found for the provided admin user');
            }

            const businessId = business._id.toString();

            // Step 2: Check if an employee with the same email already exists
            const existingEmployee = await this.employeeModel.findOne({
                email: data.email,
                clientId
            });

            if (existingEmployee) {
                throw new BadRequestException('An employee with this email already exists');
            }

            // Step 3: Create user account if requested
            let userId;
            if (data.createAccount) {
                this.logger.log(`Creating user account for employee`);

                // Check if user already exists
                const existingUser = await this.userModel.findOne({email: data.email});
                if (existingUser) {
                    throw new BadRequestException('A user with this email already exists');
                }

                // Use provided password or generate a random one
                const hashedPassword = await bcrypt.hash(data.password, 10);

                // Create the user
                const user = await this.userModel.create({
                    name: data.name,
                    surname: data.surname || '-',
                    email: data.email,
                    password: hashedPassword,
                    registrationSource: RegistrationSource.STAFFLUENT,
                    external_ids: data.external_ids || {},
                    client_ids: [clientId],
                    metadata: new Map(Object.entries(data.metadata || {})),
                    isActive: true
                });

                userId = user._id;

                // Add user to the business's userIds
                await this.businessModel.findByIdAndUpdate(
                    businessId,
                    {$addToSet: {userIds: userId}}
                );
            }

            // Step 4: Create the employee
            const employee = await this.employeeModel.create({
                clientId,
                businessId,
                name: data.name,
                email: data.email,
                user_id: userId, // Link to the created user if exists
                external_ids: data.external_ids || {},
                metadata: data.metadata || {},
                // Set capability flags (providing explicit values or use business defaults)
                allow_clockinout: data.allow_clockinout !== undefined 
                    ? data.allow_clockinout 
                    : business.allow_clockinout,
                has_app_access: data.has_app_access !== undefined 
                    ? data.has_app_access 
                    : business.has_app_access,
                allow_checkin: data.allow_checkin !== undefined 
                    ? data.allow_checkin 
                    : business.allow_checkin
            });

            // Step 5: Update the business's employee list
            await this.businessModel.findByIdAndUpdate(
                businessId,
                {$addToSet: {employeeIds: employee._id}}
            );

            // Step 6: Send welcome email
            await this.sendEmployeeWelcomeEmail({
                name: data.name,
                surname: data.surname,
                email: data.email
            }, business.name);

            return {
                success: true,
                message: 'Employee created successfully',
                employee,
                userId: userId || null
            };
        } catch (error) {
            this.logger.error(`Error creating employee: ${error.message}`);
            throw error;
        }
    }

    /**
     * Send welcome email to newly created employee
     */
    async sendEmployeeWelcomeEmail(employee: any, businessName: string): Promise<void> {
        try {
            // Extract employee name
            const employeeName = employee.name
                ? (employee.surname ? `${employee.name} ${employee.surname}` : employee.name)
                : 'New Staff Member';

            // Get current year for the copyright
            const currentYear = new Date().getFullYear();

            // Send welcome email using EmailService
            await this.emailService.sendTemplateEmail(
                'Staffluent',
                'staffluent@omnistackhub.xyz',
                employee.email,
                'Welcome to Staffluent!',
                'templates/business/new-staff-email.html',
                {
                    staffName: employeeName,
                    businessName: businessName,
                    currentYear: currentYear
                }
            );

            this.logger.log(`Sent welcome email to employee: ${employee.email}`);
        } catch (error) {
            // Log error but don't fail the process
            this.logger.error(`Error sending employee welcome email: ${error.message}`);
        }
    }

    /**
     * Send welcome email to newly created client
     */
    async sendClientWelcomeEmail(client: any, businessName: string): Promise<void> {
        try {
            // Extract client name
            const clientName = client.name || 'Valued Client';

            // Get current year for the copyright
            const currentYear = new Date().getFullYear();

            // Send welcome email using EmailService
            await this.emailService.sendTemplateEmail(
                'Staffluent',
                'staffluent@omnistackhub.xyz',
                client.email,
                'Welcome to Staffluent Client Portal!',
                'templates/business/new-client-email.html',
                {
                    clientName: clientName,
                    businessName: businessName,
                    currentYear: currentYear
                }
            );

            this.logger.log(`Sent welcome email to client: ${client.email}`);
        } catch (error) {
            // Log error but don't fail the process
            this.logger.error(`Error sending client welcome email: ${error.message}`);
        }
    }


    /**
     * Create a new App Client for a business (simple version without user creation)
     */
    async createSimpleAppClient(
        clientId: string,
        data: {
            name: string;
            adminUserId: string; // Admin user ID to find the business
            type?: ClientType;
            contact_person?: string;
            email?: string;
            phone?: string;
            notes?: string;
            external_ids?: Record<string, any>;
            metadata?: Record<string, any>;
        }
    ) {
        try {
            this.logger.log(`Creating new simple app client for client: ${clientId}`);

            // Step 1: Find business by adminUserId
            const business = await this.businessModel.findOne({
                clientId,
                adminUserId: data.adminUserId
            });

            if (!business) {
                throw new NotFoundException('Business not found for the provided admin user');
            }

            const businessId = business._id.toString();

            // Step 2: Create the app client
            const appClient = await this.appClientModel.create({
                clientId,
                businessId,
                name: data.name,
                type: data.type || ClientType.INDIVIDUAL,
                contact_person: data.contact_person,
                email: data.email,
                phone: data.phone,
                notes: data.notes,
                external_ids: data.external_ids || {},
                metadata: data.metadata || {},
                is_active: true
            });

            // Step 3: Update the business's client list
            await this.businessModel.findByIdAndUpdate(
                businessId,
                { $addToSet: { appClientIds: appClient._id } }
            );

            return {
                success: true,
                message: 'App client created successfully',
                appClient
            };
        } catch (error) {
            this.logger.error(`Error creating simple app client: ${error.message}`);
            throw error;
        }
    }

    async softDeleteBusiness(clientId: string, businessId: string) {
        try {
            // Verify business exists and belongs to this client
            const business = await this.businessModel.findOne({
                _id: businessId,
                clientId
            });
    
            if (!business) {
                throw new NotFoundException('Business not found');
            }
    
            // Soft delete the business
            const updatedBusiness = await this.businessModel.findByIdAndUpdate(
                businessId,
                { 
                    $set: { 
                        isDeleted: true,
                        deletedAt: new Date(),
                        isActive: false // Also mark as inactive
                    } 
                },
                { new: true }
            );
    
            // Also soft delete all associated users (admin and staff)
            // Get all user IDs associated with this business
            const userIds = [...(business.userIds || [])];
            
            // Add the admin user if not already included
            if (business.adminUserId && !userIds.includes(business.adminUserId)) {
                userIds.push(business.adminUserId);
            }
    
            // Soft delete each user
            if (userIds.length > 0) {
                await this.userModel.updateMany(
                    { _id: { $in: userIds } },
                    { 
                        $set: { 
                            isDeleted: true, 
                            deletedAt: new Date(),
                            isActive: false 
                        } 
                    }
                );
                this.logger.log(`Soft deleted ${userIds.length} users associated with business ${businessId}`);
            }
            
            return {
                success: true,
                business: updatedBusiness,
                message: 'Business and associated users deleted successfully'
            };
        } catch (error) {
            this.logger.error(`Error soft deleting business: ${error.message}`);
            throw error;
        }
    }


   /**
 * Update business details
 */
async updateBusiness(
    clientId: string,
    businessId: string,
    updateData: {
        name?: string;
        email?: string;
        phone?: string;
        type?: string;
        operationType?: string;
        address?: {
            street?: string;
            city?: string;
            cityId?: string;
            state?: string;
            stateId?: string;
            postcode?: string;
            country?: string;
            countryId?: string;
        };
        taxId?: string;
        vatNumber?: string;
        currency?: string;
        allow_clockinout?: boolean;
        has_app_access?: boolean;
        allow_checkin?: boolean;
        metadata?: Record<string, any>;
    }
) {
    try {
        this.logger.log(`Updating business ${businessId} for client ${clientId}`);

        // Verify business exists and belongs to this client
        const business = await this.businessModel.findOne({
            _id: businessId,
            clientId
        });

        if (!business) {
            throw new NotFoundException('Business not found');
        }

        // Prepare update fields
        const updateFields: any = {};
        const {
            name,
            email,
            phone,
            type,
            taxId,
            operationType,
            vatNumber,
            currency,
            allow_clockinout,
            has_app_access,
            allow_checkin,
            metadata,
            address
        } = updateData;

        // Set basic fields if provided
        if (name) updateFields.name = name;
        if (email) updateFields.email = email;
        if (phone) updateFields.phone = phone;
        if (type) updateFields.type = type;
        if (taxId) updateFields.taxId = taxId;
        if (operationType) updateFields.operationType = operationType;
        if (vatNumber) updateFields.vatNumber = vatNumber;
        if (currency) updateFields.currency = currency;
        
        // Set capability flags if provided
        if (allow_clockinout !== undefined) updateFields.allow_clockinout = allow_clockinout;
        if (has_app_access !== undefined) updateFields.has_app_access = has_app_access;
        if (allow_checkin !== undefined) updateFields.allow_checkin = allow_checkin;

        // Handle metadata updates if provided
        if (metadata && Object.keys(metadata).length > 0) {
            // Get existing metadata
            const existingMetadata = business.metadata || new Map();
            
            // Merge new metadata with existing
            Object.entries(metadata).forEach(([key, value]) => {
                existingMetadata.set(key, value);
            });
            
            updateFields.metadata = existingMetadata;
        }

        // Update the business
        if (Object.keys(updateFields).length > 0) {
            await this.businessModel.updateOne(
                { _id: businessId },
                { $set: updateFields }
            );
            this.logger.log(`Updated basic fields for business ${businessId}`);
        }

        if (address && Object.values(address).some(val => val !== undefined)) {
            // Check if address exists
            let addressId = business.addressId;
        
            // Handle the different field names that might come from the frontend
            const postcodeValue = address.postcode !== undefined ? address.postcode : '';
            
            // Prepare address data with proper fields
            const addressData: any = {
                businessId,
                clientId
            };
            
            // Always set these fields explicitly
            if (address.street !== undefined) addressData.addressLine1 = address.street;
            addressData.postcode = postcodeValue; // Always set postcode, even if empty
            
            // IDs need special handling
            const isValidObjectId = (id: string) => /^[0-9a-fA-F]{24}$/.test(id);
            
            if (address.cityId && isValidObjectId(address.cityId)) {
                addressData.cityId = address.cityId;
            }
            
            if (address.stateId && isValidObjectId(address.stateId)) {
                addressData.stateId = address.stateId;
            }
            
            if (address.countryId && isValidObjectId(address.countryId)) {
                addressData.countryId = address.countryId;
            }
            
            if (addressId) {
                // Update existing address - explicitly set each field
                const updateFields = {};
                Object.keys(addressData).forEach(key => {
                    if (addressData[key] !== undefined && key !== 'businessId' && key !== 'clientId') {
                        updateFields[key] = addressData[key];
                    }
                });
                
                // Make sure postcode is always included in the update
                updateFields['postcode'] = postcodeValue;
                
                await this.addressModel.updateOne(
                    { _id: addressId },
                    { $set: updateFields }
                );
                this.logger.log(`Updated address for business: ${businessId}`);
            } else {
                try {
                    // Create a complete new address record
                    const newAddress = await this.addressModel.create({
                        addressLine1: addressData.addressLine1 || '',
                        postcode: postcodeValue,
                        cityId: addressData.cityId || null,
                        stateId: addressData.stateId || null,
                        countryId: addressData.countryId || null,
                        businessId,
                        clientId
                    });
        
                    // Link address to business
                    await this.businessModel.updateOne(
                        { _id: businessId },
                        { $set: { addressId: newAddress._id } }
                    );
                    this.logger.log(`Created new address for business: ${businessId}`);
                } catch (error) {
                    this.logger.error(`Error creating address: ${error.message}`);
                }
            }
        }
        

        // Get updated business with populated fields - using lean() to get plain objects
        const updatedBusiness = await this.businessModel.findById(businessId)
            .populate({
                path: 'addressId',
                populate: ['city', 'state', 'country']
            })
            .populate({
                path: 'adminUserId',
                select: 'name surname email',
                model: 'User'
            })
            .lean();  // Convert to plain JavaScript object

        // Format the response
        const adminUserData = updatedBusiness.adminUserId && typeof updatedBusiness.adminUserId !== 'string'
            ? updatedBusiness.adminUserId as any
            : null;

        const adminUser = adminUserData ? {
            _id: adminUserData._id,
            name: adminUserData.surname
                ? `${adminUserData.name || ''} ${adminUserData.surname}`.trim()
                : (adminUserData.name || ''),
            email: adminUserData.email
        } : undefined;

        // Extract business data and restructure for response
        const { adminUserId, ...businessData } = updatedBusiness;

        // Format address for response if it exists
        let formattedAddress = undefined;
        const addressData = updatedBusiness.addressId as any;
        if (addressData) {
            formattedAddress = {
                street: addressData.addressLine1,
                city: addressData.city?.name || '',
                state: addressData.state?.name || '',
                postcode: addressData.postcode || '',
                country: addressData.country?.name || ''
            };
        }

        return {
            success: true,
            message: 'Business updated successfully',
            business: {
                ...businessData,
                address: formattedAddress,
                adminUser,
                subscription: {
                    tier: this.getSubscriptionTier(updatedBusiness as any),
                    status: updatedBusiness.subscriptionStatus,
                    endDate: updatedBusiness.subscriptionEndDate,
                    details: updatedBusiness.subscriptionDetails
                }
            }
        };
    } catch (error) {
        this.logger.error(`Error updating business: ${error.message}`);
        throw error;
    }
}

    /**
     * Update business capabilities and optionally apply to all employees
     */
    async updateBusinessCapabilities(
        clientId: string,
        businessId: string,
        updateData: {
            allow_clockinout?: boolean;
            has_app_access?: boolean;
            allow_checkin?: boolean;
            applyToAllEmployees?: boolean;
        }
    ) {
        try {
            this.logger.log(`Updating capabilities for business ${businessId}`);

            // Verify business exists and belongs to this client
            const business = await this.businessModel.findOne({
                _id: businessId,
                clientId
            });

            if (!business) {
                throw new NotFoundException('Business not found');
            }

            // Prepare update fields
            const updateFields: any = {};
            
            // Set capability flags if provided
            if (updateData.allow_clockinout !== undefined) updateFields.allow_clockinout = updateData.allow_clockinout;
            if (updateData.has_app_access !== undefined) updateFields.has_app_access = updateData.has_app_access;
            if (updateData.allow_checkin !== undefined) updateFields.allow_checkin = updateData.allow_checkin;

            // If no capability fields were provided, return early
            if (Object.keys(updateFields).length === 0) {
                return {
                    success: false,
                    message: 'No capability changes provided',
                    business
                };
            }

            // Update the business
            const updatedBusiness = await this.businessModel.findByIdAndUpdate(
                businessId,
                { $set: updateFields },
                { new: true }
            );

            // If applyToAllEmployees is true, update all employees of this business
            let updatedEmployeesCount = 0;
            if (updateData.applyToAllEmployees) {
                // Find all employees for this business
                const employees = await this.employeeModel.find({ businessId });
                
                if (employees.length > 0) {
                    // Prepare employee update fields
                    const employeeUpdateFields: any = {};
                    
                    // Only include fields that were provided for the business
                    if (updateData.allow_clockinout !== undefined) {
                        employeeUpdateFields.allow_clockinout = updateData.allow_clockinout;
                    }
                    
                    if (updateData.has_app_access !== undefined) {
                        employeeUpdateFields.has_app_access = updateData.has_app_access;
                    }
                    
                    if (updateData.allow_checkin !== undefined) {
                        employeeUpdateFields.allow_checkin = updateData.allow_checkin;
                    }

                    // Update all employees
                    const updateResult = await this.employeeModel.updateMany(
                        { businessId },
                        { $set: employeeUpdateFields }
                    );
                    
                    updatedEmployeesCount = updateResult.modifiedCount;
                    this.logger.log(`Updated capabilities for ${updatedEmployeesCount} employees of business ${businessId}`);
                }
            }
            
            return {
                success: true,
                message: 'Business capabilities updated successfully' + 
                    (updatedEmployeesCount > 0 ? ` and applied to ${updatedEmployeesCount} employees` : ''),
                business: updatedBusiness,
                updatedEmployeesCount
            };
        } catch (error) {
            this.logger.error(`Error updating business capabilities: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update employee details
     */
    async updateEmployee(
        clientId: string,
        employeeId: string,
        updateData: {
            name?: string;
            email?: string;
            allow_clockinout?: boolean;
            has_app_access?: boolean;
            allow_checkin?: boolean;
            external_ids?: Record<string, any>;
            metadata?: Record<string, any>;
        }
    ) {
        try {
            this.logger.log(`Updating employee ${employeeId} for client ${clientId}`);

            // Verify employee exists and belongs to this client
            const employee = await this.employeeModel.findOne({
                _id: employeeId,
                clientId
            });

            if (!employee) {
                throw new NotFoundException('Employee not found');
            }

            // If email is being updated, check if it's already in use
            if (updateData.email && updateData.email !== employee.email) {
                const existingEmployee = await this.employeeModel.findOne({
                    email: updateData.email,
                    clientId,
                    _id: { $ne: employeeId } // Exclude current employee
                });

                if (existingEmployee) {
                    throw new BadRequestException('Email already in use by another employee');
                }

                // If employee has a user account, update that email as well
                if (employee.user_id) {
                    const user = await this.userModel.findById(employee.user_id);
                    if (user) {
                        // Check if email is used by another user
                        const existingUser = await this.userModel.findOne({
                            email: updateData.email,
                            _id: { $ne: employee.user_id }
                        });

                        if (existingUser) {
                            throw new BadRequestException('Email already in use by another user');
                        }

                        // Update user email
                        await this.userModel.updateOne(
                            { _id: employee.user_id },
                            { $set: { email: updateData.email } }
                        );
                        this.logger.log(`Updated email for associated user account: ${employee.user_id}`);
                    }
                }
            }

            // Prepare update fields
            const updateFields: any = {};
            
            // Set basic fields if provided
            if (updateData.name !== undefined) updateFields.name = updateData.name;
            if (updateData.email !== undefined) updateFields.email = updateData.email;
            
            // Set capability flags if provided
            if (updateData.allow_clockinout !== undefined) updateFields.allow_clockinout = updateData.allow_clockinout;
            if (updateData.has_app_access !== undefined) updateFields.has_app_access = updateData.has_app_access;
            if (updateData.allow_checkin !== undefined) updateFields.allow_checkin = updateData.allow_checkin;

            // Handle external_ids updates if provided
            if (updateData.external_ids) {
                updateFields.external_ids = {
                    ...employee.external_ids,
                    ...updateData.external_ids
                };
            }

            // Handle metadata updates if provided
            if (updateData.metadata && Object.keys(updateData.metadata).length > 0) {
                // Get existing metadata
                const existingMetadata = employee.metadata || new Map();
                
                // Merge new metadata with existing
                Object.entries(updateData.metadata).forEach(([key, value]) => {
                    existingMetadata.set(key, value);
                });
                
                updateFields.metadata = existingMetadata;
            }

            // If no fields were provided, return early
            if (Object.keys(updateFields).length === 0) {
                return {
                    success: false,
                    message: 'No update data provided',
                    employee
                };
            }

            // Update the employee
            const updatedEmployee = await this.employeeModel.findByIdAndUpdate(
                employeeId,
                { $set: updateFields },
                { new: true }
            );

            // Get business info for context
            const business = await this.businessModel.findById(employee.businessId);
            
            return {
                success: true,
                message: 'Employee updated successfully',
                employee: updatedEmployee,
                capabilities: {
                    allow_clockinout: updatedEmployee.allow_clockinout !== null 
                        ? updatedEmployee.allow_clockinout 
                        : (business?.allow_clockinout || false),
                    has_app_access: updatedEmployee.has_app_access !== null 
                        ? updatedEmployee.has_app_access 
                        : (business?.has_app_access || false),
                    allow_checkin: updatedEmployee.allow_checkin !== null 
                        ? updatedEmployee.allow_checkin 
                        : (business?.allow_checkin || false)
                }
            };
        } catch (error) {
            this.logger.error(`Error updating employee: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update employee capabilities
     */
    async updateEmployeeCapabilities(
        clientId: string,
        employeeId: string,
        updateData: {
            allow_clockinout?: boolean;
            has_app_access?: boolean;
            allow_checkin?: boolean;
        }
    ) {
        try {
            this.logger.log(`Updating capabilities for employee ${employeeId}`);

            // Verify employee exists and belongs to this client
            const employee = await this.employeeModel.findOne({
                _id: employeeId,
                clientId
            });

            if (!employee) {
                throw new NotFoundException('Employee not found');
            }

            // Prepare update fields - only include fields that were provided
            const updateFields: any = {};
            
            if (updateData.allow_clockinout !== undefined) {
                updateFields.allow_clockinout = updateData.allow_clockinout;
            }
            
            if (updateData.has_app_access !== undefined) {
                updateFields.has_app_access = updateData.has_app_access;
            }
            
            if (updateData.allow_checkin !== undefined) {
                updateFields.allow_checkin = updateData.allow_checkin;
            }

            // If no fields were provided, return early
            if (Object.keys(updateFields).length === 0) {
                return {
                    success: false,
                    message: 'No capability changes provided',
                    employee
                };
            }

            // Update the employee
            const updatedEmployee = await this.employeeModel.findByIdAndUpdate(
                employeeId,
                { $set: updateFields },
                { new: true }
            );

            // Get business info for context
            const business = await this.businessModel.findById(employee.businessId);
            
            return {
                success: true,
                message: 'Employee capabilities updated successfully',
                employee: updatedEmployee,
                capabilities: {
                    allow_clockinout: updatedEmployee.allow_clockinout !== null 
                        ? updatedEmployee.allow_clockinout 
                        : (business?.allow_clockinout || false),
                    has_app_access: updatedEmployee.has_app_access !== null 
                        ? updatedEmployee.has_app_access 
                        : (business?.has_app_access || false),
                    allow_checkin: updatedEmployee.allow_checkin !== null 
                        ? updatedEmployee.allow_checkin 
                        : (business?.allow_checkin || false)
                }
            };
        } catch (error) {
            this.logger.error(`Error updating employee capabilities: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get business details by ID
     */
    async getBusinessDetails(clientId: string, businessId: string) {
        try {
            // Find the business with the client's ID to ensure access control
            const business = await this.businessModel.findOne({
                _id: businessId,
                clientId
            })
            .populate('address')
            .populate({
                path: 'adminUserId',
                select: 'name surname email',
                model: 'User'
            });

            if (!business) {
                throw new NotFoundException('Business not found');
            }

            // Format the response similar to the list endpoint
            const adminUserData = business.adminUserId && typeof business.adminUserId !== 'string'
                ? business.adminUserId as any  // Type assertion
                : null;

            const adminUser = adminUserData ? {
                _id: adminUserData._id,
                name: adminUserData.surname
                    ? `${adminUserData.name || ''} ${adminUserData.surname}`.trim()
                    : (adminUserData.name || ''),
                email: adminUserData.email
            } : undefined;

            // Extract the business object and restructure for the response
            const { adminUserId, ...businessData } = business.toObject();

            // Create the formatted business response
            return {
                ...businessData,
                adminUser,
                subscription: {
                    tier: this.getSubscriptionTier(business),
                    status: business.subscriptionStatus,
                    endDate: business.subscriptionEndDate,
                    details: business.subscriptionDetails
                }
            };
        } catch (error) {
            this.logger.error(`Error fetching business details: ${error.message}`);
            throw error;
        }
    }

    // Add this method to src/services/business.service.ts

    /**
     * Get subscription tier from business
     */
    private getSubscriptionTier(business: Business): string {
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
     * Get employees for a business
     */
    async getBusinessEmployees(
        clientId: string,
        businessId: string,
        params: {
        page?: number;
        limit?: number;
        search?: string;
        sort?: string;
        } = {}
    ) {
        try {
        const {
            page = 1,
            limit = 10,
            search = '',
            sort = 'name_asc'
        } = params;
    
        const skip = (page - 1) * limit;
    
        // Build the filter for employees
        const employeeFilter: any = {
            clientId,
            businessId,
            isDeleted: { $ne: true }
        };
    
        // Add search filter if provided
        if (search) {
            employeeFilter.$or = [
            { name: new RegExp(search, 'i') },
            { email: new RegExp(search, 'i') }
            ];
        }
    
        // Get the business to ensure it exists and belongs to the client
        const business = await this.businessModel.findOne({
            _id: businessId,
            clientId,
            isDeleted: { $ne: true }
        });
    
        if (!business) {
            throw new NotFoundException('Business not found');
        }
    
        // Get total count of employees
        const totalEmployees = await this.employeeModel.countDocuments(employeeFilter);
        
        // Handle sorting
        const [sortField, sortDirection] = (sort || 'name_asc').split('_');
        const sortOptions = {};
        sortOptions[sortField || 'name'] = sortDirection === 'desc' ? -1 : 1;
    
        // Get employees with pagination
        const employees = await this.employeeModel
            .find(employeeFilter)
            .sort(sortOptions)
            .skip(skip)
            .limit(limit);
    
        // For each employee, find if they have a user account
        const items = await Promise.all(
            employees.map(async (employee) => {
            let user = null;
            
            // If the employee has a user_id, fetch the user data
            if (employee.user_id) {
                user = await this.userModel.findOne({
                _id: employee.user_id,
                isDeleted: { $ne: true }
                });
            }
    
            return {
                ...employee.toObject(),
                user
            };
            })
        );
    
        // Get business capabilities to use as defaults
        const businessCapabilities = {
            allow_clockinout: business.allow_clockinout !== false,
            has_app_access: business.has_app_access !== false,
            allow_checkin: business.allow_checkin !== false
        };
    
        return {
            items,
            total: totalEmployees,
            pages: Math.ceil(totalEmployees / limit),
            page,
            limit,
            businessCapabilities
        };
        } catch (error) {
        this.logger.error(`Error fetching employees for business ${businessId}: ${error.message}`);
        throw error;
        }
    }
}