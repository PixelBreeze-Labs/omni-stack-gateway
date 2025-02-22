// src/services/verification.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VerificationToken } from '../schemas/verification-token.schema';
import { User } from '../schemas/user.schema';
import { generateVerificationToken } from '../utils/token.utils';

interface VerificationResponse {
    status: 'success' | 'already_verified' | 'expired' | 'invalid';
    message: string;
    userId?: string;
}

@Injectable()
export class VerificationService {
    constructor(
        @InjectModel(VerificationToken.name) private verificationTokenModel: Model<VerificationToken>,
        @InjectModel(User.name) private userModel: Model<User>
    ) {}

    async createVerificationToken(userId: string): Promise<string> {
        // Delete any existing tokens for this user
        await this.verificationTokenModel.deleteMany({ userId });

        const token = generateVerificationToken();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // Token expires in 24 hours

        await this.verificationTokenModel.create({
            userId,
            token,
            expiresAt
        });

        return token;
    }

    async verifyEmail(token: string): Promise<VerificationResponse> {
        const verificationToken = await this.verificationTokenModel.findOne({ token });

        // Check if token exists
        if (!verificationToken) {
            // Check if user is already verified
            const user = await this.userModel.findOne({
                metadata: { email_verified: 'true' }
            });

            if (user) {
                return {
                    status: 'already_verified',
                    message: 'This email has already been verified.',
                    userId: user._id.toString()
                };
            }

            return {
                status: 'invalid',
                message: 'Invalid verification token.'
            };
        }

        // Check if token is expired
        if (verificationToken.expiresAt < new Date()) {
            await this.verificationTokenModel.deleteOne({ _id: verificationToken._id });
            return {
                status: 'expired',
                message: 'Verification token has expired.'
            };
        }

        // Get user and verify
        const user = await this.userModel.findById(verificationToken.userId);
        if (!user) {
            await this.verificationTokenModel.deleteOne({ _id: verificationToken._id });
            return {
                status: 'invalid',
                message: 'User not found.'
            };
        }

        // Check if already verified
        const metadata = new Map(user.metadata);
        if (metadata.get('email_verified') === 'true') {
            return {
                status: 'already_verified',
                message: 'This email has already been verified.',
                userId: user._id.toString()
            };
        }

        // Update verification status
        metadata.set('email_verified', 'true');
        metadata.set('email_verified_at', new Date().toISOString());

        await user.updateOne({ metadata });

        // Delete the used token
        await this.verificationTokenModel.deleteOne({ _id: verificationToken._id });

        return {
            status: 'success',
            message: 'Email verified successfully.',
            userId: user._id.toString()
        };
    }

}