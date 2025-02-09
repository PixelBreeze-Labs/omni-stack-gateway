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

        // 3. Load the primary client using the provided client id.
        const primaryClient = await this.clientModel.findById(createUserDto.client_ids[0])
            .select('loyaltyProgram defaultCurrency venueBoostConnection');
        if (!primaryClient) {
            throw new BadRequestException('Client not found');
        }

        // 4. Determine which loyalty program to use.
        // We use the primary client for the user,
        // but if the primary client doesn't have a loyalty program with membershipTiers,
        // then try to "borrow" it from a connected client.
        let loyaltyClient = primaryClient; // default to primary client
        if (
            !primaryClient.loyaltyProgram ||
            !Array.isArray(primaryClient.loyaltyProgram.membershipTiers) ||
            primaryClient.loyaltyProgram.membershipTiers.length === 0
        ) {
            if (primaryClient.venueBoostConnection && primaryClient.venueBoostConnection.venueShortCode) {
                const connectedClient = await this.clientModel.findOne({
                    _id: { $ne: primaryClient._id },
                    'venueBoostConnection.venueShortCode': primaryClient.venueBoostConnection.venueShortCode,
                    'venueBoostConnection.status': 'connected'
                })
                    .select('loyaltyProgram defaultCurrency');
                if (
                    connectedClient &&
                    connectedClient.loyaltyProgram &&
                    Array.isArray(connectedClient.loyaltyProgram.membershipTiers) &&
                    connectedClient.loyaltyProgram.membershipTiers.length > 0
                ) {
                    loyaltyClient = connectedClient;
                }
            }
        }

        // 5. Determine the membership tier using the loyalty program from loyaltyClient.
        // Even though we borrow the loyalty data, the user remains with the primary client.
        // We store the tier using the primary client's ID as the key.
        let initialClientTiers: Record<string, string> = {};
        if (
            loyaltyClient.loyaltyProgram &&
            Array.isArray(loyaltyClient.loyaltyProgram.membershipTiers) &&
            loyaltyClient.loyaltyProgram.membershipTiers.length > 0
        ) {
            // Find the tier with the lowest "min" spend.
            const lowestTier = loyaltyClient.loyaltyProgram.membershipTiers.reduce((lowest, current) => {
                return (!lowest || current.spendRange.min < lowest.spendRange.min) ? current : lowest;
            }, null);
            if (lowestTier) {
                initialClientTiers[primaryClient._id.toString()] = lowestTier.name;
            }
        }
        // If no tier was found, fall back to "Default Tier".
        if (Object.keys(initialClientTiers).length === 0) {
            initialClientTiers[primaryClient._id.toString()] = 'Default Tier';
        }

        // 6. Create the new user with the membership tier stored as a plain object.
        const user = new this.userModel({
            ...createUserDto,
            password: hashedPassword,
            referralCode,
            clientTiers: initialClientTiers,
            points: 0,
            totalSpend: 0
        });

        // 7. Handle referral logic if a referral code was provided.
        if (referredByUser) {
            user.referredBy = referredByUser._id;
            await this.userModel.updateOne(
                { _id: referredByUser._id },
                {
                    $push: { referrals: user._id },
                    $inc: { referralsRemaining: -1 }
                }
            );

            if (
                loyaltyClient.loyaltyProgram &&
                Array.isArray(loyaltyClient.loyaltyProgram.membershipTiers) &&
                loyaltyClient.loyaltyProgram.membershipTiers.length > 0
            ) {
                // Look up the referrer's tier from their stored clientTiers, using primary client's id.
                const referrerTierName = referredByUser.clientTiers
                    ? referredByUser.clientTiers[primaryClient._id.toString()]
                    : null;
                if (!referrerTierName) {
                    console.error('No tier found for referrer');
                } else {
                    const referrerTier = loyaltyClient.loyaltyProgram.membershipTiers
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

        // 8. Save the new user.
        const savedUser = await user.save();

        // 9. Award signup bonus points if defined (using primary client's loyalty info).
        if (primaryClient.loyaltyProgram?.pointsSystem?.earningPoints?.signUpBonus) {
            const signUpBonus = primaryClient.loyaltyProgram.pointsSystem.earningPoints.signUpBonus;
            await this.userModel.updateOne(
                { _id: savedUser._id },
                { $inc: { points: signUpBonus } }
            );
        }

        // 10. Create the wallet for the user using the primary client's default currency.
        const wallet = await this.walletService.findOrCreateWallet(
            savedUser._id.toString(),
            primaryClient._id.toString(),
            primaryClient.defaultCurrency || 'EUR'
        );

        // Update the user with the wallet ID.
        await this.userModel.updateOne(
            { _id: savedUser._id },
            { walletId: wallet._id }
        );

        // 11. Add wallet credit for the signup bonus if applicable.
        if (primaryClient.loyaltyProgram?.pointsSystem?.earningPoints?.signUpBonus) {
            const signUpBonus = primaryClient.loyaltyProgram.pointsSystem.earningPoints.signUpBonus;
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

        // 12. Handle additional registration logic for metroshop.
        if (createUserDto.registrationSource === 'metroshop') {
            await this.customerService.create({
                firstName: createUserDto.name,
                lastName: createUserDto.surname,
                email: createUserDto.email,
                phone: createUserDto.phone,
                type: 'REGULAR',
                clientId: primaryClient._id.toString(), // remain with primary client
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

        // 13. Return the saved user with the wallet populated.
        return this.userModel.findById(savedUser._id)
            .populate('walletId')
            .exec();
    }

}