import {
    BadRequestException,
    forwardRef,
    Inject,
    Injectable,
    NotFoundException,
    UnauthorizedException
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {RegistrationSource, User} from '../schemas/user.schema';
import { CreateUserDto, GetOrCreateUserDto } from '../dtos/user.dto';
import * as bcrypt from 'bcrypt';
import { Store } from "../schemas/store.schema";
import { Client } from "../schemas/client.schema";
import * as crypto from 'crypto';
import { WalletService } from "./wallet.service";
import { CustomerService } from "./customer.service";
import { EmailService } from "./email.service";
import { Wallet } from '../schemas/wallet.schema';


export interface PopulatedReferral {
    name: string;
    email: string;
    clientTiers: Record<string, string>;
    totalSpend: number;
    points: number;
    createdAt: Date;
}


export interface WalletActivity {
    amount: number;
    description: string;
    type: string;
    created_at: Date;
    points: number;
}

export interface ReferralInfo {
    name: string;
    email: string;
    tier: string;
    total_spend: number;
    points: number;
    joined_date: Date;
}

export interface WalletInfo {
    balance: number;
    currency: string;
    money_value: string;
    walletActivities: WalletActivity[];
    referralsList: ReferralInfo[];
    loyaltyTier: string | null;
    referralCode: string;
}

interface WalletWithPopulatedRefs extends Omit<User, 'referrals'> {
    walletId: Wallet;
    referrals: PopulatedReferral[];
}

export interface UserRegistrationResponse {
    user: User;
    userId: string;
    customerId?: string;
    walletBalance: number;
    currentTierName: string;
    referralCode: string;
}
@Injectable()
export class UserService {
    constructor(
        @InjectModel(User.name) private userModel: Model<User>,
        @InjectModel(Store.name) private storeModel: Model<Store>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        private walletService: WalletService,
        @Inject(forwardRef(() => CustomerService))
        private customerService: CustomerService,
        private emailService: EmailService,
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

    async registerUser(createUserDto: CreateUserDto & { client_ids: string[] }): Promise<UserRegistrationResponse> {
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
            external_ids: {
                venueBoostId: createUserDto.external_ids.venueBoostUserId,
            },
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

        let customer;
        // 12. Handle additional registration logic for metroshop.
        if (createUserDto.registrationSource === 'metroshop') {
            customer = await this.customerService.create({
                firstName: createUserDto.name,
                lastName: createUserDto.surname,
                email: createUserDto.email,
                phone: createUserDto.phone,
                type: 'REGULAR',
                clientId: primaryClient._id.toString(), // remain with primary client
                userId: savedUser._id.toString(),
                external_ids: {
                    venueBoostId: createUserDto.external_ids.venueBoostCustomerId
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

        // Last. After saving the user, send the welcome email using your HTML template
        await this.emailService.sendTemplateEmail(
            'Metroshop',                          // fromName: The display name of the sender
            'metroshop@omnistackhub.xyz',            // fromEmail: The verified sender email address
            savedUser.email,                          // to: Recipient email address
            'Mirë se vjen në Metroshop!',           // subject: Email subject
            'templates/metroshop/welcome-email-template.html', // templatePath: Relative path to your template file
            {
                discount_percentage: '10%',             // Data for {{discount_percentage}}
                promo_code: 'WELCOME10',                  // Data for {{promo_code}}
            },
        );

        // 13. Return the saved user with the wallet populated.
        const userWithWallet = await this.userModel.findById(savedUser._id)
            .populate('walletId')
            .exec();

        const currentTierName = userWithWallet.clientTiers?.[primaryClient._id.toString()] || 'Default Tier';

        const populatedUser = userWithWallet as User & { walletId: Wallet };


        return {
            user: userWithWallet,
            userId: savedUser._id.toString(),
            customerId: customer?._id.toString(),
            walletBalance: (populatedUser.walletId as Wallet)?.balance || 0,
            currentTierName: currentTierName,
            referralCode: userWithWallet.referralCode
        };
    }

    async getOrCreateWithLoyalty(
        venueShortCode: string,
        webhookApiKey: string,
        userData: GetOrCreateUserDto
    ): Promise<UserRegistrationResponse> {
        const requestClient = await this.clientModel.findOne({
            'venueBoostConnection.venueShortCode': venueShortCode,
            'venueBoostConnection.webhookApiKey': webhookApiKey,
            'venueBoostConnection.status': 'connected'
        });

        if (!requestClient) {
            throw new UnauthorizedException('Invalid venue or webhook key');
        }

        // Convert external_id to string
        const externalId = userData.external_id.toString();

        // Find existing user
        const existingUser = await this.userModel.findOne({
            'external_ids.venueBoostId': externalId
        }).populate('walletId');

        if (!existingUser) {
            // Create new user with proper type casting
            const createUserDto: CreateUserDto & { client_ids: string[] } = {
                name: userData.name,
                surname: userData.surname === '-' ? '' : userData.surname,
                email: userData.email,
                phone: userData.phone,
                password: userData.password,
                registrationSource: userData.registrationSource.toLowerCase() as RegistrationSource,
                external_ids: {
                    venueBoostUserId: externalId
                },
                client_ids: [requestClient._id.toString()]
            };

            return await this.registerUser(createUserDto);
        }

        // Get or create wallet
        const wallet = await this.walletService.findOrCreateWallet(
            existingUser._id.toString(),
            requestClient._id.toString(),
            requestClient.defaultCurrency || 'ALL'
        );

        return {
            user: existingUser,
            userId: existingUser._id.toString(),
            walletBalance: wallet.balance || 0,
            currentTierName: existingUser.clientTiers?.[requestClient._id.toString()] || 'Default Tier',
            referralCode: existingUser.referralCode
        };
    }

    // Example of how systems interact in UserService
    // async awardPoints(userId: string, amount: number, source: string) {
    //     const user = await this.userModel.findById(userId);
    //     if (!user) throw new NotFoundException('User not found');
    //
    //     const client = await this.clientModel.findById(user.client_ids[0]);
    //     if (!client?.loyaltyProgram) return;
    //
    //     // Get user's tier
    //     const userTier = user.clientTiers.get(client._id.toString());
    //     const tierDetails = client.loyaltyProgram.membershipTiers
    //         .find(t => t.name === userTier);
    //
    //     // Apply tier multiplier
    //     const multiplier = tierDetails?.pointsMultiplier || 1;
    //     const finalPoints = amount * multiplier;
    //
    //     // Update user points
    //     await this.userModel.updateOne(
    //         { _id: userId },
    //         { $inc: { points: finalPoints } }
    //     );
    //
    //     return finalPoints;
    // }

    async getWalletInfo(
        venueShortCode: string,
        webhookApiKey: string,
        userId: string
    ): Promise<{ wallet_info: WalletInfo }> {
        // 1. Verify requesting client
        const requestClient = await this.clientModel.findOne({
            'venueBoostConnection.venueShortCode': venueShortCode,
            'venueBoostConnection.webhookApiKey': webhookApiKey,
            'venueBoostConnection.status': 'connected'
        });

        if (!requestClient) {
            throw new UnauthorizedException('Invalid venue or webhook key');
        }

        // 2. Get user with populated data
        const user = await this.userModel.findById(userId)
            .populate('walletId')
            .populate({
                path: 'referrals',
                select: 'name email clientTiers totalSpend points createdAt'
            })
            .exec() as unknown as WalletWithPopulatedRefs;

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // 3. Check if user belongs to requesting client
        if (!user.client_ids.includes(requestClient._id.toString())) {
            throw new UnauthorizedException('User not found for this client');
        }

        // 4. Get wallet transactions
        const walletTransactions = await this.walletService.getTransactions(user.walletId._id.toString());

        // 5. Use the stored tier data
        const currentTierName = user.clientTiers?.[requestClient._id.toString()] || 'Default Tier';

        const balance = user.walletId.balance || 0;
        const moneyValue = balance > 0 ? (balance / 100) : 0;

        const walletInfo: WalletInfo = {
            balance: balance,
            currency: requestClient.defaultCurrency || 'EUR',
            money_value: moneyValue.toFixed(2),
            walletActivities: walletTransactions.map(t => ({
                amount: t.amount,
                description: t.metadata.description,
                type: t.type,
                created_at: t.createdAt,
                points: t.metadata.points || t.amount
            })),
            referralsList: user.referrals.map(r => ({
                name: r.name,
                email: r.email,
                tier: r.clientTiers[requestClient._id.toString()] || 'Default Tier',
                total_spend: r.totalSpend,
                points: r.points,
                joined_date: r.createdAt
            })),
            loyaltyTier: currentTierName,
            referralCode: user.referralCode || ''
        };

        return { wallet_info: walletInfo };
    }

    private async findClientWithLoyalty(primaryClient: any): Promise<any> {
        if (
            primaryClient.loyaltyProgram &&
            Array.isArray(primaryClient.loyaltyProgram.membershipTiers) &&
            primaryClient.loyaltyProgram.membershipTiers.length > 0
        ) {
            return primaryClient;
        }

        if (primaryClient.venueBoostConnection?.venueShortCode) {
            const connectedClient = await this.clientModel.findOne({
                _id: { $ne: primaryClient._id },
                'venueBoostConnection.venueShortCode': primaryClient.venueBoostConnection.venueShortCode,
                'venueBoostConnection.status': 'connected',
                'loyaltyProgram.membershipTiers.0': { $exists: true }
            });

            if (connectedClient?.loyaltyProgram?.membershipTiers?.length > 0) {
                return connectedClient;
            }
        }

        return primaryClient;
    }

    private async validateClientAccess(requestClient: any, userId: string): Promise<boolean> {
        // Get all connected client IDs for the requesting client
        const connectedClientIds = await this.getConnectedClientIds(requestClient);

        // Find the user and check if they belong to any of the connected clients
        const user = await this.userModel.findById(userId);
        if (!user) return false;

        return user.client_ids.some(clientId =>
            connectedClientIds.includes(clientId.toString())
        );
    }


    private async getConnectedClientIds(client: any): Promise<string[]> {
        const clientIds = new Set<string>([client._id.toString()]);

        if (client.venueBoostConnection?.venueShortCode) {
            const connectedClients = await this.clientModel.find({
                'venueBoostConnection.venueShortCode': client.venueBoostConnection.venueShortCode,
                'venueBoostConnection.status': 'connected'
            });

            connectedClients.forEach(cc => clientIds.add(cc._id.toString()));
        }

        return Array.from(clientIds);
    }
}