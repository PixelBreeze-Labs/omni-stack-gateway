// src/services/subscription.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Stripe from 'stripe';
import { StripeProduct } from '../schemas/stripe-product.schema';
import { StripePrice } from '../schemas/stripe-price.schema';
import { Client } from '../schemas/client.schema';

@Injectable()
export class SubscriptionService {
    private readonly logger = new Logger(SubscriptionService.name);

    constructor(
        @InjectModel(StripeProduct.name) private productModel: Model<StripeProduct>,
        @InjectModel(StripePrice.name) private priceModel: Model<StripePrice>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
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
            const allProducts = await stripe.products.list({ active: true, limit: 100 });

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
                    { stripeProductId: stripeProduct.id, clientId },
                    {
                        name: stripeProduct.name,
                        description: stripeProduct.description,
                        stripeProductId: stripeProduct.id,
                        clientId,
                        isActive: stripeProduct.active,
                        metadata: stripeProduct.metadata,
                    },
                    { upsert: true, new: true }
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
                        { stripePriceId: stripePrice.id, stripeProductId: product._id },
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
                        { upsert: true, new: true }
                    );
                }

                // Deactivate prices that no longer exist in Stripe
                const activeStripePriceIds = stripePrices.data.map(p => p.id);
                await this.priceModel.updateMany(
                    {
                        stripeProductId: product._id,
                        stripePriceId: { $nin: activeStripePriceIds },
                    },
                    { isActive: false }
                );
            }

            // Deactivate products that no longer exist in Stripe
            const activeStripeProductIds = stripeProducts.map(p => p.id);
            await this.productModel.updateMany(
                {
                    clientId,
                    stripeProductId: { $nin: activeStripeProductIds },
                },
                { isActive: false }
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
        const filters: any = { clientId };

        // Add search filter
        if (query.search) {
            filters.$or = [
                { name: new RegExp(query.search, 'i') },
                { description: new RegExp(query.search, 'i') }
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
            .sort({ createdAt: -1 })
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
            totalProducts: await this.productModel.countDocuments({ clientId }),
            activeProducts: await this.productModel.countDocuments({ clientId, isActive: true }),
            totalPrices: await this.priceModel.countDocuments({ clientId }),
            activePrices: await this.priceModel.countDocuments({ clientId, isActive: true }),
            trends: {
                products: { value: 0, percentage: 5 }, // You could calculate this from historical data
                prices: { value: 0, percentage: 3 }    // You could calculate this from historical data
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
}