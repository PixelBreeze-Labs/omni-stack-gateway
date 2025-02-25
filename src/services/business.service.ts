// src/services/business.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business } from '../schemas/business.schema';
import { Address } from '../schemas/address.schema';
import { StripePrice } from '../schemas/stripe-price.schema';
import { Client } from '../schemas/client.schema';
import Stripe from 'stripe';

@Injectable()
export class BusinessService {
    private readonly logger = new Logger(BusinessService.name);

    constructor(
        @InjectModel(Business.name) private businessModel: Model<Business>,
        @InjectModel(Address.name) private addressModel: Model<Address>,
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

    async updateBusinessAndSubscribe(
        clientId: string,
        businessId: string,
        subscriptionData: {
            businessDetails?: {
                businessType?: string;
                phone?: string;
                address?: {
                    street?: string;
                    city?: string;
                    state?: string;
                    zip?: string;
                    country?: string;
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

                    if (addressId) {
                        // Update existing address
                        await this.addressModel.updateOne(
                            { _id: addressId },
                            { $set: businessDetails.address }
                        );
                    } else {
                        // Create new address
                        const newAddress = await this.addressModel.create({
                            ...businessDetails.address,
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

    async finalizeSubscription(sessionId: string) {
        try {
            // Get session ID from query params
            if (!sessionId) {
                throw new BadRequestException('Session ID is required');
            }

            // Initialize generic Stripe to retrieve session
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
                apiVersion: '2025-02-24.acacia',
            });

            // Retrieve session first to get client ID
            const session = await stripe.checkout.sessions.retrieve(sessionId, {
                expand: ['subscription']
            });

            if (!session || !session.metadata || !session.metadata.clientId || !session.metadata.businessId) {
                throw new BadRequestException('Invalid session');
            }

            const clientId = session.metadata.clientId;
            const businessId = session.metadata.businessId;

            // Initialize Stripe with client's API key for further operations
            const clientStripe = await this.getStripeInstance(clientId);

            // Verify the session is complete
            if (session.status !== 'complete') {
                throw new BadRequestException('Payment not completed');
            }

            // Get subscription info
            const subscriptionId = session.subscription as string;
            const subscription = await clientStripe.subscriptions.retrieve(subscriptionId);

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

            return {
                success: true,
                message: 'Subscription activated successfully',
                businessId,
                status: subscription.status
            };
        } catch (error) {
            this.logger.error(`Error finalizing subscription: ${error.message}`);
            throw error;
        }
    }
}