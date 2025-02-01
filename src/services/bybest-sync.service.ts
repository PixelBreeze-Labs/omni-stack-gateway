// src/services/bybest-sync.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { lastValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';

import { User } from '../schemas/user.schema';
import { Customer } from '../schemas/customer.schema';
import { Member } from '../schemas/member.schema';

@Injectable()
export class ByBestSyncService {
    private readonly logger = new Logger(ByBestSyncService.name);
    private readonly bybestBaseUrl: string;
    private readonly bybestApiKey: string;
    private readonly bybestClientId: string;

    constructor(
        @InjectModel(User.name) private userModel: Model<User>,
        @InjectModel(Customer.name) private customerModel: Model<Customer>,
        @InjectModel(Member.name) private memberModel: Model<Member>,
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.bybestBaseUrl = this.configService.get<string>('bybest.baseUrl');
        this.bybestApiKey = this.configService.get<string>('bybest.apiKey');
        this.bybestClientId = this.configService.get<string>('bybest.clientId');
    }

    // Helper function to mimic PHP's validateDate
    validateDate(
        date: any,
        type: 'regular' | 'birthday' = 'regular',
        fallbackDate?: Date,
    ): Date | null {
        if (type === 'birthday' && (!date || date === '0000-00-00 00:00:00')) {
            return null;
        }
        if (date === '0000-00-00 00:00:00') {
            return fallbackDate || new Date();
        }
        const parsed = new Date(date);
        if (isNaN(parsed.getTime())) {
            return type === 'birthday' ? null : fallbackDate || new Date();
        }
        if (type !== 'birthday' && parsed.getFullYear() <= 1970) {
            return fallbackDate || new Date();
        }
        return parsed;
    }

    async syncUsersFromBB(): Promise<any> {
        try {
            // STEP 1: Remove any previously synced data (using external_ids and metadata)
            const usersToDelete = await this.userModel.find({
                $or: [
                    { 'external_ids.oldPlatformUserId': { $exists: true, $ne: null } },
                    { 'metadata.oldPlatformMemberCode': { $exists: true, $ne: '' } },
                ],
            }).exec();

            const userIds = usersToDelete.map(u => u._id.toString());

            await this.customerModel.deleteMany({ userId: { $in: userIds } }).exec();
            await this.memberModel.deleteMany({ userId: { $in: userIds } }).exec();
            await this.userModel.deleteMany({ _id: { $in: userIds } }).exec();

            // STEP 2: Begin syncing from the ByBest API
            let page = 1;
            const perPage = 100;
            let syncedCount = 0;
            let skippedCount = 0;
            let memberCount = 0;
            const duplicateErrors = [];
            const otherErrors = [];

            // Get the first page to determine total users
            const initialResponse$ = this.httpService.get(this.bybestBaseUrl, {
                params: { page, per_page: perPage },
                headers: { 'X-App-Key': this.bybestApiKey },
            });
            const initialResponse = await lastValueFrom(initialResponse$);

            if (initialResponse.status !== 200) {
                throw new Error('Failed to fetch data from old system');
            }

            const totalUsers = initialResponse.data.total;
            const totalPages = Math.ceil(totalUsers / perPage);

            while (page <= totalPages) {
                let response;
                if (page === 1) {
                    response = initialResponse;
                } else {
                    const resp$ = this.httpService.get(this.bybestBaseUrl, {
                        params: { page, per_page: perPage },
                        headers: { 'X-App-Key': this.bybestApiKey },
                    });
                    response = await lastValueFrom(resp$);
                    if (response.status !== 200) {
                        throw new Error(`Failed to fetch data from old system on page ${page}`);
                    }
                }

                const userData = response.data.data;
                if (!userData || userData.length === 0) {
                    this.logger.warn(`Empty data received on page ${page}`);
                    break;
                }

                for (const oldUser of userData) {
                    try {
                        // Skip if a user with the same email already exists
                        const existingUser = await this.userModel.findOne({ email: oldUser.email }).exec();
                        if (existingUser) {
                            skippedCount++;
                            continue;
                        }

                        // Create a new User document
                        const user = await this.syncUser(oldUser);

                        // Create the associated Customer document
                        await this.syncCustomer(user, oldUser);

                        // Create a Member document if a member code is provided
                        if (oldUser.bb_member_code && oldUser.bb_member_code !== '') {
                            await this.syncMember(user, oldUser);
                            memberCount++;
                        }
                        syncedCount++;
                    } catch (error: any) {
                        const errorData = {
                            email: oldUser.email || 'unknown',
                            old_user_id: oldUser.id || 'unknown',
                            message: error.message,
                            stack: error.stack,
                        };
                        if (error.message.toLowerCase().includes('duplicate')) {
                            duplicateErrors.push({ ...errorData, type: 'duplicate_constraint' });
                        } else {
                            otherErrors.push({ ...errorData, type: 'sync_error' });
                        }
                        this.logger.error('Error syncing user', errorData);
                    }
                }
                this.logger.log(
                    `Processed page ${page} of ${totalPages}. Progress: ${Math.round((page / totalPages) * 100)}%`,
                );
                page++;
            }

            return {
                message: 'Sync completed successfully',
                total_users: totalUsers,
                total_pages: totalPages,
                pages_processed: page - 1,
                deleted_users: userIds.length,
                synced_users: syncedCount,
                skipped_users: skippedCount,
                errors: {
                    duplicate_errors: { count: duplicateErrors.length, details: duplicateErrors },
                    other_errors: { count: otherErrors.length, details: otherErrors },
                },
                synced_members: memberCount,
                total_processed: syncedCount + skippedCount + duplicateErrors.length + otherErrors.length,
            };
        } catch (error: any) {
            this.logger.error('Sync failed', {
                message: error.message,
                stack: error.stack,
            });
            throw new Error(`Sync failed: ${error.message}`);
        }
    }

    async syncUser(oldUser: any): Promise<User> {
        const updatedAt = this.validateDate(oldUser.updated_at);
        const createdAt = this.validateDate(oldUser.created_at, 'regular', updatedAt);

        const userDoc = new this.userModel({
            // Combine first name and surname into the name field; keep surname separately.
            name: `${oldUser.name} ${oldUser.surname}`,
            surname: oldUser.surname,
            email: oldUser.email,
            password: oldUser.password, // Already hashed
            external_ids: {
                oldPlatformUserId: oldUser.id,
            },
            client_ids: [this.bybestClientId],
            metadata: {
                oldPlatformRegistrationType: oldUser.registrationType,
                gender: oldUser.gender_en || '',
                emailVerifiedAt: oldUser.email_verified_at ? this.validateDate(oldUser.email_verified_at) : null,
            },
            isActive: true,
            createdAt,
            updatedAt,
            // Optionally store deletedAt if present
            deletedAt: oldUser.deleted_at ? this.validateDate(oldUser.deleted_at) : null,
        });
        return await userDoc.save();
    }

    async syncCustomer(user: User, oldUser: any): Promise<Customer> {
        const updatedAt = this.validateDate(oldUser.updated_at);
        const createdAt = this.validateDate(oldUser.created_at, 'regular', updatedAt);

        const customerDoc = new this.customerModel({
            userId: user._id,
            firstName: oldUser.name,
            lastName: oldUser.surname,
            email: oldUser.email,
            phone: oldUser.phone_number || '-',
            status: oldUser.status_id == 3 ? 'ACTIVE' : 'INACTIVE',
            type: oldUser.type ? oldUser.type : 'REGULAR',
            clientIds: [this.bybestClientId],
            isActive: true,
            external_ids: {}, // Add any additional external IDs if needed
            createdAt,
            updatedAt,
        });
        return await customerDoc.save();
    }

    async syncMember(user: User, oldUser: any): Promise<Member> {
        const updatedAt = this.validateDate(oldUser.updated_at);
        const createdAt = this.validateDate(oldUser.created_at, 'regular', updatedAt);
        const birthday = oldUser.bb_member_birthday ? this.validateDate(oldUser.bb_member_birthday, 'birthday') : null;
        const status = oldUser.bb_member_status === 'Aktiv' ? 'accepted' : 'rejected';

        const memberDoc = new this.memberModel({
            userId: user._id,
            firstName: oldUser.name,
            lastName: oldUser.surname,
            email: oldUser.email,
            phoneNumber: oldUser.bb_member_contact || '-',
            birthday: birthday,
            city: oldUser.bb_member_city,
            address: oldUser.bb_member_address,
            // Use an existing member code or generate one if needed
            code: oldUser.member_code || `${oldUser.id}-member`,
            acceptedAt: status === 'accepted' ? new Date() : null,
            isRejected: status === 'rejected',
            rejectedAt: status === 'rejected' ? new Date() : null,
            metadata: {
                oldPlatformMemberCode: oldUser.bb_member_code || '',
            },
            createdAt,
            updatedAt,
        });
        return await memberDoc.save();
    }
}
