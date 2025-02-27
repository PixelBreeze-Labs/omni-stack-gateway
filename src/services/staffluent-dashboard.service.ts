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
        // Get total counts
        const totalBusinesses = await this.businessModel.countDocuments({ clientId });
        const totalUsers = await this.userModel.countDocuments({ client_ids: clientId });

        // Get active subscriptions count
        const activeSubscriptions = await this.businessModel.countDocuments({
            clientId,
            subscriptionStatus: 'active'
        });

        // Get trial subscriptions count
        const trialSubscriptions = await this.businessModel.countDocuments({
            clientId,
            subscriptionStatus: 'trialing'
        });

        // Get businesses with past due subscriptions
        const pastDueSubscriptions = await this.businessModel.countDocuments({
            clientId,
            subscriptionStatus: 'past_due'
        });

        // Get recently added businesses (last 30 days)
        const thirtyDaysAgo = subMonths(new Date(), 1);
        const newBusinesses = await this.businessModel.countDocuments({
            clientId,
            createdAt: { $gte: thirtyDaysAgo }
        });

        // Calculate growth percentage
        const previousMonthDate = subMonths(thirtyDaysAgo, 1);
        const previousMonthBusinesses = await this.businessModel.countDocuments({
            clientId,
            createdAt: { $gte: previousMonthDate, $lt: thirtyDaysAgo }
        });

        // Calculate growth percentages
        const businessGrowth = this.calculateGrowthPercentage(newBusinesses, previousMonthBusinesses);

        // Get recent businesses
        const recentBusinesses = await this.businessModel.find({ clientId })
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('adminUserId', 'name surname email')
            .select('name email type isActive subscriptionStatus createdAt');

        // Get MRR
        const businessesWithSubscription = await this.businessModel.find({
            clientId,
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
            client_ids: clientId,
            createdAt: { $gte: thirtyDaysAgo }
        });

        const previousMonthUsers = await this.userModel.countDocuments({
            client_ids: clientId,
            createdAt: { $gte: previousMonthDate, $lt: thirtyDaysAgo }
        });

        const userGrowth = this.calculateGrowthPercentage(newUsers, previousMonthUsers);

        // Get recent users
        const recentUsers = await this.userModel.find({ client_ids: clientId })
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

        for (let i = months - 1; i >= 0; i--) {
            const date = subMonths(new Date(), i);
            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

            const monthLabel = format(date, 'MMM');
            labels.push(monthLabel);

            const count = await this.businessModel.countDocuments({
                clientId,
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

        for (let i = months - 1; i >= 0; i--) {
            const date = subMonths(new Date(), i);
            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

            const monthLabel = format(date, 'MMM');
            labels.push(monthLabel);

            const count = await this.userModel.countDocuments({
                client_ids: clientId,
                createdAt: { $gte: monthStart, $lte: monthEnd }
            });

            data.push(count);
        }

        return { labels, data };
    }

    private async getSubscriptionStatusDistribution(clientId: string) {
        const statusCounts = await this.businessModel.aggregate([
            { $match: { clientId } },
            { $group: { _id: '$subscriptionStatus', count: { $sum: 1 } } }
        ]);

        const labels = [];
        const data = [];
        const backgroundColor = [
            '#4CAF50', // active - green
            '#2196F3', // trialing - blue
            '#FFC107', // past_due - amber
            '#F44336', // canceled - red
            '#9E9E9E'  // incomplete - grey
        ];

        // Map status labels to user-friendly names
        const statusMap = {
            'active': 'Active',
            'trialing': 'Trial',
            'past_due': 'Past Due',
            'canceled': 'Canceled',
            'incomplete': 'Incomplete'
        };

        statusCounts.forEach(item => {
            const status = item._id || 'unknown';
            labels.push(statusMap[status] || status);
            data.push(item.count);
        });

        return { labels, data, backgroundColor };
    }

    private calculateGrowthPercentage(current: number, previous: number): number {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
    }
}