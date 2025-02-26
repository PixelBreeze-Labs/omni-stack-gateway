import {HttpException, HttpStatus, Injectable, Logger} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, RegistrationSource } from '../schemas/user.schema';
import { Business, BusinessType } from '../schemas/business.schema';
import { EmailService } from './email.service';
import { BusinessRegistrationDto } from '../dtos/business-registration.dto';
import { VerificationService } from './verification.service';
import { generateRandomPassword } from "../utils/password.utils";
import * as bcrypt from 'bcrypt';
import {SupabaseVbAppService} from "./supabase-vb-app.service";
import {VenueBoostService} from "./venueboost.service";

@Injectable()
export class BusinessRegistrationService {
    private readonly logger = new Logger(BusinessRegistrationService.name);

    constructor(
        @InjectModel(User.name) private userModel: Model<User>,
        @InjectModel(Business.name) private businessModel: Model<Business>,
        private emailService: EmailService,
        private verificationService: VerificationService,
        private supabaseVbAppService: SupabaseVbAppService,
        private venueBoostService: VenueBoostService
    ) {}

    async registerTrialBusiness(registrationData: BusinessRegistrationDto & { clientId: string }) {
        let adminUser = null;

        try {
            const { fullName, businessEmail, businessName, clientId } = registrationData;

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

            // 3. Create Supabase user - SupabaseVbAppService will now throw exceptions instead of returning null
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
            const business = await this.businessModel.create({
                name: businessName,
                clientId,
                adminUserId: adminUser._id,
                userIds: [adminUser._id],
                type: BusinessType.OTHER,
                email: businessEmail,
                subscriptionStatus: 'incomplete',
                isActive: true
            });

            this.logger.log(`Created business with ID: ${business._id}`);

            // 5. Create venue and user in VenueBoost
            try {
                const venueBoostIds = await this.venueBoostService.createVenueUserForStaffluent({
                    first_name: firstName,
                    last_name: lastName,
                    email: businessEmail,
                    password: temporaryPassword,
                    business_name: businessName,
                    supabase_id: supabaseUserId,
                    omnistack_user_id: adminUser._id.toString(),
                    phone_number: '-'
                });

                if (venueBoostIds) {
                    // Update user with VenueBoost IDs
                    await this.userModel.findByIdAndUpdate(
                        adminUser._id,  // Fixed: was using business._id incorrectly
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

            // 6. Create verification token and send email
            const verificationToken = await this.verificationService.createVerificationToken(adminUser._id.toString());

            // 7. Send verification email
            await this.emailService.sendTemplateEmail(
                'Staffluent',
                'staffluent@omnistackhub.xyz',
                businessEmail,
                'Verify Your Email - Staffluent',
                'templates/business/trial-registration.html',
                {
                    businessName,
                    fullName,
                    verificationLink: `https://staffluent.co/verify-email?token=${verificationToken}`
                }
            );

            return {
                success: true,
                message: 'Business registered successfully. Please check your email for verification.',
                businessId: business._id,
                userId: adminUser._id
            };
        } catch (error) {
            // If we created a user but the process failed later, clean up the user
            if (adminUser) {
                try {
                    await this.userModel.findByIdAndDelete(adminUser._id);
                    this.logger.log(`Cleaned up admin user ${adminUser._id} after registration failure`);
                } catch (cleanupError) {
                    this.logger.error(`Failed to clean up user after registration error: ${cleanupError.message}`);
                }
            }

            throw new HttpException(
                error.message || 'Failed to register business',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
}