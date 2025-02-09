import {BadRequestException, forwardRef, Inject, Injectable} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../schemas/user.schema';
import { CreateUserDto } from '../dtos/user.dto';
import * as bcrypt from 'bcrypt';
import { Store } from "../schemas/store.schema";
import { Client } from "../schemas/client.schema";
import * as crypto from 'crypto';
import {WalletService} from "./wallet.service";
import {CustomerService} from "./customer.service";

@Injectable()
export class UserService {
    constructor(
        @InjectModel(User.name) private userModel: Model<User>,
        @InjectModel(Store.name) private storeModel: Model<Store>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        private walletService: WalletService,
        @Inject(forwardRef(() => CustomerService))
        private customerService: CustomerService
) {}

    private generateReferralCode(): string {
        return crypto.randomBytes(6).toString('hex').toUpperCase();
    }
    
    async create(createUserDto: CreateUserDto & { client_ids: string[] }) {
        const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
        const user = new this.userModel({
            ...createUserDto,
            password: hashedPassword
        });
        return user.save();
    }

    async findByClientId(clientId: string) {
        return this.userModel.find({
            client_ids: clientId
        }).select('-password');
    }

    async findById(id: string) {
        return this.userModel.findById(id).select('-password').exec();
    }

    async findByEmail(email: string) {
        return this.userModel.findOne({ email }).exec();
    }


    async findByEmailForStore(email: string) {
        return this.userModel.findOne({ email })
            .populate('primaryStoreId')
            .exec();
    }

    async delete(id: string) {
        // First, remove user ID from any stores that reference it
        await this.storeModel.updateMany(
            { userIds: id },
            { $pull: { userIds: id } }
        );

        // Then delete the user
        return this.userModel.findByIdAndDelete(id).exec();
    }

    async registerUser(createUserDto: CreateUserDto & { client_ids: string[] }) {
        // Check referral code if provided
        let referredByUser = null;
        if (createUserDto.referralCode) {
            referredByUser = await this.userModel.findOne({
                referralCode: createUserDto.referralCode,
                referralsRemaining: { $gt: 0 }
            });

            if (!referredByUser) {
                throw new BadRequestException('Invalid or expired referral code');
            }
        }

        const referralCode = this.generateReferralCode();
        const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

        // Find client and its loyalty program
        const client = await this.clientModel.findById(createUserDto.client_ids[0])
            .select('loyaltyProgram defaultCurrency');

        if (!client) {
            throw new BadRequestException('Client not found');
        }

        // Determine initial tier if loyalty program exists
        let initialClientTiers = new Map<string, string>();
        if (client?.loyaltyProgram?.membershipTiers?.length > 0) {
            const initialTier = client.loyaltyProgram.membershipTiers[0];
            initialClientTiers.set(client._id.toString(), initialTier.name);
        }

        // Create user
        const user = new this.userModel({
            ...createUserDto,
            password: hashedPassword,
            referralCode,
            clientTiers: initialClientTiers,
            points: 0
        });

        // Handle referral logic...
        if (referredByUser) {
            user.referredBy = referredByUser._id;
            await this.userModel.updateOne(
                { _id: referredByUser._id },
                {
                    $push: { referrals: user._id },
                    $inc: { referralsRemaining: -1 }
                }
            );

            if (client?.loyaltyProgram?.membershipTiers?.length > 0) {
                const referrerTier = client.loyaltyProgram.membershipTiers
                    .find(tier => tier.name === initialClientTiers.get(client._id.toString()));

                if (referrerTier) {
                    await this.userModel.updateOne(
                        { _id: referredByUser._id },
                        { $inc: { points: referrerTier.referralPoints } }
                    );
                }
            }
        }

        // Save user first
        const savedUser = await user.save();

        // Handle signup bonus for points
        if (client?.loyaltyProgram?.pointsSystem?.earningPoints?.signUpBonus) {
            const signUpBonus = client.loyaltyProgram.pointsSystem.earningPoints.signUpBonus;

            // Update points
            await this.userModel.updateOne(
                { _id: savedUser._id },
                { $inc: { points: signUpBonus } }
            );
        }

        // Create wallet
        const wallet = await this.walletService.findOrCreateWallet(
            savedUser._id.toString(),
            client._id.toString(),
            client.defaultCurrency || 'EUR'
        );

        // Update user with wallet ID
        await this.userModel.updateOne(
            { _id: savedUser._id },
            { walletId: wallet._id }
        );

        // Add wallet credit for signup bonus if applicable
        if (client?.loyaltyProgram?.pointsSystem?.earningPoints?.signUpBonus) {
            const signUpBonus = client.loyaltyProgram.pointsSystem.earningPoints.signUpBonus;

            await this.walletService.addCredit(
                wallet._id.toString(),
                signUpBonus,
                {
                    description: 'Sign up bonus points awarded',
                    source: 'reward',
                    metadata: {
                        reason: 'signup_bonus',
                        points: signUpBonus
                    }
                }
            );
        }

        // Handle metroshop registration
        if (createUserDto.registrationSource === 'metroshop') {
            await this.customerService.create({
                firstName: createUserDto.name,
                lastName: createUserDto.surname,
                email: createUserDto.email,
                phone: createUserDto.phone,
                type: 'REGULAR',
                clientId: client._id.toString(),
                userId: savedUser._id.toString(),
                external_ids: {
                    venueBoostId: createUserDto.external_id
                },
                address: {
                    addressLine1: createUserDto.address.addressLine1,
                    postcode: createUserDto.address.postcode,
                    city: createUserDto.address.city,
                    state: createUserDto.address.state,
                    country: createUserDto.address.country
                },
                status: 'ACTIVE'
            });
        }

        return this.userModel.findById(savedUser._id)
            .populate('walletId')
            .exec();
    }
}