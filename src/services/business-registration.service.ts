
// src/services/business-registration.service.ts
import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, RegistrationSource } from '../schemas/user.schema';
import { Business, BusinessType } from '../schemas/business.schema';
import { EmailService } from './email.service';
import { BusinessRegistrationDto } from '../dtos/business-registration.dto';;
import { VerificationService } from './verification.service';
import { generateRandomPassword } from "../utils/password.utils";
import * as bcrypt from 'bcrypt';
import {SupabaseVbAppService} from "./supabase-vb-app.service";
import {VenueBoostService} from "./venueboost.service";


@Injectable()
export class BusinessRegistrationService {
    constructor(
        @InjectModel(User.name) private userModel: Model<User>,
        @InjectModel(Business.name) private businessModel: Model<Business>,
        private emailService: EmailService,
        private verificationService: VerificationService,
        private supabaseVbAppService: SupabaseVbAppService,
        private venueBoostService: VenueBoostService
    ) {}

    async registerTrialBusiness(registrationData: BusinessRegistrationDto & { clientId: string }) {
        try {
            const { fullName, businessEmail, businessName, clientId } = registrationData;

            // 1. Create admin user in our system
            const [firstName, ...lastNameParts] = fullName.split(' ');
            const lastName = lastNameParts.join(' ');
            const temporaryPassword = generateRandomPassword();
            const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

            const adminUser = await this.userModel.create({
                name: firstName,
                surname: lastName,
                email: businessEmail,
                password: hashedPassword,
                registrationSource: RegistrationSource.STAFFLUENT,
                client_ids: [clientId],
                isActive: true
            });

            // 2. Create Supabase user

            const supabaseUserId = await this.supabaseVbAppService.createUser(
                businessEmail,
                temporaryPassword,
                {
                    fullName,
                    businessName
                }
            );

            if (!supabaseUserId) {
                throw new HttpException('Failed to create Supabase user', HttpStatus.INTERNAL_SERVER_ERROR);
            }

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

            // 4. Create venue and user in VenueBoost
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
                    // Update usere with VenueBoost IDs
                    await this.userModel.findByIdAndUpdate(
                        business._id,
                        {
                            $set: {
                                'externalIds.venueBoostUserId': venueBoostIds.userId,
                            }
                        }
                    );
                }
            } catch (error) {
                // Do nothing
                // if VenueBoost integration fails

            }

            // 5. Create verification token and send email
            const verificationToken = await this.verificationService.createVerificationToken(adminUser._id.toString());

            // 6. Send verification email

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
            throw new HttpException(
                error.message || 'Failed to register business',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
}