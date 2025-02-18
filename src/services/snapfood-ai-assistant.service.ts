import { Injectable, Logger } from '@nestjs/common';
//TODO: here?
import { OpenAIApi, Configuration } from 'openai';
import { SnapfoodService } from './snapfood.service';
import { AIAssistantType, AIQueryContext, AIQueryResponse } from '../types/ai-assistant.types';

@Injectable()
export class SnapfoodAIAssistantService {
    private readonly openai: OpenAIApi;
    private readonly logger = new Logger(SnapfoodAIAssistantService.name);

    constructor(
        private readonly snapfoodService: SnapfoodService,
    ) {
        const configuration = new Configuration({
            apiKey: process.env.OPENAI_API_KEY,
        });
        this.openai = new OpenAIApi(configuration);
    }

    async query(query: string, context: AIQueryContext): Promise<AIQueryResponse> {
        try {
            // Get assistant-specific data and prompt
            const { data, systemPrompt } = await this.getAssistantContext(context);

            const completion = await this.openai.createChatCompletion({
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
                answer: completion.data.choices[0].message?.content || '',
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
            spendingBehavior
        ] = await Promise.all([
            this.snapfoodService.getGeneralInfo(context.customerId),
            this.snapfoodService.getOrderFrequency(context.customerId),
            this.snapfoodService.getFavoriteDishes(context.customerId),
            this.snapfoodService.getAverageOrderValue(context.customerId)
        ]);

        return {
            generalInfo,
            orderHistory,
            favoriteItems,
            spendingBehavior
        };
    }

    private async gatherSocialData(context: AIQueryContext) {
        // Gather social-related data
        const socialStats = await this.snapfoodService.getSocialStats();
        return { socialStats };
    }

    private async gatherFoodData(context: AIQueryContext) {
        try {
            // Gather comprehensive food-related data
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
                    per_page: 50 // Get more orders for better analysis
                })
            ]);

            return {
                favorite_dishes: favorites,
                cuisine_preferences: cuisinePrefs,
                customizations: orderCustomizations,
                top_vendors: topVendors,
                recent_orders: recentOrders,
                order_patterns: this.analyzeFoodOrderPatterns(recentOrders)
            };
        } catch (error) {
            this.logger.error('Failed to gather food data:', error);
            return {};
        }
    }

    private analyzeFoodOrderPatterns(orders: any) {
        return {
            peak_order_times: this.getPeakOrderTimes(orders),
            popular_combinations: this.getPopularCombinations(orders),
            average_order_size: this.calculateAverageOrderSize(orders)
        };
    }

    private async gatherSalesData(context: AIQueryContext) {
        const [
            topVendors,
            revenue,
            orderStats
        ] = await Promise.all([
            //TODO: context
            this.snapfoodService.getTopVendors(context),
            this.snapfoodService.getRevenueData(context),
            this.snapfoodService.getOrderReport()
        ]);

        return {
            topVendors,
            revenue,
            orderStats
        };
    }

    private async gatherAnalyticsData(context: AIQueryContext) {
        try {
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

            // Calculate additional metrics
            const metrics = {
                //TODO: here?
                order_completion_rate: this.calculateOrderCompletionRate(orderStats),
                customer_retention: this.calculateRetentionRate(customerStats),
                promotion_effectiveness: this.analyzePromotionEffectiveness(promotionStats),
                wallet_adoption: this.analyzeWalletAdoption(walletStats),
                feature_engagement: this.analyzeFeatureEngagement(featureUsage)
            };

            return {
                order_stats: orderStats,
                customer_stats: customerStats,
                promotion_stats: promotionStats,
                wallet_stats: walletStats,
                feature_usage: featureUsage,
                calculated_metrics: metrics
            };
        } catch (error) {
            this.logger.error('Failed to gather analytics data:', error);
            return {};
        }
    }

    private async gatherAdminData(context: AIQueryContext) {
        // Gather comprehensive data for admin
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
            foodStats
        };
    }

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
        // Add suggested queries based on assistant type
        // TODO: here?
        const suggestions = {
            [AIAssistantType.CUSTOMER]: [
                "Show me customers who ordered more than 5 times this month",
                "Who are our top 10 customers by order value?",
                "Which customers haven't ordered in 30 days?"
            ],
            // Add suggestions for other types
        };

        return suggestions[assistantType] || [];
    }

    private getRelatedQueries(query: string, assistantType: AIAssistantType): string[] {
        // Base patterns for query analysis
        const patterns = {
            customer: ['customer', 'user', 'order', 'spend', 'churn'],
            food: ['dish', 'cuisine', 'menu', 'food', 'restaurant'],
            sales: ['revenue', 'sales', 'profit', 'performance'],
            social: ['engagement', 'community', 'interaction', 'social'],
            analytics: ['stats', 'metrics', 'analysis', 'performance'],
        };

        // Find matches in the query
        const matches = Object.entries(patterns)
            .filter(([_, terms]) =>
                terms.some(term => query.toLowerCase().includes(term))
            )
            .map(([category]) => category);

        // Generate related queries based on matches and assistant type
        const relatedQueries = new Set<string>();

        matches.forEach(match => {
            switch (match) {
                case 'customer':
                    relatedQueries.add("What's their average order value?");
                    relatedQueries.add("Show their order history");
                    break;
                case 'food':
                    relatedQueries.add("What other dishes do they like?");
                    relatedQueries.add("Show similar cuisine preferences");
                    break;
                case 'sales':
                    relatedQueries.add("Compare with previous period");
                    relatedQueries.add("Show breakdown by category");
                    break;
                    //TODO: here?
                // Add more cases as needed
            }
        });

        // Add assistant-type specific related queries
        switch (assistantType) {
            case AIAssistantType.CUSTOMER:
                relatedQueries.add("Show customer segments");
                relatedQueries.add("Analyze ordering patterns");
                break;
            case AIAssistantType.FOOD:
                relatedQueries.add("Show popular combinations");
                relatedQueries.add("Analyze peak ordering times");
                break;
            //TODO: here?
            // Add more cases
        }

        return Array.from(relatedQueries).slice(0, 5); // Return top 5 related queries
    }
}