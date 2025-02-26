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

            // Pagination setup
            const page = query.page ? Number(query.page) : 1;
            const limit = query.limit ? Number(query.limit) : 10;
            const skip = (page - 1) * limit;

            // Get total count
            const total = await this.businessModel.countDocuments(filters);
            const totalPages = Math.ceil(total / limit);

            // Fetch businesses with their admin users
            const businesses = await this.businessModel.find(filters)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            // Get admin users for each business
            const adminUserIds = businesses
                .map(b => b.adminUserId)
                .filter(id => id != null); // Explicit null check

            const adminUsers = adminUserIds.length > 0
                ? await this.userModel.find({ _id: { $in: adminUserIds } }).lean()
                : [];

            const adminUserMap = adminUsers.reduce((map, user) => {
                if (user && user._id) {
                    map[user._id.toString()] = user;
                }
                return map;
            }, {});

            // Fetch products for the businesses
            const productIds = businesses
                .map(b => b.subscriptionDetails?.planId)
                .filter(id => id != null); // Explicit null check

            const products = productIds.length > 0
                ? await this.productModel.find({ _id: { $in: productIds } }).lean()
                : [];

            const productMap = products.reduce((map, product) => {
                if (product && product._id) {
                    map[product._id.toString()] = product;
                }
                return map;
            }, {});

            // Map Business documents to the Subscription interface with populated fields
            const subscriptions = businesses.map(business => {
                // Safely get adminUser using optional chaining and nullish coalescing
                let adminUser = null;
                if (business.adminUserId) {
                    const adminUserId = business.adminUserId.toString();
                    adminUser = adminUserMap[adminUserId] || null;
                }

                // Safely get product using optional chaining and nullish coalescing
                let product = null;
                if (business.subscriptionDetails?.planId) {
                    const planId = business.subscriptionDetails.planId.toString();
                    product = productMap[planId] || null;
                }

                // Handle dates with type safety
                // For MongoDB's lean() objects, we need to access the fields differently
                const businessDoc = business as any; // Cast to any to access Mongoose virtuals

                const createdAt = businessDoc._id
                    ? businessDoc._id.getTimestamp?.() || null
                    : null;

                const updatedAt = businessDoc.updatedAt
                    ? new Date(businessDoc.updatedAt)
                    : createdAt;

                const subscriptionEndDate = business.subscriptionEndDate
                    ? new Date(business.subscriptionEndDate)
                    : null;

                // Create a simplified business object with just what we need
                const businessData = {
                    _id: business._id?.toString() || '',
                    name: business.name || '',
                    email: business.email || '',
                    clientId: business.clientId,  // Add the clientId which is required by the Business interface
                    adminUser: adminUser ? {
                        _id: adminUser._id?.toString() || '',
                        name: adminUser.name || '',
                        email: adminUser.email || '',
                        avatar: adminUser.avatar || ''
                    } : undefined
                };

                // Convert to subscription interface with proper typing
                const subscription = {
                    _id: business._id?.toString() || '',
                    clientId: business.clientId?.toString() || '',
                    businessId: business._id?.toString() || '',
                    stripeSubscriptionId: business.stripeSubscriptionId || '',
                    status: business.subscriptionStatus || SubscriptionStatus.CANCELED, // Default if missing
                    currentPeriodStart: createdAt ? createdAt.toISOString() : '',
                    currentPeriodEnd: subscriptionEndDate ? subscriptionEndDate.toISOString() : '',
                    cancelAtPeriodEnd: false, // default as not stored in Business schema
                    productId: business.subscriptionDetails?.planId?.toString() || '',
                    priceId: business.subscriptionDetails?.priceId?.toString() || '',
                    quantity: 1, // Always 1 as specified
                    amount: business.subscriptionDetails?.amount || 0,
                    currency: business.subscriptionDetails?.currency || 'USD',
                    interval: business.subscriptionDetails?.interval || 'month',
                    metadata: business.metadata || {},
                    createdAt: createdAt ? createdAt.toISOString() : '',
                    updatedAt: updatedAt ? updatedAt.toISOString() : '',

                    // Cast to unknown first to satisfy TypeScript's type safety
                    business: businessData as unknown as Business,

                    product: product ? {
                        _id: product._id?.toString() || '',
                        name: product.name || '',
                        description: product.description || ''
                    } : undefined
                };

                return subscription as unknown as Subscription;
            });

            // Calculate overall metrics (totals) with better error handling
            const metrics = await this.calculateSubscriptionMetrics(clientId, filters);

            return {
                items: subscriptions,
                total,
                pages: totalPages,
                page,
                limit,
                metrics,
            };
        } catch (error) {
            this.logger.error(`Error in getSubscriptions: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Helper method to calculate subscription metrics
     */
    private async calculateSubscriptionMetrics(clientId: string, baseFilters: any): Promise<SubscriptionMetrics> {
        try {
            // Basic metrics
            const totalSubscriptions = await this.businessModel.countDocuments(baseFilters);
            const activeSubscriptions = await this.businessModel.countDocuments({
                ...baseFilters,
                subscriptionStatus: SubscriptionStatus.ACTIVE
            });
            const pastDueSubscriptions = await this.businessModel.countDocuments({
                ...baseFilters,
                subscriptionStatus: SubscriptionStatus.PAST_DUE
            });
            const canceledSubscriptions = await this.businessModel.countDocuments({
                ...baseFilters,
                subscriptionStatus: SubscriptionStatus.CANCELED
            });
            const trialingSubscriptions = await this.businessModel.countDocuments({
                ...baseFilters,
                subscriptionStatus: SubscriptionStatus.TRIALING
            });

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

            // Calculate trends
            const now = new Date();
            const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0);

            // Subscriptions Trend
            const currentSubscriptionsCount = await this.businessModel.countDocuments({
                ...baseFilters,
                createdAt: { $gte: startOfCurrentMonth }
            });

            const previousSubscriptionsCount = await this.businessModel.countDocuments({
                ...baseFilters,
                createdAt: { $gte: startOfPreviousMonth, $lte: endOfPreviousMonth }
            });

            const subscriptionsTrendValue = currentSubscriptionsCount - previousSubscriptionsCount;
            const subscriptionsTrendPercentage = previousSubscriptionsCount > 0
                ? (subscriptionsTrendValue / previousSubscriptionsCount) * 100
                : 0;

            // MRR Trend
            const currentMRR = await this.calculateMRRForPeriod(
                baseFilters,
                { $gte: startOfCurrentMonth }
            );

            const previousMRR = await this.calculateMRRForPeriod(
                baseFilters,
                { $gte: startOfPreviousMonth, $lte: endOfPreviousMonth }
            );

            const mrrTrendValue = currentMRR - previousMRR;
            const mrrTrendPercentage = previousMRR > 0 ? (mrrTrendValue / previousMRR) * 100 : 0;

            // Churn Rate Trend
            const churnTrend = await this.calculateChurnTrend(
                baseFilters,
                startOfCurrentMonth,
                startOfPreviousMonth,
                endOfPreviousMonth
            );

            return {
                totalSubscriptions,
                activeSubscriptions,
                pastDueSubscriptions,
                canceledSubscriptions,
                trialingSubscriptions,
                averageMRR,
                totalMRR,
                trends: {
                    subscriptions: {
                        value: subscriptionsTrendValue,
                        percentage: subscriptionsTrendPercentage
                    },
                    mrr: {
                        value: mrrTrendValue,
                        percentage: mrrTrendPercentage
                    },
                    churnRate: churnTrend
                }
            };
        } catch (error) {
            this.logger.error(`Error calculating subscription metrics: ${error.message}`);
            // Return default metrics to prevent complete failure
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
    }

    /**
     * Helper method to calculate MRR for a specific period
     */
    private async calculateMRRForPeriod(baseFilters: any, dateFilter: any): Promise<number> {
        const businesses = await this.businessModel.find({
            ...baseFilters,
            createdAt: dateFilter
        }).select('subscriptionDetails').lean();

        let mrr = 0;
        businesses.forEach(business => {
            const details = business.subscriptionDetails;
            if (details && typeof details.amount === 'number') {
                let monthlyAmount = details.amount;
                if (details.interval === 'year') {
                    monthlyAmount = details.amount / 12;
                }
                mrr += monthlyAmount;
            }
        });

        return mrr;
    }

    /**
     * Helper method to calculate churn trend
     */
    private async calculateChurnTrend(
        baseFilters: any,
        startOfCurrentMonth: Date,
        startOfPreviousMonth: Date,
        endOfPreviousMonth: Date
    ): Promise<{ value: number, percentage: number }> {
        try {
            // For the current month:
            const currentCanceledSubscriptions = await this.businessModel.countDocuments({
                ...baseFilters,
                subscriptionStatus: SubscriptionStatus.CANCELED,
                updatedAt: { $gte: startOfCurrentMonth }
            });

            const currentActiveSubscriptions = await this.businessModel.countDocuments({
                ...baseFilters,
                subscriptionStatus: SubscriptionStatus.ACTIVE,
                createdAt: { $lt: startOfCurrentMonth }
            });

            const currentChurnRate = currentActiveSubscriptions > 0
                ? (currentCanceledSubscriptions / currentActiveSubscriptions) * 100
                : 0;

            // For the previous month:
            const previousCanceledSubscriptions = await this.businessModel.countDocuments({
                ...baseFilters,
                subscriptionStatus: SubscriptionStatus.CANCELED,
                updatedAt: { $gte: startOfPreviousMonth, $lte: endOfPreviousMonth }
            });

            const previousActiveSubscriptions = await this.businessModel.countDocuments({
                ...baseFilters,
                subscriptionStatus: SubscriptionStatus.ACTIVE,
                createdAt: { $lt: startOfPreviousMonth }
            });

            const previousChurnRate = previousActiveSubscriptions > 0
                ? (previousCanceledSubscriptions / previousActiveSubscriptions) * 100
                : 0;

            const churnTrendValue = currentChurnRate - previousChurnRate;
            const churnTrendPercentage = previousChurnRate > 0
                ? (churnTrendValue / previousChurnRate) * 100
                : 0;

            return {
                value: currentChurnRate,
                percentage: churnTrendPercentage
            };
        } catch (error) {
            this.logger.error(`Error calculating churn trend: ${error.message}`);
            return { value: 0, percentage: 0 };
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