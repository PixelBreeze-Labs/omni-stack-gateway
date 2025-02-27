// src/services/staffluent-analytics.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import { RegistrationSource } from '../schemas/user.schema';
import { addMonths, startOfMonth, endOfMonth, format } from 'date-fns';

@Injectable()
export class StaffluentAnalyticsService {
    constructor(
        @InjectModel(Business.name) private businessModel: Model<Business>,
        @InjectModel(User.name) private userModel: Model<User>
    ) {}

    async getBusinessAnalytics(clientId: string, period: string = 'month') {
        // Get the time range based on the period
        const { startDate, endDate, previousStartDate, previousEndDate } = this.getTimeRange(period);

        // Get business metrics
        const newBusinesses = await this.businessModel.countDocuments({
            clientId,
            createdAt: { $gte: startDate, $lte: endDate }
        });

        const previousNewBusinesses = await this.businessModel.countDocuments({
            clientId,
            createdAt: { $gte: previousStartDate, $lte: previousEndDate }
        });

        // Get active businesses
        const activeBusinesses = await this.businessModel.countDocuments({
            clientId,
            isActive: true,
            createdAt: { $lte: endDate }
        });

        const previousActiveBusinesses = await this.businessModel.countDocuments({
            clientId,
            isActive: true,
            createdAt: { $lte: previousEndDate }
        });

        // Calculate MRR (Monthly Recurring Revenue)
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

        // Get subscription status distribution (original method)
        const statusCounts = await this.businessModel.aggregate([
            { $match: { clientId } },
            { $group: { _id: '$subscriptionStatus', count: { $sum: 1 } } }
        ]);

        const statusDistribution = statusCounts.reduce((obj, item) => {
            obj[item._id || 'unknown'] = item.count;
            return obj;
        }, {});

        // Get subscription status distribution for chart
        const subscriptionDistribution = await this.getSubscriptionStatusDistribution(clientId);

        // Get business growth over time (last 6 months)
        const businessGrowth = await this.getBusinessGrowthTrend(clientId);

        return {
            period,
            timeframe: {
                start: startDate,
                end: endDate
            },
            metrics: {
                newBusinesses: {
                    current: newBusinesses,
                    previous: previousNewBusinesses,
                    growth: this.calculateGrowthPercentage(newBusinesses, previousNewBusinesses)
                },
                activeBusinesses: {
                    current: activeBusinesses,
                    previous: previousActiveBusinesses,
                    growth: this.calculateGrowthPercentage(activeBusinesses, previousActiveBusinesses)
                },
                mrr: {
                    value: mrr,
                    currency: 'USD' // Assuming default currency
                }
            },
            statusDistribution,
            subscriptionDistribution,
            businessGrowth
        };
    }

    async getUserAnalytics(clientId: string, period: string = 'month') {
        // Get the time range based on the period
        const { startDate, endDate, previousStartDate, previousEndDate } = this.getTimeRange(period);

        // Get user metrics
        const newUsers = await this.userModel.countDocuments({
            client_ids: clientId,
            createdAt: { $gte: startDate, $lte: endDate }
        });

        const previousNewUsers = await this.userModel.countDocuments({
            client_ids: clientId,
            createdAt: { $gte: previousStartDate, $lte: previousEndDate }
        });

        // Get staff users
        const staffUsers = await this.userModel.countDocuments({
            client_ids: clientId,
            registrationSource: RegistrationSource.STAFFLUENT
        });

        // Get users by registration source (original method)
        const sourceDistribution = await this.userModel.aggregate([
            { $match: { client_ids: clientId } },
            { $group: { _id: '$registrationSource', count: { $sum: 1 } } }
        ]);

        const registrationSources = sourceDistribution.reduce((obj, item) => {
            obj[item._id || 'unknown'] = item.count;
            return obj;
        }, {});

        // Get registration source distribution for chart
        const registrationSourceDistribution = await this.getRegistrationSourceDistribution(clientId);

        // Get user growth over time (last 6 months)
        const userGrowth = await this.getUserGrowthTrend(clientId);

        // Get users with businesses
        const usersWithBusinesses = await this.getUsersWithBusinessesCount(clientId);

        return {
            period,
            timeframe: {
                start: startDate,
                end: endDate
            },
            metrics: {
                newUsers: {
                    current: newUsers,
                    previous: previousNewUsers,
                    growth: this.calculateGrowthPercentage(newUsers, previousNewUsers)
                },
                staffUsers: {
                    total: staffUsers
                },
                usersWithBusinesses
            },
            registrationSources,
            registrationSourceDistribution,
            userGrowth
        };
    }

    private async getBusinessGrowthTrend(clientId: string) {
        const today = new Date();
        const months = [];
        const monthlyData = [];

        // Get last 6 months
        for (let i = 5; i >= 0; i--) {
            const month = startOfMonth(addMonths(today, -i));
            const monthEnd = endOfMonth(month);
            months.push(format(month, 'MMM yyyy'));

            const count = await this.businessModel.countDocuments({
                clientId,
                createdAt: { $lte: monthEnd }
            });

            monthlyData.push({
                month: format(month, 'MMM yyyy'),
                totalBusinesses: count
            });
        }

        return {
            labels: months,
            data: monthlyData
        };
    }

    private async getUserGrowthTrend(clientId: string) {
        const today = new Date();
        const months = [];
        const monthlyData = [];

        // Get last 6 months
        for (let i = 5; i >= 0; i--) {
            const month = startOfMonth(addMonths(today, -i));
            const monthEnd = endOfMonth(month);
            months.push(format(month, 'MMM yyyy'));

            const count = await this.userModel.countDocuments({
                client_ids: clientId,
                createdAt: { $lte: monthEnd }
            });

            monthlyData.push({
                month: format(month, 'MMM yyyy'),
                totalUsers: count
            });
        }

        return {
            labels: months,
            data: monthlyData
        };
    }

    private async getSubscriptionStatusDistribution(clientId: string) {
        // Direct count approach instead of aggregation
        const activeCount = await this.businessModel.countDocuments({
            clientId,
            subscriptionStatus: 'active'
        });

        const trialingCount = await this.businessModel.countDocuments({
            clientId,
            subscriptionStatus: 'trialing'
        });

        const pastDueCount = await this.businessModel.countDocuments({
            clientId,
            subscriptionStatus: 'past_due'
        });

        const canceledCount = await this.businessModel.countDocuments({
            clientId,
            subscriptionStatus: 'canceled'
        });

        const incompleteCount = await this.businessModel.countDocuments({
            clientId,
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

    private async getRegistrationSourceDistribution(clientId: string) {
        // Direct count approach instead of aggregation
        const staffluentCount = await this.userModel.countDocuments({
            client_ids: clientId,
            registrationSource: 'staffluent'
        });

        const metrosuitesCount = await this.userModel.countDocuments({
            client_ids: clientId,
            registrationSource: 'metrosuites'
        });

        const metroshopCount = await this.userModel.countDocuments({
            client_ids: clientId,
            registrationSource: 'metroshop'
        });

        const bookmasterCount = await this.userModel.countDocuments({
            client_ids: clientId,
            registrationSource: 'bookmaster'
        });

        const trackmasterCount = await this.userModel.countDocuments({
            client_ids: clientId,
            registrationSource: 'trackmaster'
        });

        const manualCount = await this.userModel.countDocuments({
            client_ids: clientId,
            registrationSource: 'manual'
        });

        const otherCount = await this.userModel.countDocuments({
            client_ids: clientId,
            registrationSource: 'other'
        });

        const labels = [];
        const data = [];
        const backgroundColor = [
            '#8884d8', // Purple - staffluent
            '#82ca9d', // Green - metrosuites
            '#ffc658', // Yellow - metroshop
            '#ff8042', // Orange - bookmaster
            '#0088FE', // Blue - trackmaster
            '#00C49F', // Teal - manual
            '#FFBB28'  // Amber - other
        ];

        // Only add sources that have at least one user
        if (staffluentCount > 0) {
            labels.push('Staffluent');
            data.push(staffluentCount);
        }

        if (metrosuitesCount > 0) {
            labels.push('Metrosuites');
            data.push(metrosuitesCount);
        }

        if (metroshopCount > 0) {
            labels.push('Metroshop');
            data.push(metroshopCount);
        }

        if (bookmasterCount > 0) {
            labels.push('Bookmaster');
            data.push(bookmasterCount);
        }

        if (trackmasterCount > 0) {
            labels.push('Trackmaster');
            data.push(trackmasterCount);
        }

        if (manualCount > 0) {
            labels.push('Manual');
            data.push(manualCount);
        }

        if (otherCount > 0) {
            labels.push('Other');
            data.push(otherCount);
        }

        return { labels, data, backgroundColor };
    }

    private async getUsersWithBusinessesCount(clientId: string) {
        // Get unique admin user IDs from businesses
        const adminUserIds = await this.businessModel.distinct('adminUserId', { clientId });

        // Count users with businesses as admin
        const adminUsersCount = adminUserIds.length;

        // Count users with businesses (both admin and non-admin)
        const businessUserIds = await this.businessModel.distinct('userIds', { clientId });
        const allBusinessUserIds = [...new Set([...adminUserIds, ...businessUserIds])];

        // Total users
        const totalUsersCount = await this.userModel.countDocuments({ client_ids: clientId });

        return {
            total: totalUsersCount,
            withBusinesses: allBusinessUserIds.length,
            percentage: totalUsersCount > 0
                ? Math.round((allBusinessUserIds.length / totalUsersCount) * 100)
                : 0
        };
    }

    private getTimeRange(period: string) {
        const now = new Date();
        let startDate: Date;
        let endDate: Date = now;
        let previousStartDate: Date;
        let previousEndDate: Date;

        switch (period) {
            case 'week':
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 7);
                previousStartDate = new Date(startDate);
                previousStartDate.setDate(startDate.getDate() - 7);
                previousEndDate = new Date(startDate);
                previousEndDate.setDate(previousEndDate.getDate() - 1);
                break;
            case 'month':
                startDate = new Date(now);
                startDate.setMonth(now.getMonth() - 1);
                previousStartDate = new Date(startDate);
                previousStartDate.setMonth(startDate.getMonth() - 1);
                previousEndDate = new Date(startDate);
                previousEndDate.setDate(previousEndDate.getDate() - 1);
                break;
            case 'year':
                startDate = new Date(now);
                startDate.setFullYear(now.getFullYear() - 1);
                previousStartDate = new Date(startDate);
                previousStartDate.setFullYear(startDate.getFullYear() - 1);
                previousEndDate = new Date(startDate);
                previousEndDate.setDate(previousEndDate.getDate() - 1);
                break;
            default:
                startDate = new Date(now);
                startDate.setMonth(now.getMonth() - 1);
                previousStartDate = new Date(startDate);
                previousStartDate.setMonth(startDate.getMonth() - 1);
                previousEndDate = new Date(startDate);
                previousEndDate.setDate(previousEndDate.getDate() - 1);
        }

        return { startDate, endDate, previousStartDate, previousEndDate };
    }

    private calculateGrowthPercentage(current: number, previous: number): number {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
    }
}