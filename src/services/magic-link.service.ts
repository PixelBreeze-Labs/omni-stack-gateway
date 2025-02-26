import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MagicLinkToken } from '../schemas/magic-link-token.schema';
import { User } from '../schemas/user.schema';
import { Business } from '../schemas/business.schema';
import { EmailService } from './email.service';
import { VenueBoostService } from './venueboost.service';
import { MagicLinkResponse } from '../interfaces/magic-link.interface';
import * as crypto from 'crypto';

@Injectable()
export class MagicLinkService {
    private readonly logger = new Logger(MagicLinkService.name);

    constructor(
        @InjectModel(MagicLinkToken.name) private magicLinkTokenModel: Model<MagicLinkToken>,
        @InjectModel(User.name) private userModel: Model<User>,
        @InjectModel(Business.name) private businessModel: Model<Business>,
        private emailService: EmailService,
        private venueBoostService: VenueBoostService
    ) {}

    /**
     * Generate a secure random token for magic links
     */
    private generateToken(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Create a magic link token for a user
     * @param userId User ID
     * @returns Generated token
     */
    async createMagicLinkToken(userId: string): Promise<string> {
        // Delete any existing unused tokens for this user
        await this.magicLinkTokenModel.deleteMany({
            userId,
            used: false
        });

        const token = this.generateToken();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour

        await this.magicLinkTokenModel.create({
            userId,
            token,
            expiresAt,
            used: false
        });

        return token;
    }

    /**
     * Find a user by email and send a magic link
     * @param email User's email address
     * @returns Success status
     */
    async sendMagicLinkByEmail(email: string): Promise<{ success: boolean; message: string }> {
        try {
            // Find user by email
            const user = await this.userModel.findOne({ email });
            if (!user) {
                return {
                    success: false,
                    message: 'No user found with this email address'
                };
            }

            // Find the user's business
            const business = await this.businessModel.findOne({ adminUserId: user._id });

            // Create a magic link token
            const token = await this.createMagicLinkToken(user._id.toString());

            // Determine the business name
            const businessName = business ? business.name : 'Your Business';

            // Build the magic link URL
            const magicLink = `${process.env.WEB_FRONTEND_URL}/magic-login?token=${token}`;

            // Send the email
            await this.emailService.sendTemplateEmail(
                'Staffluent',
                'staffluent@omnistackhub.xyz',
                email,
                'Login to Staffluent',
                'templates/business/magic-link.html',
                {
                    userName: user.name,
                    businessName,
                    magicLink
                }
            );

            return {
                success: true,
                message: 'Magic link sent successfully'
            };
        } catch (error) {
            this.logger.error(`Error sending magic link: ${error.message}`);
            return {
                success: false,
                message: 'Failed to send magic link'
            };
        }
    }

    /**
     * Send a magic link to a user after subscription finalization
     * @param businessId Business ID
     * @param clientId Client ID for validation
     * @returns Success status
     */
    async sendMagicLinkAfterSubscription(
        businessId: string,
        clientId: string
    ): Promise<{ success: boolean; message: string }> {
        try {
            // Find the business and verify it belongs to the client
            const business = await this.businessModel.findOne({
                _id: businessId,
                clientId
            });

            if (!business) {
                return {
                    success: false,
                    message: 'Business not found or does not belong to this client'
                };
            }

            // Find the admin user
            const user = await this.userModel.findById(business.adminUserId);
            if (!user) {
                return {
                    success: false,
                    message: 'Admin user not found'
                };
            }

            // Create a magic link token
            const token = await this.createMagicLinkToken(user._id.toString());

            // Build the magic link URL - customize the path as needed
            const magicLink = `${process.env.WEB_FRONTEND_URL}/subscription-success/login?token=${token}`;

            // Send the email
            await this.emailService.sendTemplateEmail(
                'Staffluent',
                'staffluent@omnistackhub.xyz',
                user.email,
                'Access Your Staffluent Account',
                'templates/business/magic-link.html',
                {
                    userName: user.name,
                    businessName: business.name,
                    magicLink
                }
            );

            return {
                success: true,
                message: 'Magic link sent successfully'
            };
        } catch (error) {
            this.logger.error(`Error sending magic link after subscription: ${error.message}`);
            return {
                success: false,
                message: 'Failed to send magic link'
            };
        }
    }

    /**
     * Verify a magic link token and return authentication data
     * @param token Magic link token
     * @returns Authentication response
     */
    async verifyMagicLink(token: string): Promise<MagicLinkResponse> {
        try {
            // Find the magic link token
            const magicLinkToken = await this.magicLinkTokenModel.findOne({ token });

            // Check if token exists
            if (!magicLinkToken) {
                return {
                    status: 'invalid',
                    message: 'Invalid magic link token'
                };
            }

            // Check if token has been used
            if (magicLinkToken.used) {
                return {
                    status: 'used',
                    message: 'This magic link has already been used'
                };
            }

            // Check if token is expired
            if (magicLinkToken.expiresAt < new Date()) {
                return {
                    status: 'expired',
                    message: 'Magic link has expired'
                };
            }

            // Get the user
            const user = await this.userModel.findById(magicLinkToken.userId);
            if (!user) {
                return {
                    status: 'invalid',
                    message: 'User not found'
                };
            }

            // Find the business associated with the user
            const business = await this.businessModel.findOne({ adminUserId: user._id });

            // Mark the token as used
            await this.magicLinkTokenModel.findByIdAndUpdate(
                magicLinkToken._id,
                { $set: { used: true } }
            );

            // Get VenueBoost authentication data
            let auth_response = null;
            try {
                if (user.external_ids?.supabaseId) {
                    auth_response = await this.venueBoostService.getConnection(
                        user.email,
                        user.external_ids.supabaseId
                    );
                } else {
                    this.logger.warn(`Cannot get VenueBoost connection: No supabaseId found for user ${user._id}`);
                }
            } catch (error) {
                this.logger.error(`Error getting VenueBoost connection: ${error.message}`);
                // Continue even if getting auth response fails
            }

            return {
                status: 'success',
                message: 'Authentication successful',
                userId: user._id.toString(),
                businessId: business?._id.toString(),
                auth_response
            };
        } catch (error) {
            this.logger.error(`Error verifying magic link: ${error.message}`);
            return {
                status: 'invalid',
                message: 'Failed to verify magic link'
            };
        }
    }
}