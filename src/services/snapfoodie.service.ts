// src/services/snapfoodie.service.ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, RegistrationSource } from '../schemas/user.schema';
import { SnapfoodService } from './snapfood.service';
import { Client } from '../schemas/client.schema';

interface SyncUsersOptions {
    page: number;
    limit: number;
    search?: string;
}

@Injectable()
export class SnapfoodieService {
    private readonly logger = new Logger(SnapfoodieService.name);

    constructor(
        @InjectModel(User.name) private userModel: Model<User>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        private readonly snapfoodService: SnapfoodService
    ) {}


    /**
     * Sync SnapFood users to our system
     *
     * @param clientId The MongoDB ID of the client
     * @param options Pagination and search options
     * @returns Result of the sync operation
     */
    async syncUsers(clientId: string, options: SyncUsersOptions): Promise<{
        success: boolean;
        message: string;
        created: number;
        updated: number;
        skipped: number;
        errors: number;
        errorDetails?: Array<{userId: string, error: string}>;
    }> {
        try {
            // Get the client
            const client = await this.clientModel.findById(clientId);
            if (!client) {
                throw new NotFoundException('Client not found');
            }

            // Get users from SnapFood
            const response = await this.snapfoodService.listUsersWithDevices({
                page: options.page,
                limit: options.limit,
                search: options.search
            });

            const users = response.data || [];

            // Tracking stats
            let created = 0, updated = 0, skipped = 0, errors = 0;
            const errorDetails = [];

            // Process each user
            for (const snapFoodUser of users) {
                try {
                    // Skip users without an email address
                    if (!snapFoodUser.email || snapFoodUser.email.trim() === '') {
                        this.logger.warn(`Skipping user ${snapFoodUser.id} - missing email address`);
                        skipped++;
                        continue;
                    }

                    // Convert the snapFoodId to a numeric value
                    const snapFoodIdNumeric = parseInt(snapFoodUser.id.toString(), 10);

                    // Check if user already exists by external ID
                    let user = await this.userModel.findOne({
                        'external_ids.snapFoodId': snapFoodUser.id.toString()
                    });

                    // If not, check by email
                    if (!user) {
                        user = await this.userModel.findOne({ email: snapFoodUser.email });
                    }

                    // Prepare the user data - proper handling of fullName
                    const fullName = snapFoodUser.full_name || '';
                    let firstName = '';
                    let lastName = '-'; // Default surname to prevent validation errors

                    // Split the full name and ensure there's always a surname
                    const nameParts = fullName.split(' ');
                    if (nameParts.length > 0) {
                        firstName = nameParts[0] || '';
                        if (nameParts.length > 1) {
                            lastName = nameParts.slice(1).join(' ');
                        }
                    }

                    // Create metadata as a plain object with proper typing
                    const metadataObj: {
                        verified_by_mobile: string;
                        source: string;
                        provider_id: string;
                        created_at: string;
                        legacy_devices?: string;
                        legacy_tokens?: string;
                    } = {
                        verified_by_mobile: snapFoodUser.verified_by_mobile ? 'true' : 'false',
                        source: snapFoodUser.source || 'unknown',
                        provider_id: snapFoodUser.provider_id?.toString() || '',
                        created_at: snapFoodUser.created_at || new Date().toISOString()
                    };

                    // Add device information to metadata if available
                    if (snapFoodUser.devices && snapFoodUser.devices.length > 0) {
                        metadataObj.legacy_devices = JSON.stringify(snapFoodUser.devices);
                    }

                    // Add legacy tokens
                    if (snapFoodUser.tokens && snapFoodUser.tokens.length > 0) {
                        metadataObj.legacy_tokens = JSON.stringify(snapFoodUser.tokens);
                    }

                    if (user) {
                        // Update existing user with proper approach to avoid conflicts
                        await this.userModel.findByIdAndUpdate(
                            user._id,
                            {
                                $set: {
                                    name: firstName,
                                    surname: lastName || '-',
                                    email: snapFoodUser.email,
                                    registrationSource: RegistrationSource.SNAPFOOD,
                                    external_ids: {
                                        snapFoodId: snapFoodIdNumeric, // Store as a number instead of string
                                        ...(snapFoodUser.external_ids || {})
                                    },
                                    metadata: metadataObj,
                                    isActive: !!snapFoodUser.active
                                },
                                // Handle client_ids correctly to avoid conflict
                                $addToSet: { client_ids: clientId }
                            }
                        );

                        // Update SnapFood with the OmniStack ID if not already there
                        if (!snapFoodUser.external_ids?.omniStackGateway) {
                            await this.snapfoodService.updateUserExternalId(
                                snapFoodUser.id,
                                user._id.toString()
                            );
                        }

                        updated++;
                    } else {
                        // Create new user with proper name/surname
                        const newUser = new this.userModel({
                            name: firstName,
                            surname: lastName || '-', // Now guaranteed to have a value
                            email: snapFoodUser.email,
                            registrationSource: RegistrationSource.SNAPFOOD,
                            external_ids: {
                                snapFoodId: snapFoodIdNumeric, // Store as a number instead of string
                                ...(snapFoodUser.external_ids || {})
                            },
                            metadata: metadataObj,
                            isActive: !!snapFoodUser.active,
                            client_ids: [clientId],
                            password: 'IMPORTED_USER_' + Math.random().toString(36).substring(2),
                        });

                        await newUser.save();

                        // Update SnapFood with the OmniStack ID
                        await this.snapfoodService.updateUserExternalId(
                            snapFoodUser.id,
                            newUser._id.toString()
                        );

                        created++;
                    }
                } catch (error) {
                    const errorMsg = `Error processing user: ${error.message}`;
                    this.logger.error(`Error processing user ${snapFoodUser.id}: ${error.message}`);
                    errorDetails.push({ userId: snapFoodUser.id.toString(), error: errorMsg });
                    errors++;
                }
            }

            return {
                success: true,
                message: `Sync completed: ${created} created, ${updated} updated, ${skipped} skipped, ${errors} errors`,
                created,
                updated,
                skipped,
                errors,
                errorDetails
            };
        } catch (error) {
            this.logger.error(`Error syncing SnapFood users: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Get all users registered via SnapFood
     *
     * @param clientId The MongoDB ID of the client
     * @param options Pagination and search options
     * @returns Paginated list of SnapFood users
     */
    async getSnapfoodUsers(clientId: string, options: {
        page: number;
        limit: number;
        search?: string;
        sort?: string;
    }): Promise<{
        data: any[];
        meta: {
            total: number;
            page: number;
            limit: number;
            pages: number;
        }
    }> {
        try {
            const { page = 1, limit = 10, search, sort = '-external_ids.snapFoodId' } = options;
            const skip = (page - 1) * limit;

            // Build the query to find SnapFood users
            const query: any = {
                client_ids: clientId,
                registrationSource: RegistrationSource.SNAPFOOD
            };

            // Add search condition if provided
            if (search) {
                query.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { surname: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    // Since snapFoodId is now a number, we need to handle search differently
                    ...(isNaN(parseInt(search, 10)) ? [] : [{ 'external_ids.snapFoodId': parseInt(search, 10) }])
                ];
            }

            // Create a sort configuration object
            let sortConfig = {};
            if (sort.startsWith('-')) {
                // Descending sort
                sortConfig[sort.substring(1)] = -1;
            } else {
                // Ascending sort
                sortConfig[sort] = 1;
            }

            // Count total users matching criteria
            const total = await this.userModel.countDocuments(query);

            // Calculate total pages
            const pages = Math.ceil(total / limit);

            // Fetch users with pagination and sorting
            const users = await this.userModel
                .find(query)
                .select('-password')
                .sort(sortConfig)
                .skip(skip)
                .limit(limit)
                .exec();

            return {
                data: users,
                meta: {
                    total,
                    page,
                    limit,
                    pages
                }
            };
        } catch (error) {
            this.logger.error(`Error getting SnapFood users: ${error.message}`, error.stack);
            throw error;
        }
    }
}