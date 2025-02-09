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

    async registerUser(createUserDto: CreateUserDto & { client_ids: string[] }): Promise<User> {
        // 1. Check referral code if provided
        let referredByUser = null;
        if (createUserDto.referralCode) {
            referredByUser = await this.userModel.findOne({
                referralCode: createUserDto.referralCode,
                referralsRemaining: { $gt: 0 },
            });
            if (!referredByUser) {
                throw new BadRequestException('Invalid or expired referral code');
            }
        }

        // 2. Generate referral code and hash the password
        const referralCode = this.generateReferralCode();
        const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

        // 3. Find client and its loyalty program
        const client = await this.clientModel.findById(createUserDto.client_ids[0])
            .select('loyaltyProgram defaultCurrency');
        if (!client) {
            throw new BadRequestException('Client not found');
        }

        // 4. Determine initial tier if loyalty program exists.
        // Use a plain object for membership tiers.
        let initialClientTiers: Record<string, string> = {};
        if (client?.loyaltyProgram?.membershipTiers?.length > 0) {
            // Find the tier with the lowest spend minimum.
            const lowestTier = client.loyaltyProgram.membershipTiers.reduce((lowest, current) => {
                return (!lowest || current.spendRange.min < lowest.spendRange.min) ? current : lowest;
            }, null);
            if (lowestTier) {
                // Use the client's _id as the key.
                initialClientTiers[client._id.toString()] = lowestTier.name;
            }
        }
        // If no tier was defined, assign a default tier.
        if (Object.keys(initialClientTiers).length === 0) {
            initialClientTiers[client._id.toString()] = 'Default Tier';
        }

        // 5. Create the new user with the initial tier.
        // The clientTiers field is stored as a plain object.
        const user = new this.userModel({
            ...createUserDto,
            password: hashedPassword,
            referralCode,
            clientTiers: initialClientTiers, // plain object for membership tier
            points: 0,
            totalSpend: 0
        });

        // 6. Handle referral logic if a referral code was provided.
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
                // Look up the referrer's tier from their stored clientTiers.
                const referrerTierName = referredByUser.clientTiers
                    ? referredByUser.clientTiers[client._id.toString()]
                    : null;
                if (!referrerTierName) {
                    console.error('No tier found for referrer');
                } else {
                    const referrerTier = client.loyaltyProgram.membershipTiers
                        .find(tier => tier.name === referrerTierName);
                    if (referrerTier?.referralPoints) {
                        await this.userModel.updateOne(
                            { _id: referredByUser._id },
                            { $inc: { points: referrerTier.referralPoints } }
                        );
                    }
                }
            }
        }

        // 7. Save the new user.
        const savedUser = await user.save();

        // 8. Award signup bonus points if defined.
        if (client?.loyaltyProgram?.pointsSystem?.earningPoints?.signUpBonus) {
            const signUpBonus = client.loyaltyProgram.pointsSystem.earningPoints.signUpBonus;
            await this.userModel.updateOne(
                { _id: savedUser._id },
                { $inc: { points: signUpBonus } }
            );
        }

        // 9. Create the wallet for the user.
        const wallet = await this.walletService.findOrCreateWallet(
            savedUser._id.toString(),
            client._id.toString(),
            client.defaultCurrency || 'EUR'
        );

        // Update the user with the wallet ID.
        await this.userModel.updateOne(
            { _id: savedUser._id },
            { walletId: wallet._id }
        );

        // 10. Add wallet credit for the signup bonus if applicable.
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

        // 11. Handle additional registration logic for metroshop.
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

        // Return the saved user with the wallet populated.
        return this.userModel.findById(savedUser._id)
            .populate('walletId')
            .exec();
    }

}