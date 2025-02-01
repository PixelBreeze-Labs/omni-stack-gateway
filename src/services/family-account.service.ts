import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
    FamilyAccount,
    FamilyAccountDocument,
    FamilyMember
} from '../schemas/family-account.schema';
import { Customer, CustomerDocument } from '../schemas/customer.schema';
import { Order } from '../schemas/order.schema';
import { Activity } from '../schemas/activity.schema';
import {
    LinkFamilyAccountDto,
    ListFamilyAccountDto,
    UpdateFamilyAccountDto
} from '../dtos/family-account.dto';

// Export FamilyStats so it can be used in method return types.
export interface FamilyStats {
    totalSpent: number;
    memberCount: number;
    recentActivities: Activity[];
    benefitsUsage: any[];
    joinedDate: Date;
    lastActivity: Date;
}

@Injectable()
export class FamilyAccountService {
    constructor(
        @InjectModel(FamilyAccount.name) private familyAccountModel: Model<FamilyAccount>,
        @InjectModel(Customer.name) private customerModel: Model<Customer>,
        @InjectModel(Order.name) private orderModel: Model<Order>,
        @InjectModel(Activity.name) private activityModel: Model<Activity>
    ) {}

    async link(linkDto: LinkFamilyAccountDto & { clientId: string }) {
        // Verify main customer exists and belongs to client
        const mainCustomer = await this.customerModel.findOne({
            _id: linkDto.mainCustomerId,
            clientIds: linkDto.clientId // Note: Ensure your customer documents have an array in clientIds
        });

        if (!mainCustomer) {
            throw new NotFoundException('Main customer not found');
        }

        // Verify all members exist and belong to client
        const memberIds = linkDto.members.map(m => m.customerId);
        const members = await this.customerModel.find({
            _id: { $in: memberIds },
            clientIds: linkDto.clientId
        });

        if (members.length !== memberIds.length) {
            throw new BadRequestException('One or more members not found');
        }

        const existingAccount = await this.familyAccountModel.findOne({
            clientId: linkDto.clientId,
            $or: [
                { mainCustomerId: linkDto.mainCustomerId },
                { 'members.customerId': linkDto.mainCustomerId }
            ]
        });

        if (existingAccount) {
            throw new BadRequestException('Customer is already part of a family account');
        }

        const familyAccount = new this.familyAccountModel({
            clientId: linkDto.clientId,
            mainCustomerId: linkDto.mainCustomerId,
            members: linkDto.members.map(m => ({
                ...m,
                joinDate: new Date(),
                status: 'ACTIVE'
            })),
            sharedBenefits: linkDto.sharedBenefits || [],
            status: 'ACTIVE',
            lastActivity: new Date(),
            totalSpent: 0
        });

        return familyAccount.save();
    }

    async findAll(query: ListFamilyAccountDto & { clientId: string }) {
        const { clientId, search, status, page = 1, limit = 10 } = query;
        const skip = (page - 1) * limit;

        const filters: any = { clientId };

        if (status && status !== 'ALL') {
            filters.status = status;
        }

        if (search) {
            const customerIds = await this.customerModel.find({
                clientIds: clientId,
                $or: [
                    { firstName: new RegExp(search, 'i') },
                    { lastName: new RegExp(search, 'i') },
                    { email: new RegExp(search, 'i') }
                ]
            }).distinct('_id');

            filters.$or = [
                { mainCustomerId: { $in: customerIds } },
                { 'members.customerId': { $in: customerIds } }
            ];
        }

        const [items, total] = await Promise.all([
            this.familyAccountModel
                .find(filters)
                .populate({
                    path: 'mainCustomerId',
                    match: { clientIds: clientId }
                })
                .populate({
                    path: 'members.customerId',
                    match: { clientIds: clientId }
                })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            this.familyAccountModel.countDocuments(filters)
        ]);

        const metrics = await this.getMetrics(clientId);

        return {
            items: items.map(item => item.toObject()),
            total,
            pages: Math.ceil(total / limit),
            page,
            limit,
            metrics
        };
    }

    private async getMetrics(clientId: string) {
        const [totalFamilies, activeAccounts] = await Promise.all([
            this.familyAccountModel.countDocuments({ clientId }),
            this.familyAccountModel.countDocuments({ clientId, status: 'ACTIVE' })
        ]);

        const families = await this.familyAccountModel.find({ clientId });
        const linkedMembers = families.reduce((acc, family) =>
            acc + (family.members?.length || 0), 0);

        const averageSize = totalFamilies > 0 ? linkedMembers / totalFamilies : 0;
        const familySpendingMultiplier = 1;
        // const familySpendingMultiplier = await this.calculateSpendingMultiplier(clientId);

        return {
            totalFamilies,
            activeAccounts,
            linkedMembers,
            averageSize,
            familySpendingMultiplier
        };
    }

    async findOne(id: string, clientId: string): Promise<FamilyAccountDocument & { stats: FamilyStats }> {
        const family = await this.familyAccountModel
            .findOne({ _id: id, clientId })
            .populate('mainCustomerId')
            .populate('members.customerId');

        if (!family) {
            throw new NotFoundException('Family account not found');
        }

        const stats = await this.getFamilyStats(id);
        const familyObject = family.toObject();

        return {
            ...familyObject,
            stats
        } as FamilyAccountDocument & { stats: FamilyStats };
    }

    async getFamilyStats(id: string): Promise<FamilyStats> {
        const family = await this.familyAccountModel
            .findById(id)
            .populate('mainCustomerId')
            .populate('members.customerId');

        if (!family) {
            throw new NotFoundException('Family account not found');
        }

        const customerObjectIds = [
            new Types.ObjectId(family.mainCustomerId.toString()),
            ...family.members.map(m => new Types.ObjectId(m.customerId.toString()))
        ];

        const [totalSpent] = await this.orderModel.aggregate([
            {
                $match: {
                    customerId: { $in: customerObjectIds },
                    clientId: family.clientId,
                    status: 'COMPLETED'
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$total' }
                }
            }
        ]);

        const recentActivities = await this.activityModel
            .find({
                clientId: family.clientId,
                customerId: { $in: customerObjectIds }
            })
            .sort({ createdAt: -1 })
            .limit(5);

        return {
            totalSpent: totalSpent?.total || 0,
            memberCount: family.members.length + 1,
            recentActivities,
            benefitsUsage: [],
            joinedDate: family.createdAt,
            lastActivity: family.lastActivity
        };
    }

    async update(id: string, clientId: string, updateDto: UpdateFamilyAccountDto) {
        const family = await this.familyAccountModel.findOne({ _id: id, clientId });
        if (!family) {
            throw new NotFoundException('Family account not found');
        }

        if (updateDto.members) {
            const memberIds = updateDto.members.map(m => m.customerId);
            const members = await this.customerModel.find({
                _id: { $in: memberIds },
                clientId
            });
            if (members.length !== memberIds.length) {
                throw new BadRequestException('One or more members not found');
            }
        }

        const updated = await this.familyAccountModel.findByIdAndUpdate(
            id,
            {
                $set: {
                    ...updateDto,
                    lastActivity: new Date()
                }
            },
            { new: true }
        )
            .populate('mainCustomerId')
            .populate('members.customerId');

        return updated;
    }

    async unlink(id: string, memberId: string, clientId: string) {
        const family = await this.familyAccountModel.findOne({ _id: id, clientId });
        if (!family) {
            throw new NotFoundException('Family account not found');
        }
        if (family.mainCustomerId.toString() === memberId) {
            throw new BadRequestException('Cannot unlink main customer');
        }
        const updated = await this.familyAccountModel.findByIdAndUpdate(
            id,
            {
                $pull: { members: { customerId: memberId } },
                $set: { lastActivity: new Date() }
            },
            { new: true }
        );
        if (!updated.members.length) {
            updated.status = 'INACTIVE';
            await updated.save();
        }
        return updated;
    }
}
