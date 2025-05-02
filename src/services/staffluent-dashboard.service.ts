// src/services/staffluent-dashboard.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import { subMonths, format } from 'date-fns';

@Injectable()
export class StaffluentDashboardService {
    constructor(
        @InjectModel(Business.name) private businessModel: Model<Business>,
        @InjectModel(User.name) private userModel: Model<User>
    ) {}

    async getDashboardSummary(clientId: string) {
        // Base filter to exclude soft-deleted businesses
        const baseBusinessFilter = { 
            clientId, 
            isDeleted: { $ne: true } 
        };

        // Get total counts (excluding soft-deleted businesses)
        const totalBusinesses = await this.businessModel.countDocuments(baseBusinessFilter);
        
        // User filter to exclude soft-deleted users
        const baseUserFilter = { 
            client_ids: clientId,
            isDeleted: { $ne: true }
        };
        
        const totalUsers = await this.userModel.countDocuments(baseUserFilter);

        // Get active subscriptions count
        const activeSubscriptions = await this.businessModel.countDocuments({
            ...baseBusinessFilter,
            subscriptionStatus: 'active'
        });

        // Get trial subscriptions count
        const trialSubscriptions = await this.businessModel.countDocuments({
            ...baseBusinessFilter,
            subscriptionStatus: 'trialing'
        });

        // Get businesses with past due subscriptions
        const pastDueSubscriptions = await this.businessModel.countDocuments({
            ...baseBusinessFilter,
            subscriptionStatus: 'past_due'
        });

        // Get recently added businesses (last 30 days)
        const thirtyDaysAgo = subMonths(new Date(), 1);
        const newBusinesses = await this.businessModel.countDocuments({
            ...baseBusinessFilter,
            createdAt: { $gte: thirtyDaysAgo }
        });

        // Calculate growth percentage
        const previousMonthDate = subMonths(thirtyDaysAgo, 1);
        const previousMonthBusinesses = await this.businessModel.countDocuments({
            ...baseBusinessFilter,
            createdAt: { $gte: previousMonthDate, $lt: thirtyDaysAgo }
        });

        // Calculate growth percentages
        const businessGrowth = this.calculateGrowthPercentage(newBusinesses, previousMonthBusinesses);

        // Get recent businesses
        const recentBusinesses = await this.businessModel.find(baseBusinessFilter)
            .sort({ createdAt: -1 })
            .limit(5)
            .populate({
                path: 'adminUserId',
                select: 'name surname email',
                match: { isDeleted: { $ne: true } } // Only populate non-deleted users
            })
            .select('name email type isActive subscriptionStatus createdAt');

        // Get MRR
        const businessesWithSubscription = await this.businessModel.find({
            ...baseBusinessFilter,
            subscriptionStatus: 'active',
            'subscriptionDetails.amount': { $exists: true }
        });

        const mrr = businessesWithSubscription.reduce((total, business) => {
            if (!business.subscriptionDetails) return total;

            // Convert to monthly value if yearly subscription
            let monthlyAmount = business.subscriptionDetails.amount;
            if (business.subscriptionDetails.interval === 'year') {
                monthlyAmount = business.subscriptionDetails.amount / 12;
            }
            return total + monthlyAmount;
        }, 0);

        // Get new users (last 30 days)
        const newUsers = await this.userModel.countDocuments({
            ...baseUserFilter,
            createdAt: { $gte: thirtyDaysAgo }
        });

        const previousMonthUsers = await this.userModel.countDocuments({
            ...baseUserFilter,
            createdAt: { $gte: previousMonthDate, $lt: thirtyDaysAgo }
        });

        const userGrowth = this.calculateGrowthPercentage(newUsers, previousMonthUsers);

        // Get recent users
        const recentUsers = await this.userModel.find(baseUserFilter)
            .sort({ createdAt: -1 })
            .limit(5)
            .select('name surname email registrationSource createdAt');

        // Generate monthly business growth data for the chart
        const monthlyBusinessGrowth = await this.getMonthlyBusinessGrowth(clientId);

        // Generate monthly user growth data for the chart
        const monthlyUserGrowth = await this.getMonthlyUserGrowth(clientId);

        // Generate subscription status distribution
        const subscriptionStatusDistribution = await this.getSubscriptionStatusDistribution(clientId);

        return {
            summary: {
                businesses: {
                    total: totalBusinesses,
                    new: newBusinesses,
                    growth: businessGrowth
                },
                users: {
                    total: totalUsers,
                    new: newUsers,
                    growth: userGrowth
                },
                subscriptions: {
                    active: activeSubscriptions,
                    trial: trialSubscriptions,
                    pastDue: pastDueSubscriptions,
                    mrr: {
                        value: mrr,
                        currency: 'USD' // Assuming default currency
                    }
                }
            },
            recentData: {
                businesses: recentBusinesses,
                users: recentUsers
            },
            charts: {
                businessGrowth: monthlyBusinessGrowth,
                userGrowth: monthlyUserGrowth,
                subscriptionDistribution: subscriptionStatusDistribution
            }
        };
    }

    private async getMonthlyBusinessGrowth(clientId: string) {
        const months = 6; // Last 6 months
        const labels = [];
        const data = [];
        
        // Base filter to exclude soft-deleted businesses
        const baseFilter = { 
            clientId, 
            isDeleted: { $ne: true } 
        };

        for (let i = months - 1; i >= 0; i--) {
            const date = subMonths(new Date(), i);
            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

            const monthLabel = format(date, 'MMM');
            labels.push(monthLabel);

            const count = await this.businessModel.countDocuments({
                ...baseFilter,
                createdAt: { $gte: monthStart, $lte: monthEnd }
            });

            data.push(count);
        }

        return { labels, data };
    }

    private async getMonthlyUserGrowth(clientId: string) {
        const months = 6; // Last 6 months
        const labels = [];
        const data = [];
        
        // Base filter to exclude soft-deleted users
        const baseFilter = { 
            client_ids: clientId,
            isDeleted: { $ne: true }
        };

        for (let i = months - 1; i >= 0; i--) {
            const date = subMonths(new Date(), i);
            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

            const monthLabel = format(date, 'MMM');
            labels.push(monthLabel);

            const count = await this.userModel.countDocuments({
                ...baseFilter,
                createdAt: { $gte: monthStart, $lte: monthEnd }
            });

            data.push(count);
        }

        return { labels, data };
    }

    private async getSubscriptionStatusDistribution(clientId: string) {
        // Base filter to exclude soft-deleted businesses
        const baseFilter = { 
            clientId, 
            isDeleted: { $ne: true } 
        };
        
        // Direct count approach instead of aggregation
        const activeCount = await this.businessModel.countDocuments({
            ...baseFilter,
            subscriptionStatus: 'active'
        });

        const trialingCount = await this.businessModel.countDocuments({
            ...baseFilter,
            subscriptionStatus: 'trialing'
        });

        const pastDueCount = await this.businessModel.countDocuments({
            ...baseFilter,
            subscriptionStatus: 'past_due'
        });

        const canceledCount = await this.businessModel.countDocuments({
            ...baseFilter,
            subscriptionStatus: 'canceled'
        });

        const incompleteCount = await this.businessModel.countDocuments({
            ...baseFilter,
            subscriptionStatus: 'incomplete'
        });

        const labels = [];
        const data = [];
        const backgroundColor = [
            '#4CAF50', // active - green
            '#2196F3', // trialing - blue
            '#FFC107', // past_due - amber
            '#F44336', // canceled - red
            '#9E9E9E'  // incomplete - grey
        ];

        // Only add statuses that have at least one business
        if (activeCount > 0) {
            labels.push('Active');
            data.push(activeCount);
        }

        if (trialingCount > 0) {
            labels.push('Trial');
            data.push(trialingCount);
        }

        if (pastDueCount > 0) {
            labels.push('Past Due');
            data.push(pastDueCount);
        }

        if (canceledCount > 0) {
            labels.push('Canceled');
            data.push(canceledCount);
        }

        if (incompleteCount > 0) {
            labels.push('Incomplete');
            data.push(incompleteCount);
        }

        return { labels, data, backgroundColor };
    }

    private calculateGrowthPercentage(current: number, previous: number): number {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
    }
}