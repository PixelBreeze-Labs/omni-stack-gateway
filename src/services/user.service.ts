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
import { GetOrCreateGuestDto } from '../dtos/guest.dto';
import * as bcrypt from 'bcrypt';
import { Store } from "../schemas/store.schema";
import { Client } from "../schemas/client.schema";
import * as crypto from 'crypto';
import { WalletService } from "./wallet.service";
import { CustomerService } from "./customer.service";
import { EmailService } from "./email.service";
import { Wallet } from '../schemas/wallet.schema';
import { Business } from '../schemas/business.schema';
import {StaffUserParams, StaffUserResponse} from "../interfaces/staff-user.interface";
import {VenueBoostService} from "./venueboost.service";
import {AppClient} from "../schemas/app-client.schema";
import {Guest} from "../schemas/guest.schema";


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
        @InjectModel(Business.name) private businessModel: Model<Business>,
        @InjectModel(AppClient.name) private appClientModel: Model<AppClient>,
        @InjectModel(Guest.name) private guestModel: Model<Guest>,
    private walletService: WalletService,
        @Inject(forwardRef(() => CustomerService))
        private customerService: CustomerService,
        private emailService: EmailService,
        private venueBoostService: VenueBoostService
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
    ): Promise<any> {
        const requestClient = await this.clientModel.findOne({
            'venueBoostConnection.venueShortCode': venueShortCode,
            'venueBoostConnection.webhookApiKey': webhookApiKey,
            'venueBoostConnection.status': 'connected'
        });

        if (!requestClient) {
            throw new UnauthorizedException('Invalid venue or webhook key');
        }

        // Convert external_id to string
        const externalId = userData.external_id;



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
                    venueBoostId: externalId
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
                description: t.description,
                type: t.type,
                created_at: t.timestamp,
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


    async getStaffUsers(clientId: string, params: StaffUserParams): Promise<StaffUserResponse> {
        const { page = 1, limit = 10, search, sort = '-createdAt' } = params;
        const skip = (page - 1) * limit;

        // Build the query to find users with registrationSource = STAFFLUENT
        const query: any = {
            client_ids: clientId,
            registrationSource: RegistrationSource.STAFFLUENT
        };

        // Add search condition if provided
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { surname: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        // Count total users matching criteria
        const total = await this.userModel.countDocuments(query);

        // Calculate total pages
        const pages = Math.ceil(total / limit);

        // Fetch users with pagination and sorting
        const users = await this.userModel
            .find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .exec();

        // For each user, find their associated businesses and app clients
        const items = await Promise.all(
            users.map(async (user) => {
                // Get businesses where user is admin or staff
                const businesses = await this.businessModel
                    .find({
                        clientId,
                        $or: [
                            { adminUserId: user._id },
                            { userIds: user._id }
                        ]
                    })
                    .exec();

                // Find all app clients associated with this user
                const appClients = await this.appClientModel
                    .find({
                        user_id: user._id
                    })
                    .populate('businessId', 'name email') // Populate the business details
                    .exec();

                // Add app client info to user metadata
                if (appClients && appClients.length > 0) {
                    if (!user.metadata) {
                        user.metadata = new Map();
                    }

                    // Add all connections to metadata
                    appClients.forEach((appClient, index) => {
                        // Store each app client's info
                        user.metadata.set(`appClient_${index}_id`, appClient._id.toString());
                        user.metadata.set(`appClient_${index}_name`, appClient.name);
                        user.metadata.set(`appClient_${index}_type`, appClient.type);

                        // If this app client has a business connection, add that too
                        if (appClient.businessId) {
                            const business = appClient.businessId as any; // Using any to handle populated fields
                            user.metadata.set(`appClient_${index}_businessId`, business._id.toString());
                            user.metadata.set(`appClient_${index}_businessName`, business.name);
                            if (business.email) {
                                user.metadata.set(`appClient_${index}_businessEmail`, business.email);
                            }
                        }
                    });

                    // Store the count of app clients
                    user.metadata.set('appClientCount', appClients.length.toString());
                }

                return {
                    user,
                    businesses,
                    appClients // Include app clients directly in the response
                };
            })
        );

        return {
            items,
            total,
            pages
        };
    }
    // src/services/user.service.ts
// Add this method to your existing UserService

    async getStaffAdminUsers(
        clientId: string,
        params: StaffUserParams
    ): Promise<StaffUserResponse> {
        const { page = 1, limit = 10, search, sort = '-createdAt' } = params;
        const skip = (page - 1) * limit;

        // First, find all businesses where the clientId matches
        const businesses = await this.businessModel
            .find({ clientId })
            .select('adminUserId')
            .exec();

        // Extract all admin user IDs
        const adminUserIds = businesses.map(business => business.adminUserId);

        // Build the query to find admin users with registrationSource = STAFFLUENT
        const query: any = {
            _id: { $in: adminUserIds },
            client_ids: clientId,
            registrationSource: RegistrationSource.STAFFLUENT
        };

        // Add search condition if provided
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { surname: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        // Count total users matching criteria
        const total = await this.userModel.countDocuments(query);

        // Calculate total pages
        const pages = Math.ceil(total / limit);

        // Fetch users with pagination and sorting
        const users = await this.userModel
            .find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .exec();

        // For each admin user, find the businesses they administer
        const items = await Promise.all(
            users.map(async (user) => {
                const adminBusinesses = await this.businessModel
                    .find({
                        clientId,
                        adminUserId: user._id
                    })
                    .exec();

                return {
                    user,
                    businesses: adminBusinesses
                };
            })
        );

        return {
            items,
            total,
            pages
        };
    }

    /**
     * Change user password
     * Handles both first-time password change and regular password changes
     */
    async changePassword(userId: string, passwordData: {
        currentPassword?: string;
        newPassword: string;
    }): Promise<{ success: boolean; message: string }> {
        try {

            // Find the user
            const user = await this.userModel.findById(userId);
            if (!user) {
                throw new NotFoundException('User not found');
            }

            // Check if user has changed password before
            const hasChangedPassword = user.metadata?.get('has_changed_password') === 'true';

            // If user has changed password before, verify current password
            if (hasChangedPassword) {
                if (!passwordData.currentPassword) {
                    throw new BadRequestException('Current password is required');
                }

                // Verify current password
                const isPasswordValid = await bcrypt.compare(passwordData.currentPassword, user.password);
                if (!isPasswordValid) {
                    throw new BadRequestException('Current password is incorrect');
                }
            }

            // Validate the new password
            if (passwordData.newPassword.length < 8) {
                throw new BadRequestException('New password must be at least 8 characters long');
            }

            // Hash the new password
            const hashedPassword = await bcrypt.hash(passwordData.newPassword, 10);

            // Update user with new password and set flag
            await this.userModel.updateOne(
                { _id: userId },
                {
                    $set: {
                        password: hashedPassword,
                        'metadata.has_changed_password': 'true',
                        'metadata.password_last_changed': new Date().toISOString()
                    }
                }
            );

            // Sync with VenueBoost if user has VenueBoost ID
            let venueBoostResult = { success: true, message: 'No VenueBoost integration needed' };
            if (user.external_ids && user.external_ids.venueBoostId) {
                venueBoostResult = await this.venueBoostService.changePassword(user, passwordData.newPassword);
                if (!venueBoostResult.success) {
                    // Continue anyway since our local password is updated
                }
            }

            // Send confirmation email
            try {
                await this.sendPasswordChangeEmail(user);
            } catch (emailError) {
                // Continue even if email sending fails
            }

            return {
                success: true,
                message: hasChangedPassword
                    ? 'Password changed successfully'
                    : 'Initial password set successfully'
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Send password change confirmation email
     */
    private async sendPasswordChangeEmail(user: User): Promise<void> {
        // Find user's business if they are an admin
        let businessName = 'your account';
        try {
            const business = await this.businessModel.findOne({ adminUserId: user._id });
            if (business) {
                businessName = business.name;
            }
        } catch (error) {
            // Continue with generic business name
        }

        // Send email notification
        await this.emailService.sendTemplateEmail(
            'Staffluent',
            'staffluent@omnistackhub.xyz',
            user.email,
            'Your Staffluent Password Has Been Changed',
            'templates/user/password-changed.html',
            {
                userName: user.surname ? `${user.name} ${user.surname}` : user.name,
                businessName,
                timestamp: new Date().toLocaleString(),
                supportEmail: 'support@staffluent.co'
            }
        );

    }

    async getOrCreateGuest(
        venueShortCode: string,
        webhookApiKey: string,
        guestData: GetOrCreateGuestDto
    ): Promise<any> {
        try {
            // 1. Sanitize and validate input data
            if (!guestData.email) {
                throw new BadRequestException('Email is required');
            }

            // Ensure external IDs are strings if present
            const safeExternalIds = {
                venueBoostUserId: guestData.external_ids?.venueBoostUserId ? String(guestData.external_ids.venueBoostUserId) : null,
                venueBoostGuestId: guestData.external_ids?.venueBoostGuestId ? String(guestData.external_ids.venueBoostGuestId) : null
            };

            // 2. Verify client credentials with flexible matching
            const requestClient = await this.clientModel.findOne({
                $or: [
                    { 'venueBoostConnection.venueShortCode': venueShortCode },
                    { 'venueBoostConnection.venueShortCode': encodeURIComponent(venueShortCode) },
                    { 'venueBoostConnection.venueShortCode': decodeURIComponent(venueShortCode) }
                ],
                'venueBoostConnection.webhookApiKey': webhookApiKey,
                'venueBoostConnection.status': 'connected'
            });

            if (!requestClient) {
                throw new UnauthorizedException(`Invalid venue (${venueShortCode}) or webhook key`);
            }

            // 3. Load primary client for loyalty
            const primaryClient = requestClient;

            // 4. Determine which loyalty program to use
            let loyaltyClient = primaryClient;
            if (
                !primaryClient.loyaltyProgram ||
                !Array.isArray(primaryClient.loyaltyProgram.membershipTiers) ||
                primaryClient.loyaltyProgram.membershipTiers.length === 0
            ) {
                try {
                    const connectedClient = await this.clientModel.findOne({
                        _id: { $ne: primaryClient._id },
                        'venueBoostConnection.venueShortCode': primaryClient.venueBoostConnection.venueShortCode,
                        'venueBoostConnection.status': 'connected'
                    }).select('loyaltyProgram defaultCurrency');

                    if (
                        connectedClient &&
                        connectedClient.loyaltyProgram &&
                        Array.isArray(connectedClient.loyaltyProgram.membershipTiers) &&
                        connectedClient.loyaltyProgram.membershipTiers.length > 0
                    ) {
                        loyaltyClient = connectedClient;
                    }
                } catch (e) {
                    // If finding connected client fails, continue with primary client
                }
            }

            // 5. Determine the membership tier
            let initialClientTiers: Record<string, string> = {};
            try {
                if (
                    loyaltyClient.loyaltyProgram &&
                    Array.isArray(loyaltyClient.loyaltyProgram.membershipTiers) &&
                    loyaltyClient.loyaltyProgram.membershipTiers.length > 0
                ) {
                    // Find the tier with the lowest "min" spend
                    const lowestTier = loyaltyClient.loyaltyProgram.membershipTiers.reduce((lowest, current) => {
                        return (!lowest || current.spendRange.min < lowest.spendRange.min) ? current : lowest;
                    }, null);

                    if (lowestTier) {
                        initialClientTiers[primaryClient._id.toString()] = lowestTier.name;
                    }
                }
            } catch (e) {
                // If determining tier fails, use default
            }

            // If no tier was found, fall back to "Default Tier"
            if (Object.keys(initialClientTiers).length === 0) {
                initialClientTiers[primaryClient._id.toString()] = 'Default Tier';
            }

            // 6. Look for existing user by external ID or email
            let existingUser = null;
            if (safeExternalIds.venueBoostUserId) {
                existingUser = await this.userModel.findOne({
                    'external_ids.venueBoostId': safeExternalIds.venueBoostUserId
                }).populate('walletId');
            }

            if (!existingUser && guestData.email) {
                existingUser = await this.userModel.findOne({
                    email: guestData.email
                }).populate('walletId');
            }

            // 7. Find or create the guest
            let guest = null;
            let wallet = null;

            if (existingUser) {
                // User exists, check if guest exists for this user
                if (safeExternalIds.venueBoostGuestId) {
                    guest = await this.guestModel.findOne({
                        'external_ids.venueBoostId': safeExternalIds.venueBoostGuestId
                    });
                }

                if (!guest) {
                    guest = await this.guestModel.findOne({
                        userId: existingUser._id.toString()
                    });
                }

                // If guest doesn't exist, create it
                if (!guest) {
                    try {
                        guest = await this.guestModel.create({
                            userId: existingUser._id.toString(),
                            name: `${guestData.name} ${guestData.surname || ''}`.trim(),
                            email: guestData.email,
                            phone: guestData.phone || '',
                            isActive: true,
                            clientIds: [requestClient._id.toString()],
                            external_ids: {
                                venueBoostId: safeExternalIds.venueBoostGuestId
                            }
                        });
                    } catch (error) {
                        if (error.code === 11000) {
                            throw new BadRequestException('Duplicate guest record detected');
                        }
                        throw error;
                    }
                } else if (safeExternalIds.venueBoostGuestId && (!guest.external_ids || !guest.external_ids.venueBoostId)) {
                    // Update guest with external ID if needed
                    guest.external_ids = {
                        ...(guest.external_ids || {}),
                        venueBoostId: safeExternalIds.venueBoostGuestId
                    };
                    await guest.save();
                }

                // Get or create wallet
                try {
                    wallet = await this.walletService.findOrCreateWallet(
                        existingUser._id.toString(),
                        requestClient._id.toString(),
                        requestClient.defaultCurrency || 'EUR'
                    );
                } catch (error) {
                    // If wallet creation fails, continue with null wallet
                    wallet = { balance: 0 };
                }

                // Return existing user and guest information
                return {
                    user: existingUser,
                    userId: existingUser._id.toString(),
                    guestId: guest._id.toString(),
                    walletBalance: wallet.balance || 0,
                    currentTierName: existingUser.clientTiers?.[requestClient._id.toString()] || initialClientTiers[requestClient._id.toString()],
                    referralCode: existingUser.referralCode
                };
            } else {
                // 8. User doesn't exist, create new user
                try {
                    // Generate referral code
                    const referralCode = this.generateReferralCode();

                    // Hash password with fallback
                    let hashedPassword;
                    try {
                        hashedPassword = await bcrypt.hash(guestData.password || 'DefaultPassword123', 10);
                    } catch (e) {
                        hashedPassword = await bcrypt.hash('DefaultPassword123', 10);
                    }

                    // Create new user with membership tier
                    const newUser = new this.userModel({
                        name: guestData.name || 'Guest',
                        surname: guestData.surname === '-' ? '' : (guestData.surname || ''),
                        email: guestData.email,
                        phone: guestData.phone || '',
                        password: hashedPassword,
                        registrationSource: (guestData.registrationSource || 'metrosuites').toLowerCase() as RegistrationSource,
                        external_ids: {
                            venueBoostId: safeExternalIds.venueBoostUserId
                        },
                        client_ids: [requestClient._id.toString()],
                        referralCode,
                        clientTiers: initialClientTiers,
                        points: 0,
                        totalSpend: 0
                    });

                    // Save the user
                    const savedUser = await newUser.save();

                    // Award signup bonus points if defined
                    if (primaryClient.loyaltyProgram?.pointsSystem?.earningPoints?.signUpBonus) {
                        const signUpBonus = primaryClient.loyaltyProgram.pointsSystem.earningPoints.signUpBonus;
                        await this.userModel.updateOne(
                            { _id: savedUser._id },
                            { $inc: { points: signUpBonus } }
                        );
                    }

                    // Create wallet
                    try {
                        wallet = await this.walletService.findOrCreateWallet(
                            savedUser._id.toString(),
                            requestClient._id.toString(),
                            requestClient.defaultCurrency || 'EUR'
                        );

                        // Update user with wallet ID
                        await this.userModel.updateOne(
                            { _id: savedUser._id },
                            { walletId: wallet._id }
                        );

                        // Add wallet credit for the signup bonus if applicable
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
                    } catch (error) {
                        // If wallet creation fails, continue with null wallet
                        wallet = { balance: 0 };
                    }

                    // Create guest for the new user
                    try {
                        guest = await this.guestModel.create({
                            userId: savedUser._id.toString(),
                            name: `${guestData.name} ${guestData.surname || ''}`.trim(),
                            email: guestData.email,
                            phone: guestData.phone || '',
                            isActive: true,
                            clientIds: [requestClient._id.toString()],
                            external_ids: {
                                venueBoostId: safeExternalIds.venueBoostGuestId
                            }
                        });
                    } catch (error) {
                        if (error.code === 11000) {
                            throw new BadRequestException('Duplicate guest record detected');
                        }
                        throw error;
                    }

                    // Return user and guest information
                    const tierName = initialClientTiers[requestClient._id.toString()];

                    return {
                        user: savedUser,
                        userId: savedUser._id.toString(),
                        guestId: guest._id.toString(),
                        walletBalance: wallet.balance || 0,
                        currentTierName: tierName,
                        referralCode: referralCode
                    };
                } catch (error) {
                    if (error.code === 11000) {
                        throw new BadRequestException('Duplicate user record detected - email may already be in use');
                    }
                    throw error;
                }
            }
        } catch (error) {
            // Improved error handling to provide more specific information
            if (error instanceof BadRequestException || error instanceof UnauthorizedException || error instanceof NotFoundException) {
                throw error;
            }

            // Convert MongoDB errors to meaningful API errors
            if (error.code === 11000) {
                throw new BadRequestException('Duplicate key error - a record with this data already exists');
            }

            // Handle validation errors
            if (error.name === 'ValidationError') {
                throw new BadRequestException(`Validation error: ${error.message}`);
            }

            // General error handler
            throw new BadRequestException(`Error creating guest: ${error.message}`);
        }
    }
}