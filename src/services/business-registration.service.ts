
// src/services/business-registration.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, RegistrationSource } from '../schemas/user.schema';
import { Business, BusinessType } from '../schemas/business.schema';
import { EmailService } from './email.service';
import { BusinessRegistrationDto } from '../dtos/business-registration.dto';;
import { VerificationService } from './verification.service';
import { generateRandomPassword } from "../utils/password.utils";
import * as bcrypt from 'bcrypt';


@Injectable()
export class BusinessRegistrationService {
    constructor(
        @InjectModel(User.name) private userModel: Model<User>,
        @InjectModel(Business.name) private businessModel: Model<Business>,
        private emailService: EmailService,
        private verificationService: VerificationService
    ) {}

    async registerTrialBusiness(registrationData: BusinessRegistrationDto & { clientId: string }) {
        const { fullName, businessEmail, businessName, clientId } = registrationData;

        // Create admin user first
        const [firstName, ...lastNameParts] = fullName.split(' ');
        const lastName = lastNameParts.join(' ');
        const temporaryPassword = generateRandomPassword(); // From our utils
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

        // Create verification token
        const verificationToken = await this.verificationService.createVerificationToken(adminUser._id.toString());

        // Create business
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

        // Send verification email
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
    }
}