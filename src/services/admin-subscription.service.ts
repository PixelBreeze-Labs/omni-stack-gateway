import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, RegistrationSource } from '../schemas/user.schema';
import { Business, BusinessType } from '../schemas/business.schema';
import { Address } from '../schemas/address.schema';
import { StripePrice } from '../schemas/stripe-price.schema';
import { Client } from '../schemas/client.schema';
import { EmailService } from './email.service';
import { SupabaseVbAppService } from './supabase-vb-app.service';
import { VenueBoostService } from './venueboost.service';
import { VerificationService } from './verification.service';
import { generateRandomPassword } from '../utils/password.utils';
import * as bcrypt from 'bcrypt';
import Stripe from 'stripe';

interface AdminRegistrationData {
    // Business details
    businessName: string;
    businessEmail: string;
    businessType: string;
    fullName: string;
    phone?: string;

    // Address details (optional)
    address?: {
        street?: string;
        cityId?: string;
        stateId?: string;
        zip?: string;
        countryId?: string;
    };

    // Subscription details
    subscription: {
        planId: string;
        interval: 'month' | 'year';
    };

    // Additional settings
    autoVerifyEmail?: boolean;
    sendWelcomeEmail?: boolean;

    // Client ID (added by controller)
    clientId: string;
}

@Injectable()
export class AdminSubscriptionService {
    private readonly logger = new Logger(AdminSubscriptionService.name);

    constructor(
        @InjectModel(User.name) private userModel: Model<User>,
        @InjectModel(Business.name) private businessModel: Model<Business>,
        @InjectModel(Address.name) private addressModel: Model<Address>,
        @InjectModel(StripePrice.name) private priceModel: Model<StripePrice>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        private emailService: EmailService,
        private supabaseVbAppService: SupabaseVbAppService,
        private venueBoostService: VenueBoostService,
        private verificationService: VerificationService
    ) {}

    /**
     * Creates a Stripe instance for a specific client using their configuration
     */
    private async getStripeInstance(clientId: string): Promise<Stripe> {
        const client = await this.clientModel.findById(clientId)
            .select('+subscriptionConfig.stripeAccount.secretKey');

        if (!client) {
            throw new HttpException('Client not found', HttpStatus.NOT_FOUND);
        }

        const stripeConfig = client.subscriptionConfig?.stripeAccount;
        if (!stripeConfig?.secretKey) {
            throw new HttpException('Stripe configuration not found or incomplete', HttpStatus.BAD_REQUEST);
        }

        return new Stripe(stripeConfig.secretKey, {
            apiVersion: '2025-02-24.acacia',
        });
    }

    /**
     * Register a new business, create a subscription, and optionally auto-verify the email
     */
    async registerAndSubscribeBusiness(data: AdminRegistrationData) {
        let adminUser = null;
        let business = null;
        let address = null;

        try {
            const {
                businessName,
                businessEmail,
                businessType,
                fullName,
                phone,
                address: addressData,
                subscription,
                autoVerifyEmail = true,
                sendWelcomeEmail = true,
                clientId
            } = data;

            // 1. Check if user with email already exists
            const existingUser = await this.userModel.findOne({ email: businessEmail });
            if (existingUser) {
                throw new HttpException('User with this email already exists', HttpStatus.CONFLICT);
            }

            // 2. Create admin user in our system
            const [firstName, ...lastNameParts] = fullName.split(' ');
            const lastName = lastNameParts.join(' ');
            const temporaryPassword = generateRandomPassword();
            const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

            adminUser = await this.userModel.create({
                name: firstName,
                surname: lastName,
                email: businessEmail,
                password: hashedPassword,
                registrationSource: RegistrationSource.STAFFLUENT,
                client_ids: [clientId],
                external_ids: {}, // Explicitly initialize
                isActive: true
            });

            this.logger.log(`Created admin user with ID: ${adminUser._id}`);

            // 3. Create Supabase user
            const supabaseUserId = await this.supabaseVbAppService.createUser(
                businessEmail,
                temporaryPassword,
                {
                    fullName,
                    businessName
                }
            );

            if (supabaseUserId) {
                // Update user with supabaseId
                await this.userModel.findByIdAndUpdate(
                    adminUser._id,
                    {
                        $set: {
                            'external_ids.supabaseId': supabaseUserId,
                        }
                    }
                );
                this.logger.log(`Created Supabase user with ID: ${supabaseUserId}`);
            }

            // 4. Create business
            business = await this.businessModel.create({
                name: businessName,
                clientId,
                adminUserId: adminUser._id,
                userIds: [adminUser._id],
                type: businessType || BusinessType.OTHER,
                email: businessEmail,
                phone: phone || '',
                subscriptionStatus: 'incomplete',
                isActive: true
            });

            this.logger.log(`Created business with ID: ${business._id}`);

            // 5. Create address if provided
            if (addressData && Object.values(addressData).some(val => val)) {
                address = await this.addressModel.create({
                    addressLine1: addressData.street || '',
                    cityId: addressData.cityId || null,
                    stateId: addressData.stateId || null,
                    countryId: addressData.countryId || null,
                    zip: addressData.zip || '',
                    businessId: business._id,
                    clientId
                });

                // Link address to business
                await this.businessModel.updateOne(
                    { _id: business._id },
                    { $set: { addressId: address._id } }
                );

                this.logger.log(`Created address for business: ${business._id}`);
            }

            // 6. Create venue and user in VenueBoost
            try {
                const venueBoostIds = await this.venueBoostService.createVenueUserForStaffluent({
                    first_name: firstName,
                    last_name: lastName,
                    email: businessEmail,
                    password: temporaryPassword,
                    business_name: businessName,
                    supabase_id: supabaseUserId,
                    omnistack_user_id: adminUser._id.toString(),
                    phone_number: phone || '-'
                });

                if (venueBoostIds) {
                    // Update user with VenueBoost IDs
                    await this.userModel.findByIdAndUpdate(
                        adminUser._id,
                        {
                            $set: {
                                'external_ids.venueBoostId': venueBoostIds.userId,
                            }
                        }
                    );
                    this.logger.log(`Updated user with VenueBoost IDs`);
                }
            } catch (error) {
                // Log the error but continue - VenueBoost integration is not critical
                this.logger.error(`VenueBoost integration failed: ${error.message}`);
            }

            // 7. Create subscription with Stripe
            const stripe = await this.getStripeInstance(clientId);

            // Get price for the requested plan
            const price = await this.priceModel.findOne({
                clientId,
                stripePriceId: subscription.planId,
                interval: subscription.interval
            });

            if (!price) {
                throw new HttpException('Price not found for the selected plan', HttpStatus.NOT_FOUND);
            }

            // Create Stripe customer
            const customer = await stripe.customers.create({
                email: businessEmail,
                name: businessName,
                metadata: {
                    businessId: business._id.toString(),
                    clientId
                }
            });

            // Update business with Stripe customer ID
            await this.businessModel.updateOne(
                { _id: business._id },
                { $set: { stripeCustomerId: customer.id } }
            );

            // Create subscription directly (no checkout session)
            const stripeSubscription = await stripe.subscriptions.create({
                customer: customer.id,
                items: [
                    {
                        price: price.stripePriceId,
                        quantity: 1,
                    },
                ],
                metadata: {
                    businessId: business._id.toString(),
                    clientId,
                    planId: subscription.planId,
                    interval: subscription.interval
                }
            });

            // Update business with subscription details
            await this.businessModel.updateOne(
                { _id: business._id },
                {
                    $set: {
                        stripeSubscriptionId: stripeSubscription.id,
                        subscriptionStatus: stripeSubscription.status,
                        subscriptionEndDate: new Date(stripeSubscription.current_period_end * 1000),
                        subscriptionDetails: {
                            planId: subscription.planId,
                            priceId: stripeSubscription.items.data[0].price.id,
                            interval: subscription.interval,
                            amount: stripeSubscription.items.data[0].price.unit_amount,
                            currency: stripeSubscription.items.data[0].price.currency.toUpperCase()
                        }
                    }
                }
            );

            this.logger.log(`Created subscription for business: ${business._id}`);

            // 8. Auto-verify email if requested
            if (autoVerifyEmail) {
                // Create verification token
                const verificationToken = await this.verificationService.createVerificationToken(adminUser._id.toString());

                // Update user metadata to mark as verified
                await this.userModel.findByIdAndUpdate(
                    adminUser._id,
                    {
                        $set: {
                            'metadata.email_verified': 'true',
                            'metadata.email_verified_at': new Date().toISOString(),
                            'metadata.verification_token': verificationToken
                        }
                    }
                );

                this.logger.log(`Auto-verified email for user: ${adminUser._id}`);
            }

            // 9. Send welcome email if requested
            if (sendWelcomeEmail) {
                await this.emailService.sendTemplateEmail(
                    'Staffluent',
                    'staffluent@omnistackhub.xyz',
                    businessEmail,
                    'Welcome to Staffluent',
                    'templates/business/admin-welcome.html',
                    {
                        businessName,
                        fullName,
                        temporaryPassword,
                        loginLink: `${process.env.FRONTEND_URL}/login`
                    }
                );

                this.logger.log(`Sent welcome email to: ${businessEmail}`);
            }

            // 10. Get VenueBoost authentication data
            let auth_response = null;
            try {
                if (supabaseUserId) {
                    auth_response = await this.venueBoostService.getConnection(
                        businessEmail,
                        supabaseUserId
                    );
                }
            } catch (error) {
                this.logger.error(`Error getting VenueBoost connection: ${error.message}`);
            }

            return {
                success: true,
                message: 'Business registered and subscribed successfully',
                businessId: business._id,
                userId: adminUser._id,
                email: businessEmail,
                password: temporaryPassword, // Return the generated password
                subscription: {
                    id: stripeSubscription.id,
                    status: stripeSubscription.status
                },
                auth_response
            };
        } catch (error) {
            // Clean up created resources on failure
            await this.cleanupOnFailure(adminUser, business, address);

            throw new HttpException(
                error.message || 'Failed to register and subscribe business',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Clean up resources if registration fails
     */
    private async cleanupOnFailure(user: any, business: any, address: any) {
        try {
            if (address) {
                await this.addressModel.findByIdAndDelete(address._id);
                this.logger.log(`Cleaned up address ${address._id}`);
            }

            if (business) {
                await this.businessModel.findByIdAndDelete(business._id);
                this.logger.log(`Cleaned up business ${business._id}`);
            }

            if (user) {
                await this.userModel.findByIdAndDelete(user._id);
                this.logger.log(`Cleaned up admin user ${user._id}`);
            }
        } catch (error) {
            this.logger.error(`Error cleaning up resources: ${error.message}`);
        }
    }
}