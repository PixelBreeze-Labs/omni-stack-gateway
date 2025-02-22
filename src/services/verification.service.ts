// src/services/verification.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VerificationToken } from '../schemas/verification-token.schema';
import { User } from '../schemas/user.schema';
import { generateVerificationToken } from '../utils/token.utils';

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

    async verifyEmail(token: string): Promise<{ userId: string }> {
        const verificationToken = await this.verificationTokenModel.findOne({ token });

        if (!verificationToken) {
            throw new NotFoundException('Invalid or expired verification token');
        }

        if (verificationToken.expiresAt < new Date()) {
            await this.verificationTokenModel.deleteOne({ _id: verificationToken._id });
            throw new BadRequestException('Verification token has expired');
        }

        // Get the user and update verification status
        const user = await this.userModel.findById(verificationToken.userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Add email_verified field to metadata if it doesn't exist
        const metadata = new Map(user.metadata);
        metadata.set('email_verified', 'true');
        metadata.set('email_verified_at', new Date().toISOString());

        await user.updateOne({ metadata });

        // Delete the used token
        await this.verificationTokenModel.deleteOne({ _id: verificationToken._id });

        return { userId: user._id.toString() };
    }
}