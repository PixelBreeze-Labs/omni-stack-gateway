import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { SnapfoodService } from './snapfood.service';
import { AIAssistantType, AIQueryContext, AIQueryResponse } from '../types/ai-assistant.types';

interface CountItem {
    count: number;
    [key: string]: any;
}

@Injectable()
export class SnapfoodAIAssistantService {
    private readonly openai: OpenAI;
    private readonly logger = new Logger(SnapfoodAIAssistantService.name);

    constructor(
        private readonly snapfoodService: SnapfoodService,
    ) {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    async query(query: string, context: AIQueryContext): Promise<AIQueryResponse> {
        try {
            const { data, systemPrompt } = await this.getAssistantContext(context);

            const completion = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    { role: "system", content: systemPrompt },
                    {
                        role: "user",
                        content: `Query: ${query}\nContext: ${JSON.stringify(context)}\nData: ${JSON.stringify(data)}`
                    }
                ]
            });

            return {
                answer: completion.choices[0].message?.content || '',
                data: data,
                suggestions: this.generateSuggestions(context.assistantType),
                relatedQueries: this.getRelatedQueries(query, context.assistantType)
            };
        } catch (error) {
            this.logger.error('AI Assistant query failed:', error);
            throw error;
        }
    }

    private async getAssistantContext(context: AIQueryContext): Promise<{ data: any; systemPrompt: string }> {
        const data = await this.gatherContextData(context);
        const systemPrompt = this.getSystemPrompt(context.assistantType);
        return { data, systemPrompt };
    }

    private async gatherContextData(context: AIQueryContext): Promise<any> {
        switch (context.assistantType) {
            case AIAssistantType.CUSTOMER:
                return await this.gatherCustomerData(context);
            case AIAssistantType.SOCIAL:
                return await this.gatherSocialData(context);
            case AIAssistantType.FOOD:
                return await this.gatherFoodData(context);
            case AIAssistantType.SALES:
                return await this.gatherSalesData(context);
            case AIAssistantType.ANALYTICS:
                return await this.gatherAnalyticsData(context);
            case AIAssistantType.ADMIN:
                return await this.gatherAdminData(context);
            default:
                return {};
        }
    }

    private async gatherCustomerData(context: AIQueryContext) {
        if (!context.customerId) {
            return await this.snapfoodService.listCustomers({
                start_date: context.startDate,
                end_date: context.endDate,
                search: context.searchTerm
            });
        }

        const [
            generalInfo,
            orderHistory,
            favoriteItems,
            spendingBehavior,
            orderCustomizations,
            reviewFeedback
        ] = await Promise.all([
            this.snapfoodService.getGeneralInfo(context.customerId),
            this.snapfoodService.getOrderFrequency(context.customerId),
            this.snapfoodService.getFavoriteDishes(context.customerId),
            this.snapfoodService.getAverageOrderValue(context.customerId),
            this.snapfoodService.getOrderCustomizations(context.customerId),
            this.snapfoodService.getReviewAndFeedback(context.customerId)
        ]);

        return {
            generalInfo,
            orderHistory,
            favoriteItems,
            spendingBehavior,
            orderCustomizations,
            reviewFeedback
        };
    }

    private async gatherSocialData(context: AIQueryContext) {
        const [socialStats, featureUsage] = await Promise.all([
            this.snapfoodService.getSocialStats(),
            this.snapfoodService.getFeatureUsageStats()
        ]);

        return {
            socialStats,
            featureUsage,
            engagement_metrics: this.calculateEngagementMetrics(socialStats)
        };
    }

    private async gatherFoodData(context: AIQueryContext) {
        const [
            favorites,
            cuisinePrefs,
            orderCustomizations,
            topVendors,
            recentOrders
        ] = await Promise.all([
            this.snapfoodService.getFavoriteDishes(context.customerId),
            this.snapfoodService.getCuisinePreferences(context.customerId),
            this.snapfoodService.getOrderCustomizations(context.customerId),
            this.snapfoodService.getTopVendors({
                start_date: context.startDate,
                end_date: context.endDate
            }),
            this.snapfoodService.getRecentOrders({
                start_date: context.startDate,
                end_date: context.endDate,
                per_page: 50
            })
        ]);

        return {
            favorite_dishes: favorites,
            cuisine_preferences: cuisinePrefs,
            customizations: orderCustomizations,
            top_vendors: topVendors,
            recent_orders: recentOrders,
            trends: this.analyzeFoodTrends(recentOrders)
        };
    }

    private async gatherSalesData(context: AIQueryContext) {
        const [
            topVendors,
            revenue,
            orderStats,
            promotions,
            cashback
        ] = await Promise.all([
            this.snapfoodService.getTopVendors({
                start_date: context.startDate,
                end_date: context.endDate
            }),
            this.snapfoodService.getRevenueData({
                start_date: context.startDate,
                end_date: context.endDate
            }),
            this.snapfoodService.getOrderReport(),
            this.snapfoodService.getActivePromotions({
                start_date: context.startDate,
                end_date: context.endDate
            }),
            this.snapfoodService.getTotalCashbackUsed({
                start_date: context.startDate,
                end_date: context.endDate
            })
        ]);

        return {
            topVendors,
            revenue,
            orderStats,
            promotions,
            cashback,
            analysis: this.analyzeSalesMetrics({
                revenue,
                orderStats,
                promotions
            })
        };
    }

    private async gatherAnalyticsData(context: AIQueryContext) {
        const [
            orderStats,
            customerStats,
            promotionStats,
            walletStats,
            featureUsage
        ] = await Promise.all([
            this.snapfoodService.getOrderReport(),
            this.snapfoodService.getCustomerReport(),
            this.snapfoodService.getActivePromotions({
                start_date: context.startDate,
                end_date: context.endDate
            }),
            this.snapfoodService.getWalletCredits({
                start_date: context.startDate,
                end_date: context.endDate
            }),
            this.snapfoodService.getFeatureUsageStats()
        ]);

        return {
            order_stats: orderStats,
            customer_stats: customerStats,
            promotion_stats: promotionStats,
            wallet_stats: walletStats,
            feature_usage: featureUsage,
            metrics: this.calculateAnalyticsMetrics({
                orderStats,
                customerStats,
                promotionStats,
                walletStats,
                featureUsage
            })
        };
    }

    private async gatherAdminData(context: AIQueryContext) {
        const [
            customerStats,
            salesStats,
            socialStats,
            foodStats
        ] = await Promise.all([
            this.gatherCustomerData(context),
            this.gatherSalesData(context),
            this.gatherSocialData(context),
            this.gatherFoodData(context)
        ]);

        return {
            customerStats,
            salesStats,
            socialStats,
            foodStats,
            platform_health: this.calculatePlatformHealth({
                customerStats,
                salesStats,
                socialStats,
                foodStats
            })
        };
    }

    // Helper methods for calculations and analysis
    private calculateEngagementMetrics(socialStats: any) {
        return {
            engagement_rate: this.calculateEngagementRate(socialStats),
            user_activity: this.calculateUserActivity(socialStats),
            interaction_quality: this.analyzeInteractionQuality(socialStats)
        };
    }

    private analyzeFoodTrends(orders: any) {
        return {
            peak_times: this.analyzePeakOrderTimes(orders),
            popular_combinations: this.analyzePopularCombinations(orders),
            cuisine_trends: this.analyzeCuisineTrends(orders)
        };
    }

    private analyzeSalesMetrics(data: any) {
        return {
            revenue_growth: this.calculateRevenueGrowth(data.revenue),
            promotion_effectiveness: this.analyzePromotionEffectiveness(data.promotions),
            vendor_performance: this.analyzeVendorPerformance(data)
        };
    }

    private calculateAnalyticsMetrics(data: any) {
        return {
            customer_retention: this.calculateRetentionRate(data.customerStats),
            order_completion: this.calculateOrderCompletionRate(data.orderStats),
            wallet_adoption: this.calculateWalletAdoption(data.walletStats),
            feature_engagement: this.calculateFeatureEngagement(data.featureUsage)
        };
    }

    private calculatePlatformHealth(data: any) {
        return {
            overall_health: this.calculateOverallHealth(data),
            risk_factors: this.identifyRiskFactors(data),
            growth_indicators: this.analyzeGrowthIndicators(data)
        };
    }

    // Additional helper methods
    private getSystemPrompt(assistantType: AIAssistantType): string {
        const prompts = {
            [AIAssistantType.CUSTOMER]: `You are a customer insights specialist for Snapfood. 
                Focus on understanding customer behavior, preferences, and providing actionable insights about customers.`,
            [AIAssistantType.SOCIAL]: `You are a social media and community expert for Snapfood. 
                Analyze social interactions, community engagement, and provide insights about social aspects of the platform.`,
            [AIAssistantType.FOOD]: `You are a food trends and menu optimization specialist for Snapfood. 
                Analyze food preferences, popular dishes, and provide insights about menu performance.`,
            [AIAssistantType.SALES]: `You are a sales and revenue analyst for Snapfood. 
                Focus on revenue patterns, sales performance, and financial insights.`,
            [AIAssistantType.ANALYTICS]: `You are a data analytics specialist for Snapfood. 
                Provide deep analytical insights and data-driven recommendations.`,
            [AIAssistantType.ADMIN]: `You are a comprehensive Snapfood platform analyst. 
                Provide high-level insights across all aspects of the platform including customers, sales, social, and food.`
        };

        return prompts[assistantType] || prompts[AIAssistantType.ADMIN];
    }

    private generateSuggestions(assistantType: AIAssistantType): string[] {
        const suggestions = {
            [AIAssistantType.CUSTOMER]: [
                "Who are our most valuable customers?",
                "Show me customers at risk of churning",
                "What are the most common ordering times?",
                "Which customers haven't ordered in 30 days?",
                "Who are our most frequent customers this month?"
            ],
            [AIAssistantType.SOCIAL]: [
                "What's our community engagement rate?",
                "Show me trending social interactions",
                "Which features are most used?",
                "What's the friend request acceptance rate?",
                "How active is our chat feature?"
            ],
            [AIAssistantType.FOOD]: [
                "What are our top-selling dishes?",
                "Which cuisine types are trending?",
                "Show me menu items with declining orders",
                "What's the average order value by cuisine?",
                "Which food combinations are ordered together?"
            ],
            [AIAssistantType.SALES]: [
                "Show me revenue trends for this month",
                "Who are our top performing vendors?",
                "What's our peak order time?",
                "Compare sales between different time periods",
                "Which promotions generated the most revenue?"
            ],
            [AIAssistantType.ANALYTICS]: [
                "What's our customer retention rate?",
                "Show me order completion rates",
                "Analyze delivery time patterns",
                "What's our promotion effectiveness?",
                "Compare performance across platforms"
            ],
            [AIAssistantType.ADMIN]: [
                "Give me a platform health overview",
                "Show critical metrics across all areas",
                "What are our key growth indicators?",
                "Identify potential problem areas",
                "Compare performance against targets"
            ]
        };

        return suggestions[assistantType] || [];
    }

    private getRelatedQueries(query: string, assistantType: AIAssistantType): string[] {
        const patterns = {
            customer: ['customer', 'user', 'order', 'spend', 'churn'],
            food: ['dish', 'cuisine', 'menu', 'food', 'restaurant'],
            sales: ['revenue', 'sales', 'profit', 'performance'],
            social: ['engagement', 'community', 'interaction', 'social'],
            analytics: ['stats', 'metrics', 'analysis', 'performance'],
        };

        const matches = Object.entries(patterns)
            .filter(([_, terms]) =>
                terms.some(term => query.toLowerCase().includes(term))
            )
            .map(([category]) => category);

        const relatedQueries = new Set<string>();

        matches.forEach(match => {
            switch (match) {
                case 'customer':
                    relatedQueries.add("What's their average order value?");
                    relatedQueries.add("Show their order history");
                    relatedQueries.add("Analyze their preferences");
                    break;
                case 'food':
                    relatedQueries.add("What other dishes do they like?");
                    relatedQueries.add("Show similar cuisine preferences");
                    relatedQueries.add("Analyze menu performance");
                    break;
                case 'sales':
                    relatedQueries.add("Compare with previous period");
                    relatedQueries.add("Show breakdown by category");
                    relatedQueries.add("Analyze revenue trends");
                    break;
                case 'social':
                    relatedQueries.add("Show community engagement metrics");
                    relatedQueries.add("Analyze social interaction patterns");
                    relatedQueries.add("Review feature usage");
                    break;
                case 'analytics':
                    relatedQueries.add("Show trend analysis");
                    relatedQueries.add("Compare performance metrics");
                    relatedQueries.add("Identify growth opportunities");
                    break;
            }
        });

        switch (assistantType) {
            case AIAssistantType.CUSTOMER:
                relatedQueries.add("Show customer segments");
                relatedQueries.add("Analyze ordering patterns");
                break;
            case AIAssistantType.FOOD:
                relatedQueries.add("Show popular combinations");
                relatedQueries.add("Analyze peak ordering times");
                relatedQueries.add("Review menu performance");
                break;
            case AIAssistantType.SALES:
                relatedQueries.add("Show revenue breakdown");
                relatedQueries.add("Analyze sales trends");
                relatedQueries.add("Review promotion impact");
                break;
            case AIAssistantType.SOCIAL:
                relatedQueries.add("Show engagement metrics");
                relatedQueries.add("Analyze user interactions");
                relatedQueries.add("Review community growth");
                break;
            case AIAssistantType.ANALYTICS:
                relatedQueries.add("Show performance metrics");
                relatedQueries.add("Analyze growth trends");
                relatedQueries.add("Review key indicators");
                break;
            case AIAssistantType.ADMIN:
                relatedQueries.add("Show platform overview");
                relatedQueries.add("Analyze system health");
                relatedQueries.add("Review all metrics");
                break;
        }

        return Array.from(relatedQueries).slice(0, 5);
    }

// Analytics calculation methods
    private calculateOrderCompletionRate(orderStats: any): number {
        const delivered = orderStats.delivered_orders || 0;
        const total = orderStats.total_orders || 1;
        return (delivered / total) * 100;
    }

    private calculateRetentionRate(customerStats: any): number {
        const repeat = customerStats.repeat_customers || 0;
        const total = customerStats.total_customers || 1;
        return (repeat / total) * 100;
    }

    private calculateEngagementRate(socialStats: any): number {
        const engaged = socialStats.engaged_users || 0;
        const total = socialStats.total_users || 1;
        return (engaged / total) * 100;
    }

    private calculateUserActivity(socialStats: any): any {
        return {
            daily_active: socialStats.daily_active_users || 0,
            weekly_active: socialStats.weekly_active_users || 0,
            monthly_active: socialStats.monthly_active_users || 0
        };
    }

    private analyzeInteractionQuality(socialStats: any): any {
        return {
            average_response_time: socialStats.avg_response_time || 0,
            interaction_completion: socialStats.completed_interactions || 0,
            satisfaction_rate: socialStats.satisfaction_rate || 0
        };
    }

    private analyzePeakOrderTimes(orders: any[]): any {
        const hourCounts = new Array(24).fill(0);
        orders.forEach(order => {
            const hour = new Date(order.created_at).getHours();
            hourCounts[hour]++;
        });
        return {
            peak_hours: this.findPeakHours(hourCounts),
            hourly_distribution: hourCounts
        };
    }

    private findPeakHours(hourCounts: number[]): number[] {
        const threshold = Math.max(...hourCounts) * 0.8;
        return hourCounts
            .map((count, hour) => ({ hour, count }))
            .filter(({ count }) => count >= threshold)
            .map(({ hour }) => hour);
    }

    private analyzePopularCombinations(orders: any[]): any {
        const combinations = {};
        orders.forEach(order => {
            if (order.products && order.products.length > 1) {
                this.recordCombinations(order.products, combinations);
            }
        });
        return this.sortCombinations(combinations);
    }

    private recordCombinations(products: any[], combinations: any): void {
        for (let i = 0; i < products.length; i++) {
            for (let j = i + 1; j < products.length; j++) {
                const combo = [products[i].id, products[j].id].sort().join(',');
                combinations[combo] = (combinations[combo] || 0) + 1;
            }
        }
    }

    private sortCombinations(combinations: any): any[] {
        return Object.entries(combinations)
            .map(([combo, count]) => ({ combo, count: Number(count) }))
            .sort((a: CountItem, b: CountItem) => b.count - a.count)
            .slice(0, 10);
    }

    private getTopItems(items: any, limit: number): any[] {
        return Object.entries(items)
            .map(([name, count]) => ({ name, count: Number(count) }))
            .sort((a: CountItem, b: CountItem) => b.count - a.count)
            .slice(0, limit);
    }

    private analyzeCuisineTrends(orders: any[]): any {
        const cuisineCounts = {};
        orders.forEach(order => {
            if (order.vendor && order.vendor.foodCategories) {
                order.vendor.foodCategories.forEach(category => {
                    cuisineCounts[category.title] = (cuisineCounts[category.title] || 0) + 1;
                });
            }
        });
        return {
            popular_cuisines: this.getTopItems(cuisineCounts, 5),
            cuisine_distribution: cuisineCounts
        };
    }

    private calculateRevenueGrowth(revenue: any): any {
        if (!revenue.history || revenue.history.length < 2) return 0;
        const latest = revenue.history[revenue.history.length - 1];
        const previous = revenue.history[revenue.history.length - 2];
        return ((latest - previous) / previous) * 100;
    }

    private calculateWalletAdoption(walletStats: any): any {
        return {
            adoption_rate: (walletStats.active_users / walletStats.total_users) * 100,
            average_balance: walletStats.total_balance / walletStats.active_users,
            usage_frequency: walletStats.transactions / walletStats.active_users
        };
    }

    private calculateFeatureEngagement(featureStats: any): any {
        return Object.entries(featureStats).reduce((acc, [feature, stats]: [string, any]) => {
            acc[feature] = {
                usage_rate: (stats.active_users / stats.total_users) * 100,
                satisfaction: stats.satisfaction_rate || 0,
                growth: this.calculateGrowthRate(stats.history)
            };
            return acc;
        }, {});
    }

    private calculateGrowthRate(history: number[]): number {
        if (!history || history.length < 2) return 0;
        const latest = history[history.length - 1];
        const first = history[0];
        return ((latest - first) / first) * 100;
    }

    private calculateOverallHealth(data: any): string {
        const scores = {
            customer: this.scoreCustomerHealth(data.customerStats),
            sales: this.scoreSalesHealth(data.salesStats),
            social: this.scoreSocialHealth(data.socialStats),
            food: this.scoreFoodHealth(data.foodStats)
        };

        const avgScore = Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length;

        if (avgScore >= 8) return 'Excellent';
        if (avgScore >= 6) return 'Good';
        if (avgScore >= 4) return 'Fair';
        return 'Needs Attention';
    }

    private scoreCustomerHealth(stats: any): number {
        return (
            this.normalizeScore(stats.retention_rate, 0, 100) * 0.4 +
            this.normalizeScore(stats.satisfaction_rate, 0, 100) * 0.3 +
            this.normalizeScore(stats.growth_rate, -100, 100) * 0.3
        );
    }

    private scoreSalesHealth(stats: any): number {
        return (
            this.normalizeScore(stats.revenue_growth, -100, 100) * 0.4 +
            this.normalizeScore(stats.order_completion_rate, 0, 100) * 0.3 +
            this.normalizeScore(stats.average_order_value_growth, -100, 100) * 0.3
        );
    }

    private scoreSocialHealth(stats: any): number {
        return (
            this.normalizeScore(stats.engagement_rate, 0, 100) * 0.4 +
            this.normalizeScore(stats.user_satisfaction, 0, 100) * 0.3 +
            this.normalizeScore(stats.community_growth, -100, 100) * 0.3
        );
    }

    private scoreFoodHealth(stats: any): number {
        return (
            this.normalizeScore(stats.menu_performance, 0, 100) * 0.4 +
            this.normalizeScore(stats.vendor_satisfaction, 0, 100) * 0.3 +
            this.normalizeScore(stats.cuisine_diversity, 0, 100) * 0.3
        );
    }

    private normalizeScore(value: number, min: number, max: number): number {
        return ((value - min) / (max - min)) * 10;
    }

    private analyzePromotionEffectiveness(promotions: any): any {
        return {
            usage_rate: this.calculatePromotionUsageRate(promotions),
            revenue_impact: this.calculatePromotionRevenueImpact(promotions),
            conversion_rate: this.calculatePromotionConversionRate(promotions)
        };
    }

    private analyzeVendorPerformance(data: any): any {
        return {
            revenue_contribution: this.calculateVendorRevenue(data),
            order_completion: this.calculateVendorOrderCompletion(data),
            customer_satisfaction: this.calculateVendorSatisfaction(data)
        };
    }

    private identifyRiskFactors(data: any): any {
        return {
            customer_risks: this.analyzeCustomerRisks(data.customerStats),
            operational_risks: this.analyzeOperationalRisks(data.salesStats),
            engagement_risks: this.analyzeEngagementRisks(data.socialStats)
        };
    }

    private analyzeGrowthIndicators(data: any): any {
        return {
            customer_growth: this.analyzeCustomerGrowth(data.customerStats),
            revenue_growth: this.analyzeRevenueGrowth(data.salesStats),
            platform_growth: this.analyzePlatformGrowth(data)
        };
    }

    // Helper methods for promotion analysis
    private calculatePromotionUsageRate(promotions: any): number {
        const used = promotions?.total_used || 0;
        const available = promotions?.total_available || 1;
        return (used / available) * 100;
    }

    private calculatePromotionRevenueImpact(promotions: any): number {
        return (promotions?.revenue_with_promotions || 0) - (promotions?.revenue_without_promotions || 0);
    }

    private calculatePromotionConversionRate(promotions: any): number {
        const conversions = promotions?.conversions || 0;
        const views = promotions?.views || 1;
        return (conversions / views) * 100;
    }

// Helper methods for vendor analysis
    private calculateVendorRevenue(data: any): any {
        return data.topVendors?.map(vendor => ({
            vendor_id: vendor.id,
            revenue: vendor.revenue || 0,
            percentage: vendor.revenue_percentage || 0
        })) || [];
    }

    private calculateVendorOrderCompletion(data: any): any {
        return data.topVendors?.map(vendor => ({
            vendor_id: vendor.id,
            completion_rate: vendor.order_completion_rate || 0,
            average_time: vendor.average_completion_time || 0
        })) || [];
    }

    private calculateVendorSatisfaction(data: any): any {
        return data.topVendors?.map(vendor => ({
            vendor_id: vendor.id,
            rating: vendor.average_rating || 0,
            feedback_score: vendor.feedback_score || 0
        })) || [];
    }

// Helper methods for risk analysis
    private analyzeCustomerRisks(customerStats: any): any {
        return {
            churn_risk: this.calculateChurnRisk(customerStats),
            satisfaction_risk: this.calculateSatisfactionRisk(customerStats),
            engagement_risk: this.calculateEngagementRisk(customerStats)
        };
    }

    private analyzeOperationalRisks(salesStats: any): any {
        return {
            delivery_risk: this.calculateDeliveryRisk(salesStats),
            capacity_risk: this.calculateCapacityRisk(salesStats),
            vendor_risk: this.calculateVendorRisk(salesStats)
        };
    }

    private analyzeEngagementRisks(socialStats: any): any {
        return {
            interaction_risk: this.calculateInteractionRisk(socialStats),
            retention_risk: this.calculateRetentionRisk(socialStats),
            feedback_risk: this.calculateFeedbackRisk(socialStats)
        };
    }

    // Helper methods for growth analysis
    private analyzeCustomerGrowth(customerStats: any): any {
        return {
            new_customers: customerStats?.new_customers || 0,
            growth_rate: customerStats?.growth_rate || 0,
            retention_trend: customerStats?.retention_trend || []
        };
    }

    private analyzeRevenueGrowth(salesStats: any): any {
        return {
            revenue_trend: salesStats?.revenue_trend || [],
            growth_rate: salesStats?.growth_rate || 0,
            projected_growth: salesStats?.projected_growth || 0
        };
    }

    private analyzePlatformGrowth(data: any): any {
        return {
            user_growth: this.calculateUserGrowth(data),
            feature_adoption: this.calculateFeatureAdoption(data),
            market_penetration: this.calculateMarketPenetration(data)
        };
    }

    // Additional helper methods for calculations
    private calculateUserGrowth(data: any): number {
        const current = data?.customerStats?.current_users || 0;
        const previous = data?.customerStats?.previous_users || 1;
        return ((current - previous) / previous) * 100;
    }

    private calculateFeatureAdoption(data: any): any {
        return Object.entries(data?.socialStats?.feature_usage || {}).map(([feature, stats]: [string, any]) => ({
            feature,
            adoption_rate: (stats.active_users || 0) / (stats.total_users || 1) * 100,
            growth_rate: stats.growth_rate || 0
        }));
    }

    private calculateMarketPenetration(data: any): any {
        return {
            current_penetration: data?.marketStats?.penetration_rate || 0,
            growth_rate: data?.marketStats?.growth_rate || 0,
            potential_market: data?.marketStats?.potential_market || 0
        };
    }

    // Risk calculation methods
    private calculateChurnRisk(customerStats: any): any {
        const inactivityScore = this.calculateInactivityScore(customerStats);
        const orderDeclineScore = this.calculateOrderDeclineScore(customerStats);
        const satisfactionScore = this.calculateSatisfactionScore(customerStats);

        const riskScore = (inactivityScore * 0.4) + (orderDeclineScore * 0.3) + (satisfactionScore * 0.3);

        return {
            risk_score: riskScore,
            risk_level: this.getRiskLevel(riskScore),
            factors: {
                inactivity: inactivityScore,
                order_decline: orderDeclineScore,
                satisfaction: satisfactionScore
            }
        };
    }

    private calculateSatisfactionRisk(customerStats: any): any {
        const ratings = customerStats.ratings || [];
        const recentRatings = ratings.slice(-10);
        const avgRating = recentRatings.reduce((sum, r) => sum + r, 0) / (recentRatings.length || 1);

        return {
            risk_score: (5 - avgRating) * 2,
            recent_ratings: recentRatings,
            trend: this.calculateRatingTrend(ratings)
        };
    }

    private calculateEngagementRisk(customerStats: any): any {
        return {
            risk_score: this.calculateEngagementRiskScore(customerStats),
            last_activity: customerStats.last_activity_date,
            interaction_frequency: customerStats.interaction_frequency || 'low'
        };
    }

    private calculateDeliveryRisk(salesStats: any): any {
        return {
            risk_score: this.calculateDeliveryRiskScore(salesStats),
            late_deliveries: salesStats.late_deliveries_percentage || 0,
            average_delay: salesStats.average_delay_minutes || 0
        };
    }

    private calculateCapacityRisk(salesStats: any): any {
        return {
            risk_score: this.calculateCapacityRiskScore(salesStats),
            peak_hour_load: salesStats.peak_hour_load || 0,
            resource_utilization: salesStats.resource_utilization || 0
        };
    }

    private calculateVendorRisk(salesStats: any): any {
        return {
            risk_score: this.calculateVendorRiskScore(salesStats),
            vendor_reliability: salesStats.vendor_reliability || 0,
            fulfillment_rate: salesStats.fulfillment_rate || 0
        };
    }

    private calculateInteractionRisk(socialStats: any): any {
        return {
            risk_score: this.calculateInteractionRiskScore(socialStats),
            response_time: socialStats.average_response_time || 0,
            resolution_rate: socialStats.issue_resolution_rate || 0
        };
    }

    private calculateRetentionRisk(socialStats: any): any {
        return {
            risk_score: this.calculateRetentionRiskScore(socialStats),
            churn_probability: socialStats.churn_probability || 0,
            engagement_level: socialStats.engagement_level || 'medium'
        };
    }

    private calculateFeedbackRisk(socialStats: any): any {
        return {
            risk_score: this.calculateFeedbackRiskScore(socialStats),
            negative_feedback_rate: socialStats.negative_feedback_rate || 0,
            sentiment_score: socialStats.sentiment_score || 0
        };
    }

// Helper methods for risk calculations
    private calculateInactivityScore(stats: any): number {
        const daysSinceLastOrder = stats.days_since_last_order || 0;
        return Math.min(daysSinceLastOrder / 30, 10);
    }

    private calculateOrderDeclineScore(stats: any): number {
        const decline = stats.order_frequency_change || 0;
        return Math.max(Math.min(-decline, 10), 0);
    }

    private calculateSatisfactionScore(stats: any): number {
        const satisfaction = stats.satisfaction_rate || 0;
        return Math.max(10 - satisfaction, 0);
    }

    private getRiskLevel(score: number): string {
        if (score >= 8) return 'High';
        if (score >= 5) return 'Medium';
        return 'Low';
    }

    private calculateRatingTrend(ratings: number[]): 'up' | 'down' | 'stable' {
        if (ratings.length < 2) return 'stable';
        const recent = ratings.slice(-3);
        const older = ratings.slice(-6, -3);
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        if (recentAvg > olderAvg) return 'up';
        if (recentAvg < olderAvg) return 'down';
        return 'stable';
    }

    private calculateEngagementRiskScore(stats: any): number {
        const frequency = this.mapFrequencyToScore(stats.interaction_frequency);
        const recency = this.calculateRecencyScore(stats.last_activity_date);
        return (frequency + recency) / 2;
    }

    private calculateDeliveryRiskScore(stats: any): number {
        return (
            (stats.late_deliveries_percentage || 0) * 0.6 +
            (Math.min(stats.average_delay_minutes || 0, 60) / 6) * 0.4
        );
    }

    private calculateCapacityRiskScore(stats: any): number {
        return Math.max(
            ((stats.peak_hour_load || 0) / 100) * 10,
            ((stats.resource_utilization || 0) / 100) * 10
        );
    }

    private calculateVendorRiskScore(stats: any): number {
        return 10 - (
            ((stats.vendor_reliability || 0) * 0.6 +
                (stats.fulfillment_rate || 0) * 0.4)
        );
    }

    private calculateInteractionRiskScore(stats: any): number {
        const responseScore = Math.min(stats.average_response_time || 0, 60) / 6;
        const resolutionScore = 10 - ((stats.issue_resolution_rate || 0) * 10);
        return (responseScore + resolutionScore) / 2;
    }

    private calculateRetentionRiskScore(stats: any): number {
        return (
            (stats.churn_probability || 0) * 10 +
            this.mapEngagementLevelToScore(stats.engagement_level)
        ) / 2;
    }

    private calculateFeedbackRiskScore(stats: any): number {
        return (
            ((stats.negative_feedback_rate || 0) * 10) * 0.6 +
            ((10 - (stats.sentiment_score || 0)) * 10) * 0.4
        );
    }

    private mapFrequencyToScore(frequency: string): number {
        const scores = { high: 2, medium: 5, low: 8 };
        return scores[frequency] || 5;
    }

    private calculateRecencyScore(lastActivity: string): number {
        if (!lastActivity) return 10;
        const days = (new Date().getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
        return Math.min(days / 30 * 10, 10);
    }

    private mapEngagementLevelToScore(level: string): number {
        const scores = { high: 2, medium: 5, low: 8 };
        return scores[level] || 5;
    }
}