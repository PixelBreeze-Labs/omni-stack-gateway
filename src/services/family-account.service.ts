// src/services/family-account.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FamilyAccount } from '../schemas/family-account.schema';
import {
    LinkFamilyAccountDto,
    ListFamilyAccountDto,
    UpdateFamilyAccountDto
} from '../dtos/family-account.dto';

@Injectable()
export class FamilyAccountService {
    constructor(
        @InjectModel(FamilyAccount.name) private familyAccountModel: Model<FamilyAccount>
    ) {}

    async link(linkDto: LinkFamilyAccountDto & { clientId: string }) {
        const familyAccount = new this.familyAccountModel({
            ...linkDto,
            status: 'Active'
        });
        return familyAccount.save();
    }

    async findAll(query: ListFamilyAccountDto & { clientId: string }) {
        const { clientId, search, limit = 10, page = 1, status } = query;
        const skip = (page - 1) * limit;

        // Build filters
        const filters: any = { clientId };

        if (search) {
            filters.$or = [
                { name: new RegExp(search, 'i') },
                { email: new RegExp(search, 'i') }
            ];
        }

        if (status) {
            filters.status = status;
        }

        // Get total count for pagination
        const total = await this.familyAccountModel.countDocuments(filters);
        const totalPages = Math.ceil(total / limit);

        // Get paginated results
        const items = await this.familyAccountModel
            .find(filters)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Calculate metrics
        const metrics = await this.calculateMetrics(clientId);

        return {
            items,
            total,
            pages: totalPages,
            page,
            limit,
            metrics
        };
    }

    private async calculateMetrics(clientId: string) {
        const [totalAccounts, metrics] = await Promise.all([
            this.familyAccountModel.countDocuments({ clientId }),
            this.familyAccountModel.aggregate([
                { $match: { clientId } },
                {
                    $group: {
                        _id: null,
                        totalPurchases: { $sum: '$totalPurchases' },
                        loyaltyPoints: { $sum: '$loyaltyPoints' }
                    }
                }
            ])
        ]);

        const { totalPurchases = 0, loyaltyPoints = 0 } = metrics[0] || {};

        return {
            linkedAccounts: totalAccounts,
            totalPurchases,
            loyaltyPoints
        };
    }

    async findOne(id: string, clientId: string) {
        const account = await this.familyAccountModel.findOne({ _id: id, clientId });
        if (!account) {
            throw new NotFoundException('Family account not found');
        }
        return account;
    }

    async update(id: string, clientId: string, updateDto: UpdateFamilyAccountDto) {
        const account = await this.familyAccountModel.findOneAndUpdate(
            { _id: id, clientId },
            { $set: updateDto },
            { new: true }
        );

        if (!account) {
            throw new NotFoundException('Family account not found');
        }

        return account;
    }

    async unlink(id: string, clientId: string) {
        const result = await this.familyAccountModel.findOneAndDelete({ _id: id, clientId });
        if (!result) {
            throw new NotFoundException('Family account not found');
        }
    }
}