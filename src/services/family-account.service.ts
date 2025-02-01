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
import {
    ActivityResponse,
    ActivityType,
    FamilyMemberPopulated,
    FamilyStats,
    PopulatedCustomer
} from "../types/family-account.types";
import {BenefitUsage} from "../schemas/benefit-usage.schema";
import {Benefit} from "../schemas/benefit.schema";
import {BenefitUsageResponse} from "../types/benefit.interface";

@Injectable()
export class FamilyAccountService {
    constructor(
        @InjectModel(FamilyAccount.name) private familyAccountModel: Model<FamilyAccount>,
        @InjectModel(Customer.name) private customerModel: Model<Customer>,
        @InjectModel(Order.name) private orderModel: Model<Order>,
        @InjectModel(Activity.name) private activityModel: Model<Activity>,
        @InjectModel(BenefitUsage.name) private benefitUsageModel: Model<BenefitUsage>,
        @InjectModel(Benefit.name) private benefitModel: Model<Benefit>,
    ) {}

    // In FamilyAccountService
    async link(linkDto: LinkFamilyAccountDto & { clientId: string }) {
        // Check if main customer or any members are already in a family
        const existingFamily = await this.familyAccountModel.findOne({
            clientId: linkDto.clientId,
            status: 'ACTIVE',
            $or: [
                { mainCustomerId: new Types.ObjectId(linkDto.mainCustomerId) },
                { 'members.customerId': new Types.ObjectId(linkDto.mainCustomerId) },
                ...linkDto.members.map(m => ({
                    $or: [
                        { mainCustomerId: new Types.ObjectId(m.customerId) },
                        { 'members.customerId': new Types.ObjectId(m.customerId) }
                    ]
                }))
            ]
        });

        if (existingFamily) {
            throw new BadRequestException(
                'One or more customers are already part of a family account'
            );
        }

        // Verify main customer exists and belongs to client
        const mainCustomer = await this.customerModel.findOne({
            _id: linkDto.mainCustomerId,
            clientIds: linkDto.clientId,
            status: 'ACTIVE'
        });

        if (!mainCustomer) {
            throw new NotFoundException('Main customer not found or inactive');
        }

        // Verify all members exist, belong to client, and are active
        const memberIds = linkDto.members.map(m => new Types.ObjectId(m.customerId));
        const members = await this.customerModel.find({
            _id: { $in: memberIds },
            clientIds: linkDto.clientId,
            status: 'ACTIVE'
        });

        if (members.length !== memberIds.length) {
            throw new BadRequestException('One or more members not found or inactive');
        }

        // Create family account
        const familyAccount = new this.familyAccountModel({
            clientId: new Types.ObjectId(linkDto.clientId),
            mainCustomerId: new Types.ObjectId(linkDto.mainCustomerId),
            members: linkDto.members.map(m => ({
                customerId: new Types.ObjectId(m.customerId),
                relationship: m.relationship,
                joinDate: new Date(),
                status: 'ACTIVE'
            })),
            sharedBenefits: linkDto.sharedBenefits?.map(id => new Types.ObjectId(id)) || [],
            status: 'ACTIVE',
            lastActivity: new Date(),
            totalSpent: 0
        });

        const saved = await familyAccount.save();
        return this.familyAccountModel
            .findById(saved._id)
            .populate('mainCustomerId')
            .populate('members.customerId');
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
                status: 'ACTIVE',
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

        let items = await this.familyAccountModel
            .find(filters)
            .populate({
                path: 'mainCustomerId',
                match: {
                    clientIds: clientId,
                    status: 'ACTIVE'
                }
            })
            .populate({
                path: 'members.customerId',
                match: {
                    clientIds: clientId,
                    status: 'ACTIVE'
                }
            })
            .sort({ createdAt: -1 })
            .lean();

        // Filter out families where mainCustomerId is null (deleted or inactive)
        items = items.filter(item => item.mainCustomerId != null);

        // Calculate pagination after filtering
        const total = items.length;
        items = items.slice(skip, skip + limit);

        const metrics = await this.getMetrics(clientId);

        return {
            items,
            total,
            pages: Math.ceil(total / limit),
            page,
            limit,
            metrics
        };
    }

    private async getMetrics(clientId: string) {
        // First, get all family accounts with populated main customer
        const families = await this.familyAccountModel
            .find({ clientId })
            .populate({
                path: 'mainCustomerId',
                match: {
                    clientIds: clientId,
                    status: 'ACTIVE'
                },
                select: 'status'
            })
            .lean();

        // Filter out families where main customer is deleted or inactive
        const validFamilies = families.filter(family => family.mainCustomerId != null);

        const totalFamilies = validFamilies.length;
        const activeAccounts = validFamilies.filter(family => family.status === 'ACTIVE').length;
        const inactiveAccounts = validFamilies.filter(family => family.status === 'INACTIVE').length;

        // Calculate linked members only for valid families
        const linkedMembers = validFamilies.reduce((acc, family) =>
            acc + (family.members?.length || 0), 0);

        const averageSize = totalFamilies > 0 ?
            (linkedMembers + totalFamilies) / totalFamilies : 0; // Add totalFamilies to include main customers

        const familySpendingMultiplier = 1;
        // const familySpendingMultiplier = await this.calculateSpendingMultiplier(clientId);

        return {
            totalFamilies,
            activeAccounts,
            inactiveAccounts,
            linkedMembers,
            averageSize: Number(averageSize.toFixed(1)), // Round to 1 decimal
            familySpendingMultiplier
        };
    }

    async findOne(id: string, clientId: string) {
        const family = await this.familyAccountModel
            .findOne({
                _id: id,
                clientId: new Types.ObjectId(clientId)
            })
            .populate<{ mainCustomerId: PopulatedCustomer }>({
                path: 'mainCustomerId',
                select: 'firstName lastName email avatar status'
            })
            .populate<{ members: FamilyMemberPopulated[] }>({
                path: 'members.customerId',
                select: 'firstName lastName email avatar status'
            })
            .lean();

        if (!family) {
            throw new NotFoundException('Family account not found');
        }

        // Calculate total spent
        const memberCustomerIds = [
            family.mainCustomerId._id,
            ...family.members.map(m => m.customerId._id)
        ];

        const totalSpent = await this.calculateTotalSpent(memberCustomerIds, clientId);

        // Transform the data for frontend
        return {
            ...family,
            totalSpent,
            mainCustomerId: {
                ...family.mainCustomerId,
                avatar: family.mainCustomerId.avatar || null
            },
            members: family.members.map(member => ({
                id: member._id?.toString(),
                customerId: {
                    ...member.customerId,
                    avatar: member.customerId.avatar || null
                },
                status: member.status,
                relationship: member.relationship,
                joinDate: member.joinDate
            })),
            lastActivity: family.lastActivity || family.updatedAt || new Date()
        };
    }


    async getFamilyStats(id: string, clientId: string): Promise<FamilyStats> {
        const family = await this.familyAccountModel
            .findOne({
                _id: id,
                clientId: new Types.ObjectId(clientId)
            })
            .populate<{ mainCustomerId: PopulatedCustomer }>('mainCustomerId')
            .populate<{ members: FamilyMemberPopulated[] }>('members.customerId')
            .lean();

        if (!family) {
            throw new NotFoundException('Family account not found');
        }

        const memberCustomerIds = [
            new Types.ObjectId(family.mainCustomerId._id),
            ...family.members.map(m => new Types.ObjectId(m.customerId._id))
        ];

        const totalSpent = await this.calculateTotalSpent(memberCustomerIds, clientId);
        const recentActivities = await this.getRecentActivities(memberCustomerIds, clientId);
        const benefitsUsage = await this.getBenefitsUsage(memberCustomerIds, clientId);

        return {
            totalSpent,
            memberCount: family.members.length + 1,
            joinedDate: family.createdAt,
            benefitsUsage,
            recentActivities,
            lastActivity: family.lastActivity || new Date()
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
        const family = await this.familyAccountModel.findOne({
            _id: id,
            clientId: new Types.ObjectId(clientId)
        }).populate<{ members: FamilyMemberPopulated[] }>('members.customerId');

        if (!family) {
            throw new NotFoundException('Family account not found');
        }

        if (family.mainCustomerId.toString() === memberId) {
            throw new BadRequestException('Cannot unlink main customer');
        }

        // Check if member exists in family
        const memberExists = family.members.some(member =>
            member.customerId && member.customerId._id?.toString() === memberId
        );

        if (!memberExists) {
            throw new BadRequestException('Member not found in family');
        }

        // Get valid members
        const remainingValidMembers = family.members.filter(member =>
            member.customerId &&
            member.customerId._id?.toString() !== memberId
        );

        // Update family account
        const updated = await this.familyAccountModel.findByIdAndUpdate(
            id,
            {
                $pull: {
                    members: {
                        customerId: new Types.ObjectId(memberId)
                    }
                },
                $set: {
                    lastActivity: new Date(),
                    status: remainingValidMembers.length === 0 ? 'INACTIVE' : family.status
                }
            },
            {
                new: true,
                runValidators: true
            }
        ).populate<{ members: FamilyMemberPopulated[] }>({
            path: 'members.customerId',
            match: {
                clientIds: clientId,
                status: 'ACTIVE'
            }
        });

        if (!updated) {
            throw new BadRequestException('Failed to unlink member');
        }

        // If the update succeeded but there are no more active members, mark as inactive
        if (updated.members.length === 0) {
            updated.status = 'INACTIVE';
            await updated.save();
        }

        return updated;
    }

    private async calculateTotalSpent(memberIds: Types.ObjectId[], clientId: string): Promise<number> {
        const result = await this.orderModel.aggregate([
            {
                $match: {
                    customerId: { $in: memberIds },
                    clientId: new Types.ObjectId(clientId),
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

        return result[0]?.total || 0;
    }

    private async getRecentActivities(memberIds: Types.ObjectId[], clientId: string): Promise<ActivityResponse[]> {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const orders = await this.orderModel
            .find({
                customerId: { $in: memberIds },
                clientId: new Types.ObjectId(clientId),
                createdAt: { $gte: thirtyDaysAgo }
            })
            .populate('customerId', 'firstName lastName')
            .sort({ createdAt: -1 })
            .lean();

        return orders.map(order => ({
            type: 'ORDER' as ActivityType,
            description: `Order placed by ${(order as any).customerId?.firstName} ${(order as any).customerId?.lastName || 'Unknown'}`,
            date: order.createdAt || new Date(),
            amount: order.total
        }));
    }
    async getBenefitsUsage(memberIds: Types.ObjectId[], clientId: string): Promise<BenefitUsageResponse[]> {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const benefitUsages = await this.benefitUsageModel.aggregate([
            {
                $match: {
                    customerId: { $in: memberIds },
                    clientId: new Types.ObjectId(clientId),
                    usedAt: { $gte: thirtyDaysAgo }
                }
            },
            {
                $lookup: {
                    from: 'benefits',
                    localField: 'benefitId',
                    foreignField: '_id',
                    as: 'benefit'
                }
            },
            {
                $unwind: '$benefit'
            },
            {
                $group: {
                    _id: '$benefitId',
                    name: { $first: '$benefit.name' },
                    type: { $first: '$benefit.type' },
                    usageCount: { $sum: 1 },
                    totalSavings: { $sum: '$savedAmount' }
                }
            }
        ]);

        return benefitUsages.map(usage => ({
            name: usage.name || 'Unknown',
            usageCount: usage.usageCount || 0,
            savings: usage.totalSavings || 0,
            type: usage.type || 'UNKNOWN',
            benefitId: usage._id.toString()
        }));
    }

    // // Helper method to calculate benefit savings for an order
    // async calculateBenefitSavings(
    //     orderId: Types.ObjectId,
    //     benefitId: Types.ObjectId,
    //     orderTotal: number
    // ): Promise<number> {
    //     const benefit = await this.benefitModel.findById(benefitId);
    //     if (!benefit) return 0;
    //
    //     switch (benefit.type) {
    //         case 'DISCOUNT':
    //             // If value is percentage, calculate percentage of total
    //             return benefit.value <= 1 ?
    //                 orderTotal * benefit.value :
    //                 Math.min(benefit.value, orderTotal);
    //
    //         case 'CASHBACK':
    //             // Calculate cashback amount
    //             return benefit.value <= 1 ?
    //                 orderTotal * benefit.value :
    //                 benefit.value;
    //
    //         case 'FREE_SHIPPING':
    //             // Return shipping cost saved (you'd need to get this from the order)
    //             return benefit.value;
    //
    //         case 'POINTS':
    //             // Convert points to monetary value (example conversion rate)
    //             return benefit.value * 0.01;
    //
    //         default:
    //             return 0;
    //     }
    // }

    // // Method to record benefit usage
    // async recordBenefitUsage(
    //     familyAccountId: Types.ObjectId,
    //     customerId: Types.ObjectId,
    //     benefitId: Types.ObjectId,
    //     orderId: Types.ObjectId,
    //     clientId: string,
    //     savedAmount: number
    // ): Promise<BenefitUsage> {
    //     const benefitUsage = new this.benefitUsageModel({
    //         familyAccountId,
    //         customerId,
    //         benefitId,
    //         orderId,
    //         clientId: new Types.ObjectId(clientId),
    //         savedAmount,
    //         usedAt: new Date()
    //     });
    //
    //     return benefitUsage.save();
    // }

    // Method to get available benefits for a family
    async getFamilyBenefits(familyAccountId: string, clientId: string) {
        const family = await this.familyAccountModel
            .findOne({
                _id: familyAccountId,
                clientId: new Types.ObjectId(clientId)
            })
            .populate('sharedBenefits')
            .lean();

        if (!family) {
            throw new NotFoundException('Family account not found');
        }

        return family.sharedBenefits;
    }

    // In FamilyAccountService
    async searchCustomers(query: string, clientId: string) {
        // First, get all customers that match the search criteria
        const customers = await this.customerModel.find({
            clientIds: clientId,
            status: 'ACTIVE',
            $or: [
                { firstName: new RegExp(query, 'i') },
                { lastName: new RegExp(query, 'i') },
                { email: new RegExp(query, 'i') }
            ]
        }).lean();

        // Get all customer IDs that are already in families
        const familyAccounts = await this.familyAccountModel.find({
            clientId,
            status: 'ACTIVE'
        });

        const existingFamilyMemberIds = new Set(
            familyAccounts.flatMap(family => [
                family.mainCustomerId.toString(),
                ...family.members.map(m => m.customerId.toString())
            ])
        );

        // Filter out customers who are already in families
        return customers.filter(customer =>
            !existingFamilyMemberIds.has(customer._id.toString())
        );
    }
}
