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

    /**
     * Helper method to calculate subscription metrics directly from the allBusinesses array
     */
    private calculateMetricsFromSubscriptions(subscriptions: Subscription[]): SubscriptionMetrics {
        console.log(`Calculating metrics from ${subscriptions.length} subscription objects`);

        const totalSubscriptions = subscriptions.length;
        let activeSubscriptions = 0;
        let pastDueSubscriptions = 0;
        let canceledSubscriptions = 0;
        let trialingSubscriptions = 0;

        subscriptions.forEach(sub => {
            // Use toLowerCase() to compare in a case-insensitive way
            const status = sub.status.toLowerCase();
            if (status === 'active') {
                activeSubscriptions++;
            } else if (status === 'past_due') {
                pastDueSubscriptions++;
            } else if (status === 'canceled') {
                canceledSubscriptions++;
            } else if (status === 'trialing') {
                trialingSubscriptions++;
            }
        });

        // Calculate total MRR; convert yearly amounts to monthly
        // For calculateMetricsFromSubscriptions:
        let totalMRR = subscriptions.reduce((sum, sub) => {
            // Only include active subscriptions in MRR calculation
            if (sub.status.toLowerCase() !== 'active') {
                return sum;
            }

            let monthlyAmount = sub.amount;
            if (sub.interval.toLowerCase() === 'year') {
                monthlyAmount = sub.amount / 12;
            }
            return sum + monthlyAmount;
        }, 0);
        const averageMRR = totalSubscriptions > 0 ? totalMRR / totalSubscriptions : 0;

        // Calculate trends based on createdAt dates
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const currentMonthSubs = subscriptions.filter(sub => {
            try {
                const d = new Date(sub.createdAt);
                return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            } catch (e) {
                return false;
            }
        });
        const previousMonthSubs = subscriptions.filter(sub => {
            try {
                const d = new Date(sub.createdAt);
                const targetMonth = currentMonth === 0 ? 11 : currentMonth - 1;
                const targetYear = currentMonth === 0 ? currentYear - 1 : currentYear;
                return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
            } catch (e) {
                return false;
            }
        });

        const subscriptionTrendValue = currentMonthSubs.length - previousMonthSubs.length;
        const subscriptionTrendPercentage = previousMonthSubs.length > 0
            ? (subscriptionTrendValue / previousMonthSubs.length) * 100
            : (currentMonthSubs.length > 0 ? 100 : 0);

        const currentMonthMRR = currentMonthSubs.reduce((sum, sub) => {
            let monthly = sub.amount;
            if (sub.interval.toLowerCase() === 'year') {
                monthly = sub.amount / 12;
            }
            return sum + monthly;
        }, 0);
        const previousMonthMRR = previousMonthSubs.reduce((sum, sub) => {
            let monthly = sub.amount;
            if (sub.interval.toLowerCase() === 'year') {
                monthly = sub.amount / 12;
            }
            return sum + monthly;
        }, 0);

        const mrrTrendValue = currentMonthMRR - previousMonthMRR;
        const mrrTrendPercentage = previousMonthMRR > 0
            ? (mrrTrendValue / previousMonthMRR) * 100
            : (currentMonthMRR > 0 ? 100 : 0);

        // Calculate churn rate (percentage of canceled subscriptions)
        const churnRate = totalSubscriptions > 0 ? (canceledSubscriptions / totalSubscriptions) * 100 : 0;

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
                    value: subscriptionTrendValue,
                    percentage: subscriptionTrendPercentage
                },
                mrr: {
                    value: mrrTrendValue,
                    percentage: mrrTrendPercentage
                },
                churnRate: {
                    value: churnRate,
                    percentage: 0  // No historical churn data to compare against for now
                }
            }
        };
    }
    /**
     * Get all subscriptions with populated business and product data
     */
    async getSubscriptions(clientId: string, query: SubscriptionParams = {}): Promise<SubscriptionsResponse> {
        try {
            console.log('Starting getSubscriptions with clientId:', clientId);

            // Prepare filters: only include businesses that have a Stripe subscription
            const filters: any = {clientId, stripeSubscriptionId: {$exists: true, $ne: null}};

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
                    {name: {$regex: query.search, $options: 'i'}},
                    {email: {$regex: query.search, $options: 'i'}}
                ];
            }

            console.log('Filters:', JSON.stringify(filters));

            // Pagination setup
            const page = query.page ? Number(query.page) : 1;
            const limit = query.limit ? Number(query.limit) : 10;
            const skip = (page - 1) * limit;

            // Get total count
            let total = 0;
            try {
                total = await this.businessModel.countDocuments(filters);
                console.log('Total documents count:', total);
            } catch (countError) {
                console.error('Error counting documents:', countError);
                throw new Error(`Error counting documents: ${countError.message}`);
            }

            const totalPages = Math.ceil(total / limit);

            // Fetch businesses
            let businesses = [];
            try {
                businesses = await this.businessModel.find(filters)
                    .sort({createdAt: -1})
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
                    metrics: {
                        totalSubscriptions: 0,
                        activeSubscriptions: 0,
                        pastDueSubscriptions: 0,
                        canceledSubscriptions: 0,
                        trialingSubscriptions: 0,
                        averageMRR: 0,
                        totalMRR: 0,
                        trends: {
                            subscriptions: {value: 0, percentage: 0},
                            mrr: {value: 0, percentage: 0},
                            churnRate: {value: 0, percentage: 0}
                        }
                    }
                };
            }

            // Get admin users for each business
            let adminUsers = [];
            try {
                // Extract admin user IDs from businesses
                const adminUserIds = businesses
                    .map((b: any) => b.adminUserId)
                    .filter((id: any) => id != null);

                console.log(`Found ${adminUserIds.length} admin user IDs`);

                if (adminUserIds.length > 0) {
                    adminUsers = await this.userModel.find({_id: {$in: adminUserIds}}).lean();
                    console.log(`Found ${adminUsers.length} admin users`);
                }
            } catch (error) {
                console.error('Error fetching admin users:', error);
                // Continue without admin users
            }

            // Create map for easier lookup
            const adminUserMap: { [key: string]: any } = {};
            for (const user of adminUsers) {
                if (user && user._id) {
                    adminUserMap[user._id.toString()] = user;
                }
            }

            // Fetch products for the businesses
            let products = [];
            try {
                // Extract product IDs from businesses
                const productIds = businesses
                    .map((b: any) => b.subscriptionDetails?.planId)
                    .filter((id: any) => id != null);

                console.log(`Found ${productIds.length} product IDs`);

                if (productIds.length > 0) {
                    products = await this.productModel.find({_id: {$in: productIds}}).lean();
                    console.log(`Found ${products.length} products`);
                }
            } catch (error) {
                console.error('Error fetching products:', error);
                // Continue without products
            }

            // Create map for easier lookup
            const productMap: { [key: string]: any } = {};
            for (const product of products) {
                if (product && product._id) {
                    productMap[product._id.toString()] = product;
                }
            }

            // Map businesses to subscription objects
            const subscriptions: any[] = [];

            for (const business of businesses) {
                try {
                    // Get admin user if available
                    let adminUser = null;
                    if (business.adminUserId) {
                        const adminUserId = business.adminUserId.toString();
                        adminUser = adminUserMap[adminUserId];
                    }

                    // Get product if available
                    let product = null;
                    if (business.subscriptionDetails?.planId) {
                        const planId = business.subscriptionDetails.planId.toString();
                        product = productMap[planId];
                    }

                    // Create a simplified business object
                    const businessData = {
                        _id: business._id?.toString() || '',
                        name: business.name || '',
                        email: business.email || '',
                        clientId: business.clientId,
                        adminUser: adminUser ? {
                            _id: adminUser._id?.toString() || '',
                            // Combine name and surname if surname exists
                            name: adminUser.surname
                                ? `${adminUser.name || ''} ${adminUser.surname}`.trim()
                                : (adminUser.name || ''),
                            email: adminUser.email || '',
                            avatar: adminUser.avatar || ''
                        } : undefined
                    };

                    // All timestamps default to now if they can't be accessed
                    const now = new Date();

                    // Built the subscription object
                    const subscription = {
                        _id: business._id?.toString() || '',
                        clientId: business.clientId?.toString() || '',
                        businessId: business._id?.toString() || '',
                        stripeSubscriptionId: business.stripeSubscriptionId || '',
                        status: business.subscriptionStatus || SubscriptionStatus.CANCELED,
                        currentPeriodStart: business.createdAt || now.toISOString(),
                        currentPeriodEnd: business.subscriptionEndDate || now.toISOString(),
                        cancelAtPeriodEnd: false,
                        productId: business.subscriptionDetails?.planId?.toString() || '',
                        priceId: business.subscriptionDetails?.priceId?.toString() || '',
                        quantity: 1,
                        amount: business.subscriptionDetails?.amount || 0,
                        currency: business.subscriptionDetails?.currency || 'USD',
                        interval: business.subscriptionDetails?.interval || 'month',
                        metadata: business.metadata || {},
                        createdAt: business.createdAt || now.toISOString(),
                        updatedAt: business.updatedAt || now.toISOString(),
                        business: businessData,
                        product: product ? {
                            _id: product._id?.toString() || '',
                            name: product.name || '',
                            description: product.description || ''
                        } : undefined
                    };

                    subscriptions.push(subscription);
                } catch (e) {
                    console.error('Error processing business', e);
                    // Continue to next business
                }
            }

            // Calculate metrics from the final subscription objects we just created
            // instead of trying to calculate from raw database objects
            const metrics = this.calculateMetricsFromSubscriptions(subscriptions);

            return {
                items: subscriptions,
                total,
                pages: totalPages,
                page,
                limit,
                metrics,
            };
        } catch (error) {
            console.error('Fatal error in getSubscriptions:', error);
            throw error;
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
     * Helper method to calculate subscription metrics with dynamic trends
     */
    private async calculateSubscriptionMetrics(clientId: string, baseFilters: any): Promise<SubscriptionMetrics> {
        try {
            console.log('Calculating subscription metrics');

            // Get all businesses with subscriptions for metrics calculation
            const allBusinesses = await this.businessModel.find(baseFilters).lean() as any[];
            console.log(`Found ${allBusinesses.length} businesses for metrics calculation`);

            // Count by directly iterating through businesses
            let totalSubscriptions = allBusinesses.length;
            let activeSubscriptions = 0;
            let pastDueSubscriptions = 0;
            let canceledSubscriptions = 0;
            let trialingSubscriptions = 10;

            // Count by status
            allBusinesses.forEach(business => {
                const status = business.subscriptionStatus;

                if (status === SubscriptionStatus.ACTIVE) {
                    activeSubscriptions++;
                } else if (status === SubscriptionStatus.PAST_DUE) {
                    pastDueSubscriptions++;
                } else if (status === SubscriptionStatus.CANCELED) {
                    canceledSubscriptions++;
                } else if (status === SubscriptionStatus.TRIALING) {
                    trialingSubscriptions++;
                }
            });

            // Calculate MRR
            let totalMRR = 0;
            allBusinesses.forEach(business => {
                // Skip if not active
                if (business.subscriptionStatus !== SubscriptionStatus.ACTIVE) {
                    return;
                }

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

            // Calculate dynamic trends using type-safe methods
            const now = new Date();

            // First, get creation dates for all businesses in a type-safe way
            const businessesWithDates = allBusinesses.map(b => {
                // Extract date from _id (MongoDB ObjectId has creation timestamp in first 4 bytes)
                let dateValue;

                try {
                    // Try to extract date directly from ObjectId string
                    if (b._id && typeof b._id === 'object' && b._id.toString) {
                        const idString = b._id.toString();
                        // Extract timestamp from ObjectId
                        if (idString.length >= 24) {
                            const timestamp = parseInt(idString.substring(0, 8), 16) * 1000;
                            dateValue = new Date(timestamp);
                        }
                    }
                } catch (e) {
                    console.error('Error extracting date from _id:', e);
                }

                // If we couldn't get a date, use current date as fallback
                if (!dateValue || isNaN(dateValue.getTime())) {
                    dateValue = now;
                }

                return {
                    ...b,
                    extractedDate: dateValue
                };
            });

            // Set up date ranges for this month and last month
            const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0);

            // Count by month (using our extracted dates)
            const currentMonthBusinesses = businessesWithDates.filter(b =>
                b.extractedDate >= startOfCurrentMonth
            );

            const previousMonthBusinesses = businessesWithDates.filter(b =>
                b.extractedDate >= startOfPreviousMonth && b.extractedDate < startOfCurrentMonth
            );

            // Current month metrics
            const currentMonthCount = currentMonthBusinesses.length;

            // Previous month metrics
            const previousMonthCount = previousMonthBusinesses.length;

            // Calculate subscription trend
            const subscriptionTrendValue = currentMonthCount - previousMonthCount;
            const subscriptionTrendPercentage = previousMonthCount > 0
                ? (subscriptionTrendValue / previousMonthCount) * 100
                : (currentMonthCount > 0 ? 100 : 0);

            // Calculate MRR trend
            let currentMonthMRR = 0;
            currentMonthBusinesses.forEach(business => {
                const details = business.subscriptionDetails;
                if (details && typeof details.amount === 'number') {
                    let monthlyAmount = details.amount;
                    if (details.interval === 'year') {
                        monthlyAmount = details.amount / 12;
                    }
                    currentMonthMRR += monthlyAmount;
                }
            });

            let previousMonthMRR = 0;
            previousMonthBusinesses.forEach(business => {
                const details = business.subscriptionDetails;
                if (details && typeof details.amount === 'number') {
                    let monthlyAmount = details.amount;
                    if (details.interval === 'year') {
                        monthlyAmount = details.amount / 12;
                    }
                    previousMonthMRR += monthlyAmount;
                }
            });

            const mrrTrendValue = currentMonthMRR - previousMonthMRR;
            const mrrTrendPercentage = previousMonthMRR > 0
                ? (mrrTrendValue / previousMonthMRR) * 100
                : (currentMonthMRR > 0 ? 100 : 0);

            // Calculate churn rate (canceled vs. total)
            const churnRate = totalSubscriptions > 0
                ? (canceledSubscriptions / totalSubscriptions) * 100
                : 0;

            // For churn trend, compare to industry average (arbitrary)
            const churnTrendValue = churnRate;
            const churnTrendPercentage = churnRate > 0 ? 0 : 100; // Lower is better

            // Return actual, calculated metrics
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
                        value: subscriptionTrendValue,
                        percentage: subscriptionTrendPercentage
                    },
                    mrr: {
                        value: mrrTrendValue,
                        percentage: mrrTrendPercentage
                    },
                    churnRate: {
                        value: churnRate,
                        percentage: churnTrendPercentage
                    }
                }
            };
        } catch (error) {
            console.error('Error calculating subscription metrics:', error);
            throw error;

            // Return empty metrics instead of throwing
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
     * Get active subscriptions
     */
    async getActiveSubscriptions(clientId: string, params: Omit<SubscriptionParams, 'status'> = {}): Promise<SubscriptionsResponse> {
        // Get active subscriptions
        const activeResults = await this.getSubscriptions(clientId, { ...params, status: SubscriptionStatus.ACTIVE });
        // Get trialing subscriptions
        const trialingResults = await this.getSubscriptions(clientId, { ...params, status: SubscriptionStatus.TRIALING });

        // Combine the subscription items from both queries
        const combinedSubscriptions = [...activeResults.items, ...trialingResults.items];

        // Recalculate metrics based on the combined list
        const combinedMetrics = this.calculateMetricsFromSubscriptions(combinedSubscriptions);

        // Determine pagination values based on the combined list
        const total = combinedSubscriptions.length;
        const limit = params.limit ? Number(params.limit) : 10;
        const pages = Math.ceil(total / limit);
        const page = params.page ? Number(params.page) : 1;

        return {
            items: combinedSubscriptions,
            total,
            pages,
            page,
            limit,
            metrics: combinedMetrics
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