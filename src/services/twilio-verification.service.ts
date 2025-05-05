// src/services/twilio-verification.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as twilio from 'twilio';
import { VerificationPhone } from '../schemas/verification-phone.schema';
import { UserService } from './user.service';

@Injectable()
export class TwilioVerificationService {
    private readonly client: twilio.Twilio;
    private readonly logger = new Logger(TwilioVerificationService.name);
    private readonly verifyServiceSid: string;
    private readonly verificationExpiryMinutes: number = 10;

    constructor(
        private readonly configService: ConfigService,
        @InjectModel(VerificationPhone.name) private verificationPhoneModel: Model<VerificationPhone>,
        private readonly userService: UserService,
    ) {
        const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
        const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
        this.verifyServiceSid = this.configService.get<string>('TWILIO_VERIFY_SERVICE_SID');

        this.client = twilio(accountSid, authToken);
    }

    async sendVerificationCode(phoneNumber: string, snapfoodUserId: number): Promise<{ success: boolean; messageId?: string; error?: string }> {
        try {
            // Validate that the user exists in our system
            const user = await this.userService.findBySnapfoodId(snapfoodUserId);
            const omniStackUserId = user ? user._id.toString() : undefined;

            // Clear any previous verification attempts for this user/phone
            await this.verificationPhoneModel.updateMany(
                {
                    phoneNumber,
                    snapfoodUserId,
                    status: 'sent'
                },
                {
                    status: 'expired'
                }
            );
            
            // Ensure proper E.164 format
            let formattedPhone = phoneNumber;
            if (!phoneNumber.startsWith('+')) {
                formattedPhone = `+${phoneNumber}`;
            }
            
            // Generate a random 6-digit code
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
            
            // Send the SMS via Messaging Service
            const message = await this.client.messages.create({
                body: `Your SnapFood verification code is: ${verificationCode}`,
                messagingServiceSid: this.verifyServiceSid,
                to: formattedPhone
            });
            
            this.logger.log(`Sent verification code ${verificationCode} to ${formattedPhone} for user ${snapfoodUserId}`);
            
            // Store verification in database
            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + this.verificationExpiryMinutes);

            await this.verificationPhoneModel.create({
                phoneNumber: formattedPhone,
                snapfoodUserId,
                omniStackUserId,
                messageId: message.sid,
                code: verificationCode,
                status: 'sent',
                expiresAt,
                attempts: 0
            });

            return {
                success: true,
                messageId: message.sid
            };
        } catch (error) {
            this.logger.error(`Failed to send verification code to ${phoneNumber}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async verifyCode(phoneNumber: string, code: string): Promise<{ success: boolean; valid: boolean; error?: string }> {
        try {
            // Ensure proper E.164 format
            let formattedPhone = phoneNumber;
            if (!phoneNumber.startsWith('+')) {
                formattedPhone = `+${phoneNumber}`;
            }
            
            // Find the most recent verification for this phone number
            const verification = await this.verificationPhoneModel
                .findOne({ phoneNumber: formattedPhone, status: 'sent' })
                .sort({ createdAt: -1 })
                .exec();

            if (!verification) {
                return {
                    success: false,
                    valid: false,
                    error: 'No pending verification found for this phone number'
                };
            }

            // Check if the verification is expired
            if (new Date() > verification.expiresAt) {
                await verification.updateOne({ status: 'expired' });
                return {
                    success: false,
                    valid: false,
                    error: 'Verification code has expired'
                };
            }

            // Track attempt count
            verification.attempts += 1;
            await verification.updateOne({ attempts: verification.attempts });

            const isValid = verification.code === code;

            // Update verification status
            if (isValid) {
                await verification.updateOne({
                    status: 'verified',
                    verifiedAt: new Date()
                });
            }

            return {
                success: true,
                valid: isValid
            };
        } catch (error) {
            this.logger.error(`Failed to verify code for ${phoneNumber}:`, error);
            return {
                success: false,
                valid: false,
                error: error.message
            };
        }
    }

    async getVerificationStatus(messageId: string): Promise<VerificationPhone> {
        const verification = await this.verificationPhoneModel.findOne({ messageId }).exec();

        if (!verification) {
            throw new NotFoundException(`Verification with ID ${messageId} not found`);
        }

        return verification;
    }
}