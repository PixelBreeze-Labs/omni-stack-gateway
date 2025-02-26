// src/services/subscription.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Stripe from 'stripe';
import { StripeProduct } from '../schemas/stripe-product.schema';
import { StripePrice } from '../schemas/stripe-price.schema';
import { Client } from '../schemas/client.schema';
import {
    Subscription,
    SubscriptionMetrics,
    SubscriptionParams,
    SubscriptionsResponse
} from "../interfaces/subscription.interface";
import { Business, SubscriptionStatus } from "../schemas/business.schema";
import { User } from '../schemas/user.schema';

@Injectable()
export class SubscriptionService {
    private readonly logger = new Logger(SubscriptionService.name);

    constructor(
        @InjectModel(StripeProduct.name) private productModel: Model<StripeProduct>,
        @InjectModel(StripePrice.name) private priceModel: Model<StripePrice>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        @InjectModel(Business.name) private businessModel: Model<Business>,
        @InjectModel(User.name) private userModel: Model<User>,
    ) {
    }

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

    /**
     * List products directly from Stripe (needed for sync operation)
     */
    private async listStripeProducts(clientId: string) {
        try {
            const stripe = await this.getStripeInstance(clientId);
            const client = await this.clientModel.findById(clientId);

            if (!client?.subscriptionConfig?.productPrefix) {
                throw new BadRequestException('Product prefix not configured');
            }

            const prefix = client.subscriptionConfig.productPrefix;

            // Get all products from Stripe
            const allProducts = await stripe.products.list({active: true, limit: 100});

            // Filter by prefix
            const clientProducts = allProducts.data.filter(product =>
                product.name.startsWith(prefix)
            );

            return clientProducts;
        } catch (error) {
            this.logger.error(`Error fetching Stripe products: ${error.message}`);
            throw error;
        }
    }

    /**
     * Sync products and prices from Stripe to our database
     */
    async syncProductsAndPrices(clientId: string) {
        try {
            // Get products from Stripe
            const stripeProducts = await this.listStripeProducts(clientId);

            // Sync each product and its prices
            let totalPrices = 0;

            for (const stripeProduct of stripeProducts) {
                // Create or update product
                const product = await this.productModel.findOneAndUpdate(
                    {stripeProductId: stripeProduct.id, clientId},
                    {
                        name: stripeProduct.name,
                        description: stripeProduct.description,
                        stripeProductId: stripeProduct.id,
                        clientId,
                        isActive: stripeProduct.active,
                        metadata: stripeProduct.metadata,
                    },
                    {upsert: true, new: true}
                );

                // Fetch prices for this product
                const stripe = await this.getStripeInstance(clientId);
                const stripePrices = await stripe.prices.list({
                    product: stripeProduct.id,
                    active: true,
                    limit: 100
                });

                totalPrices += stripePrices.data.length;

                // Sync prices
                for (const stripePrice of stripePrices.data) {
                    await this.priceModel.findOneAndUpdate(
                        {stripePriceId: stripePrice.id, stripeProductId: product._id},
                        {
                            stripeProductId: product._id,
                            clientId,
                            stripePriceId: stripePrice.id,
                            amount: stripePrice.unit_amount,
                            currency: stripePrice.currency.toUpperCase(),
                            interval: stripePrice.recurring?.interval || 'month',
                            intervalCount: stripePrice.recurring?.interval_count || 1,
                            trialPeriodDays: stripePrice.recurring?.trial_period_days,
                            isActive: stripePrice.active,
                            metadata: stripePrice.metadata,
                        },
                        {upsert: true, new: true}
                    );
                }

                // Deactivate prices that no longer exist in Stripe
                const activeStripePriceIds = stripePrices.data.map(p => p.id);
                await this.priceModel.updateMany(
                    {
                        stripeProductId: product._id,
                        stripePriceId: {$nin: activeStripePriceIds},
                    },
                    {isActive: false}
                );
            }

            // Deactivate products that no longer exist in Stripe
            const activeStripeProductIds = stripeProducts.map(p => p.id);
            await this.productModel.updateMany(
                {
                    clientId,
                    stripeProductId: {$nin: activeStripeProductIds},
                },
                {isActive: false}
            );

            return {
                success: true,
                productsCount: stripeProducts.length,
                pricesCount: totalPrices
            };
        } catch (error) {
            this.logger.error(`Error syncing products and prices: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get all products with their prices from our database
     * Supports pagination, search, and status filtering
     */
    async getProductsWithPrices(clientId: string, query: any = {}) {
        // Prepare filters
        const filters: any = {clientId};

        // Add search filter
        if (query.search) {
            filters.$or = [
                {name: new RegExp(query.search, 'i')},
                {description: new RegExp(query.search, 'i')}
            ];
        }

        // Add status filter
        if (query.status) {
            filters.isActive = query.status === 'ACTIVE';
        }

        // Prepare pagination
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 10;
        const skip = (page - 1) * limit;

        // Get total count
        const total = await this.productModel.countDocuments(filters);
        const totalPages = Math.ceil(total / limit);

        // Get products with pagination
        const products = await this.productModel
            .find(filters)
            .sort({createdAt: -1})
            .skip(skip)
            .limit(limit)
            .lean();

        // Get prices for each product
        const productsWithPrices = await Promise.all(
            products.map(async (product) => {
                const prices = await this.priceModel
                    .find({
                        stripeProductId: product._id,
                        isActive: true,
                    })
                    .lean();

                return {
                    ...product,
                    prices,
                };
            })
        );

        // Get metrics
        const metrics = {
            totalProducts: await this.productModel.countDocuments({clientId}),
            activeProducts: await this.productModel.countDocuments({clientId, isActive: true}),
            totalPrices: await this.priceModel.countDocuments({clientId}),
            activePrices: await this.priceModel.countDocuments({clientId, isActive: true}),
            trends: {
                products: {value: 0, percentage: 5}, // You could calculate this from historical data
                prices: {value: 0, percentage: 3}    // You could calculate this from historical data
            }
        };

        return {
            items: productsWithPrices,
            total,
            pages: totalPages,
            page,
            limit,
            metrics
        };
    }

    async getSubscriptions(clientId: string, query: SubscriptionParams = {}): Promise<SubscriptionsResponse> {
        try {
            console.log('Starting getSubscriptions with clientId:', clientId);

            // Prepare filters: only include businesses that have a Stripe subscription
            const filters: any = { clientId, stripeSubscriptionId: { $exists: true, $ne: null } };

            // Add status filter
            if (query.status) {
                filters.subscriptionStatus = query.status;
            }

            if (query.businessId) {
                filters._id = query.businessId;
            }

            // Optional search on business name or email
            if (query.search) {
                filters.$or = [
                    { name: { $regex: query.search, $options: 'i' } },
                    { email: { $regex: query.search, $options: 'i' } }
                ];
            }

            console.log('Filters:', JSON.stringify(filters));

            // Pagination setup
            const page = query.page ? Number(query.page) : 1;
            const limit = query.limit ? Number(query.limit) : 10;
            const skip = (page - 1) * limit;

            // Get total count - wrap in try/catch to isolate errors
            let total = 0;
            try {
                total = await this.businessModel.countDocuments(filters);
                console.log('Total documents count:', total);
            } catch (countError) {
                console.error('Error counting documents:', countError);
                throw new Error(`Error counting documents: ${countError.message}`);
            }

            const totalPages = Math.ceil(total / limit);

            // Fetch businesses with their admin users - wrap in try/catch
            let businesses = [];
            try {
                businesses = await this.businessModel.find(filters)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean();
                console.log(`Found ${businesses.length} businesses`);
            } catch (findError) {
                console.error('Error finding businesses:', findError);
                throw new Error(`Error finding businesses: ${findError.message}`);
            }

            // If no businesses found, return empty results
            if (businesses.length === 0) {
                console.log('No businesses found, returning empty results');
                return {
                    items: [],
                    total: 0,
                    pages: 0,
                    page,
                    limit,
                    metrics: this.getDefaultMetrics()
                };
            }

            // Get admin users for each business - wrap in try/catch
            let adminUsers = [];
            try {
                // Log the first business to see its structure
                console.log('First business sample structure:',
                    JSON.stringify(businesses[0], null, 2).substring(0, 500) + '...');

                const adminUserIds = businesses
                    .map(b => b.adminUserId)
                    .filter(id => id != null);

                console.log(`Found ${adminUserIds.length} admin user IDs`);

                if (adminUserIds.length > 0) {
                    adminUsers = await this.userModel.find({ _id: { $in: adminUserIds } }).lean();
                    console.log(`Found ${adminUsers.length} admin users`);
                }
            } catch (adminError) {
                console.error('Error finding admin users:', adminError);
                // Continue without admin users rather than failing completely
                console.log('Continuing without admin users');
            }

            // Create map for easier lookup
            const adminUserMap = {};
            try {
                adminUsers.forEach(user => {
                    if (user && user._id) {
                        adminUserMap[user._id.toString()] = user;
                    }
                });
            } catch (mapError) {
                console.error('Error creating admin user map:', mapError);
            }

            // Fetch products for the businesses - wrap in try/catch
            let products = [];
            try {
                const productIds = businesses
                    .map(b => b.subscriptionDetails?.planId)
                    .filter(id => id != null);

                console.log(`Found ${productIds.length} product IDs`);

                if (productIds.length > 0) {
                    products = await this.productModel.find({ _id: { $in: productIds } }).lean();
                    console.log(`Found ${products.length} products`);
                }
            } catch (productError) {
                console.error('Error finding products:', productError);
                // Continue without products rather than failing completely
                console.log('Continuing without products');
            }

            // Create map for easier lookup
            const productMap = {};
            try {
                products.forEach(product => {
                    if (product && product._id) {
                        productMap[product._id.toString()] = product;
                    }
                });
            } catch (mapError) {
                console.error('Error creating product map:', mapError);
            }

            // Map Business documents to the Subscription interface
            const subscriptions = [];
            for (let i = 0; i < businesses.length; i++) {
                try {
                    const business = businesses[i];
                    console.log(`Processing business ${i+1}/${businesses.length}: ${business._id}`);

                    // Safety check
                    if (!business || !business._id) {
                        console.log(`Skipping invalid business at index ${i}`);
                        continue;
                    }

                    // Safely get adminUser
                    let adminUser = null;
                    try {
                        if (business.adminUserId) {
                            const adminUserId = business.adminUserId.toString();
                            adminUser = adminUserMap[adminUserId] || null;
                        }
                    } catch (adminError) {
                        console.error(`Error getting admin user for business ${business._id}:`, adminError);
                    }

                    // Safely get product
                    let product = null;
                    try {
                        if (business.subscriptionDetails?.planId) {
                            const planId = business.subscriptionDetails.planId.toString();
                            product = productMap[planId] || null;
                        }
                    } catch (productError) {
                        console.error(`Error getting product for business ${business._id}:`, productError);
                    }

                    // Handle dates safely
                    let createdAt = '';
                    let updatedAt = '';
                    let subscriptionEndDate = '';

                    try {
                        // For createdAt, use _id timestamp as fallback
                        if (business.createdAt) {
                            createdAt = new Date(business.createdAt).toISOString();
                        } else if (business._id && business._id.getTimestamp) {
                            createdAt = business._id.getTimestamp().toISOString();
                        } else if (business._id) {
                            // Extract timestamp from ObjectId
                            const timestamp = parseInt(business._id.toString().substring(0, 8), 16) * 1000;
                            createdAt = new Date(timestamp).toISOString();
                        }

                        // For updatedAt, use _id timestamp as fallback
                        if (business.updatedAt) {
                            updatedAt = new Date(business.updatedAt).toISOString();
                        } else {
                            updatedAt = createdAt;
                        }

                        // For subscriptionEndDate, just use direct access
                        if (business.subscriptionEndDate) {
                            subscriptionEndDate = new Date(business.subscriptionEndDate).toISOString();
                        }
                    } catch (dateError) {
                        console.error(`Error handling dates for business ${business._id}:`, dateError);
                        // Use empty strings as fallback
                    }

                    // Create a simplified business object
                    const businessData = {
                        _id: business._id?.toString() || '',
                        name: business.name || '',
                        email: business.email || '',
                        // Add additional required properties to satisfy the Business interface
                        clientId: business.clientId
                    };

                    // Build the subscription object
                    const subscription = {
                        _id: business._id?.toString() || '',
                        clientId: business.clientId?.toString() || '',
                        businessId: business._id?.toString() || '',
                        stripeSubscriptionId: business.stripeSubscriptionId || '',
                        status: business.subscriptionStatus || 'CANCELED', // Default if missing
                        currentPeriodStart: createdAt,
                        currentPeriodEnd: subscriptionEndDate || createdAt,
                        cancelAtPeriodEnd: false,
                        productId: business.subscriptionDetails?.planId?.toString() || '',
                        priceId: business.subscriptionDetails?.priceId?.toString() || '',
                        quantity: 1, // Always 1 as mentioned
                        amount: business.subscriptionDetails?.amount || 0,
                        currency: business.subscriptionDetails?.currency || 'USD',
                        interval: business.subscriptionDetails?.interval || 'month',
                        metadata: business.metadata || {},
                        createdAt: createdAt,
                        updatedAt: updatedAt,
                        business: businessData,
                        product: product ? {
                            _id: product._id?.toString() || '',
                            name: product.name || '',
                            description: product.description || ''
                        } : undefined
                    };

                    subscriptions.push(subscription);
                } catch (businessError) {
                    console.error(`Error processing business at index ${i}:`, businessError);
                    // Continue with next business instead of failing completely
                }
            }

            console.log(`Successfully processed ${subscriptions.length} subscriptions`);

            // Calculate metrics with error handling
            let metrics;
            try {
                metrics = await this.calculateSubscriptionMetrics(clientId, filters);
            } catch (metricsError) {
                console.error('Error calculating metrics:', metricsError);
                metrics = this.getDefaultMetrics();
            }

            return {
                items: subscriptions,
                total,
                pages: totalPages,
                page,
                limit,
                metrics,
            };
        } catch (error) {
            // Enhance error with detailed information
            console.error('Fatal error in getSubscriptions:', error);

            // Create a detailed error object with the full stack trace
            const enhancedError = {
                message: `Subscription service error: ${error.message}`,
                stack: error.stack,
                name: error.name,
                code: error.code
            };

            // Convert the error to include detailed information
            const detailedError = new Error(JSON.stringify(enhancedError));
            throw detailedError;
        }
    }

    /**
     * Get default metrics when error occurs
     */
    private getDefaultMetrics(): SubscriptionMetrics {
        return {
            totalSubscriptions: 0,
            activeSubscriptions: 0,
            pastDueSubscriptions: 0,
            canceledSubscriptions: 0,
            trialingSubscriptions: 0,
            averageMRR: 0,
            totalMRR: 0,
            trends: {
                subscriptions: { value: 0, percentage: 0 },
                mrr: { value: 0, percentage: 0 },
                churnRate: { value: 0, percentage: 0 }
            }
        };
    }

    /**
     * Helper method to calculate subscription metrics
     */
    private async calculateSubscriptionMetrics(clientId: string, baseFilters: any): Promise<SubscriptionMetrics> {
        try {
            console.log('Calculating subscription metrics');

            // Basic metrics
            const totalSubscriptions = await this.businessModel.countDocuments(baseFilters);
            const activeSubscriptions = await this.businessModel.countDocuments({
                ...baseFilters,
                subscriptionStatus: 'ACTIVE'
            });
            const pastDueSubscriptions = await this.businessModel.countDocuments({
                ...baseFilters,
                subscriptionStatus: 'PAST_DUE'
            });
            const canceledSubscriptions = await this.businessModel.countDocuments({
                ...baseFilters,
                subscriptionStatus: 'CANCELED'
            });
            const trialingSubscriptions = await this.businessModel.countDocuments({
                ...baseFilters,
                subscriptionStatus: 'TRIALING'
            });

            console.log('Basic metrics calculated');

            // Calculate MRR
            const businesses = await this.businessModel
                .find(baseFilters)
                .select('subscriptionDetails')
                .lean();

            let totalMRR = 0;
            businesses.forEach(business => {
                const details = business.subscriptionDetails;
                if (details && typeof details.amount === 'number') {
                    let monthlyAmount = details.amount;
                    if (details.interval === 'year') {
                        monthlyAmount = details.amount / 12;
                    }
                    totalMRR += monthlyAmount;
                }
            });

            const averageMRR = totalSubscriptions > 0 ? totalMRR / totalSubscriptions : 0;
            console.log('MRR calculated');

            // Calculate simple trends as fallback
            const trends = {
                subscriptions: { value: 0, percentage: 0 },
                mrr: { value: 0, percentage: 0 },
                churnRate: { value: 0, percentage: 0 }
            };

            console.log('Returning metrics');
            return {
                totalSubscriptions,
                activeSubscriptions,
                pastDueSubscriptions,
                canceledSubscriptions,
                trialingSubscriptions,
                averageMRR,
                totalMRR,
                trends
            };
        } catch (error) {
            console.error('Error calculating subscription metrics:', error);
            return this.getDefaultMetrics();
        }
    }
    /**
     * Get active subscriptions
     */
    async getActiveSubscriptions(clientId: string, params: Omit<SubscriptionParams, 'status'> = {}): Promise<SubscriptionsResponse> {
        // First, get active subscriptions
        const activeResults = await this.getSubscriptions(clientId, {
            ...params,
            status: SubscriptionStatus.ACTIVE
        });

        // Then get trialing subscriptions
        const trialingResults = await this.getSubscriptions(clientId, {
            ...params,
            status: SubscriptionStatus.TRIALING
        });

        // Combine the results
        return {
            items: [...activeResults.items, ...trialingResults.items],
            total: activeResults.total + trialingResults.total,
            pages: Math.max(activeResults.pages, trialingResults.pages),
            page: params.page || 1,
            limit: params.limit || 10,
            metrics: activeResults.metrics // Use metrics from active subscriptions for simplicity
        };
    }

    /**
     * Get past due subscriptions
     */
    async getPastDueSubscriptions(clientId: string, params: Omit<SubscriptionParams, 'status'> = {}): Promise<SubscriptionsResponse> {
        return this.getSubscriptions(clientId, { ...params, status: SubscriptionStatus.PAST_DUE });
    }

    /**
     * Get canceled subscriptions
     */
    async getCanceledSubscriptions(clientId: string, params: Omit<SubscriptionParams, 'status'> = {}): Promise<SubscriptionsResponse> {
        return this.getSubscriptions(clientId, { ...params, status: SubscriptionStatus.CANCELED });
    }
}