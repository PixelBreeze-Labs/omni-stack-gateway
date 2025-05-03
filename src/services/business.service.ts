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

                    // Prepare address data with proper ID fields
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
                        this.logger.log(`Updated address for business: ${businessId}`);
                    } else {
                        // Create new address
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
                metadata: data.metadata || {}
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
}