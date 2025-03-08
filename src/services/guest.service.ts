import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Guest } from '../schemas/guest.schema';
import { Client } from '../schemas/client.schema';
import { ListGuestDto } from '../dtos/guest.dto';
import { GuestListResponse, GuestMetrics, GuestResponse } from '../types/guest.types';
import { User } from '../schemas/user.schema';

@Injectable()
export class GuestService {
    private readonly logger = new Logger(GuestService.name);

    constructor(
        @InjectModel(Guest.name) private guestModel: Model<Guest>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        @InjectModel(User.name) private userModel: Model<User>,
    ) {}

    private async getConnectedClientIds(clientIds: string[]): Promise<string[]> {
        const connectedClientIds = new Set<string>(clientIds);

        for (const clientId of clientIds) {
            const client = await this.clientModel.findById(clientId);
            if (client?.venueBoostConnection?.venueShortCode) {
                const connectedClients = await this.clientModel.find({
                    'venueBoostConnection.venueShortCode': client.venueBoostConnection.venueShortCode,
                    'venueBoostConnection.status': 'connected'
                });
                connectedClients.forEach(cc => connectedClientIds.add(cc._id.toString()));
            }
        }

        return Array.from(connectedClientIds);
    }

    async findAll(query: ListGuestDto & { clientIds: string[] }): Promise<GuestListResponse> {
        const { clientIds, search, limit = 10, page = 1, status, source } = query;
        const skip = (page - 1) * limit;

        // Get all connected client IDs
        const allClientIds = await this.getConnectedClientIds(clientIds);

        // Calculate metrics with all client IDs
        const metrics = await this.calculateMetrics(allClientIds);

        const filters: any = { clientIds: { $in: allClientIds } };

        if (search) {
            filters.$or = [
                { name: new RegExp(search, 'i') },
                { email: new RegExp(search, 'i') },
                { phone: new RegExp(search, 'i') }
            ];
        }

        if (status && status !== 'ALL') {
            filters.isActive = status === 'ACTIVE';
        }

        if (source && source !== 'ALL') {
            // Find users with the specified registration source
            const users = await this.userModel.find({
                registrationSource: source
            }).select('_id');
            const userIds = users.map(user => user._id);
            filters.userId = { $in: userIds };
        }

        const total = await this.guestModel.countDocuments(filters);

        const guests = await this.guestModel.find(filters)
            .populate({
                path: 'userId',
                select: 'registrationSource points totalSpend clientTiers createdAt walletId',
                populate: {
                    path: 'walletId',
                    select: 'balance'
                }
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const transformedGuests: GuestResponse[] = guests.map(guest => {
            const cleanGuest = guest.toObject();
            const user = cleanGuest.userId as any;

            // Get primary client ID
            const primaryClientId = cleanGuest.clientIds && cleanGuest.clientIds.length > 0
                ? cleanGuest.clientIds[0]
                : null;

            return {
                _id: cleanGuest._id.toString(),
                name: cleanGuest.name,
                email: cleanGuest.email,
                phone: cleanGuest.phone || '',
                isActive: cleanGuest.isActive,
                userId: user?._id?.toString() || null,
                clientIds: cleanGuest.clientIds,
                external_ids: cleanGuest.external_ids || {},
                createdAt: cleanGuest.createdAt,
                updatedAt: cleanGuest.updatedAt,
                // User-related populated fields
                source: user?.registrationSource?.toLowerCase(),
                points: user?.points,
                totalSpend: user?.totalSpend,
                membershipTier: (user?.clientTiers && primaryClientId)
                    ? user.clientTiers[primaryClientId]
                    : undefined,
                walletBalance: user?.walletId?.balance
            };
        });

        return {
            items: transformedGuests,
            total,
            pages: Math.ceil(total / limit),
            page,
            limit,
            includedClientIds: allClientIds,
            metrics
        };
    }

    async calculateMetrics(clientIds: string[]): Promise<GuestMetrics> {
        const allClientIds = await this.getConnectedClientIds(clientIds);

        const now = new Date();
        const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const currentMonthGuests = await this.guestModel.find({
            clientIds: { $in: allClientIds },
            createdAt: { $lt: now, $gte: firstDayThisMonth }
        });

        const lastMonthGuests = await this.guestModel.find({
            clientIds: { $in: allClientIds },
            createdAt: { $lt: firstDayThisMonth, $gte: firstDayLastMonth }
        });

        const totalGuests = await this.guestModel.countDocuments({
            clientIds: { $in: allClientIds }
        });

        const activeGuests = await this.guestModel.countDocuments({
            clientIds: { $in: allClientIds },
            isActive: true
        });

        const lastMonthActiveGuests = await this.guestModel.countDocuments({
            clientIds: { $in: allClientIds },
            isActive: true,
            updatedAt: { $lt: firstDayThisMonth, $gte: firstDayLastMonth }
        });

        const guestGrowth = currentMonthGuests.length;
        const guestGrowthPercentage = GuestService.calculateGrowthPercentage(
            currentMonthGuests.length,
            lastMonthGuests.length
        );

        const activeGrowthPercentage = GuestService.calculateGrowthPercentage(
            activeGuests,
            lastMonthActiveGuests
        );

        return {
            totalGuests,
            activeGuests,
            guestGrowth,
            trends: {
                guests: {
                    value: currentMonthGuests.length,
                    percentage: Number(guestGrowthPercentage)
                },
                active: {
                    value: activeGuests,
                    percentage: Number(activeGrowthPercentage)
                }
            }
        };
    }

    private static calculateGrowthPercentage(current: number, previous: number): number {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
    }
}