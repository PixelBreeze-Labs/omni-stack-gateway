import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { CRMService } from './crm.service';
import { AIAssistantType, AIQueryContext, AIQueryResponse } from '../types/ai-assistant.types';

@Injectable()
export class CRMAIAssistantService {
    private readonly openai: OpenAI;
    private readonly logger = new Logger(CRMAIAssistantService.name);

    constructor(
        private readonly crmService: CRMService,
        private readonly configService: ConfigService,
    ) {
        this.openai = new OpenAI({
            apiKey: this.configService.get<string>('OPENAI_API_KEY'),
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
            case AIAssistantType.SALES:
                return await this.gatherSalesData(context);
            case AIAssistantType.PRODUCT:
                return await this.gatherProductData(context);
            case AIAssistantType.MARKETING:
                return await this.gatherMarketingData(context);
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
            return await this.crmService.listCustomers({
                start_date: context.startDate,
                end_date: context.endDate,
                search: context.searchTerm
            });
        }

        const [
            customerInfo,
            orderHistory,
            favoriteProducts,
            spendingBehavior,
            reviewFeedback
        ] = await Promise.all([
            this.crmService.getCustomerInfo(context.customerId),
            this.crmService.getCustomerOrders(context.customerId),
            this.crmService.getCustomerFavoriteProducts(context.customerId),
            this.crmService.getCustomerSpending(context.customerId),
            this.crmService.getCustomerReviews(context.customerId)
        ]);

        return {
            customerInfo,
            orderHistory,
            favoriteProducts,
            spendingBehavior,
            reviewFeedback
        };
    }

    private async gatherSalesData(context: AIQueryContext) {
        const [
            salesOverview,
            topProducts,
            revenue,
            orderStats,
            promotionImpact
        ] = await Promise.all([
            this.crmService.getSalesOverview({
                start_date: context.startDate,
                end_date: context.endDate
            }),
            this.crmService.getTopSellingProducts({
                start_date: context.startDate,
                end_date: context.endDate
            }),
            this.crmService.getRevenueData({
                start_date: context.startDate,
                end_date: context.endDate
            }),
            this.crmService.getOrderStats({
                start_date: context.startDate,
                end_date: context.endDate
            }),
            this.crmService.getPromotionPerformance({
                start_date: context.startDate,
                end_date: context.endDate
            })
        ]);

        return {
            salesOverview,
            topProducts,
            revenue,
            orderStats,
            promotionImpact,
            analysis: this.analyzeSalesData({
                salesOverview,
                topProducts,
                revenue,
                orderStats,
                promotionImpact
            })
        };
    }

    private async gatherProductData(context: AIQueryContext) {
        if (context.productId) {
            const [
                productDetails,
                salesHistory,
                relatedProducts,
                customerFeedback
            ] = await Promise.all([
                this.crmService.getProductDetails(context.productId),
                this.crmService.getProductSalesHistory(context.productId),
                this.crmService.getRelatedProducts(context.productId),
                this.crmService.getProductReviews(context.productId)
            ]);

            return {
                productDetails,
                salesHistory,
                relatedProducts,
                customerFeedback,
                performanceMetrics: this.calculateProductPerformance(productDetails, salesHistory)
            };
        } else {
            const [
                productList,
                inventoryStatus,
                categoryPerformance
            ] = await Promise.all([
                this.crmService.listProducts({
                    start_date: context.startDate,
                    end_date: context.endDate,
                    search: context.searchTerm
                }),
                this.crmService.getInventoryStatus(),
                this.crmService.getCategoryPerformance({
                    start_date: context.startDate,
                    end_date: context.endDate
                })
            ]);

            return {
                productList,
                inventoryStatus,
                categoryPerformance,
                insights: this.analyzeProductData(productList, categoryPerformance)
            };
        }
    }

    private async gatherMarketingData(context: AIQueryContext) {
        const [
            activePromotions,
            campaignPerformance,
            customerSegments,
            conversionRates
        ] = await Promise.all([
            this.crmService.getActivePromotions(),
            this.crmService.getCampaignPerformance({
                start_date: context.startDate,
                end_date: context.endDate
            }),
            this.crmService.getCustomerSegments(),
            this.crmService.getConversionRates({
                start_date: context.startDate,
                end_date: context.endDate
            })
        ]);

        return {
            activePromotions,
            campaignPerformance,
            customerSegments,
            conversionRates,
            recommendations: this.generateMarketingRecommendations({
                activePromotions,
                campaignPerformance,
                customerSegments,
                conversionRates
            })
        };
    }

    private async gatherAnalyticsData(context: AIQueryContext) {
        const [
            kpis,
            trends,
            forecasts,
            insightReports
        ] = await Promise.all([
            this.crmService.getKeyPerformanceIndicators({
                start_date: context.startDate,
                end_date: context.endDate
            }),
            this.crmService.getTrends({
                start_date: context.startDate,
                end_date: context.endDate
            }),
            this.crmService.getForecasts(),
            this.crmService.getInsightReports()
        ]);

        return {
            kpis,
            trends,
            forecasts,
            insightReports,
            analysis: this.analyzeBusinessMetrics({
                kpis,
                trends,
                forecasts
            })
        };
    }

    private async gatherAdminData(context: AIQueryContext) {
        const [
            customerData,
            salesData,
            productData,
            marketingData,
            analyticsData
        ] = await Promise.all([
            this.gatherCustomerData(context),
            this.gatherSalesData(context),
            this.gatherProductData(context),
            this.gatherMarketingData(context),
            this.gatherAnalyticsData(context)
        ]);

        return {
            customerData,
            salesData,
            productData,
            marketingData,
            analyticsData,
            platformHealth: this.calculatePlatformHealth({
                customerData,
                salesData,
                productData,
                marketingData,
                analyticsData
            })
        };
    }

    // Helper analysis methods
    private analyzeSalesData(data: any) {
        return {
            growthRate: this.calculateGrowthRate(data.revenue),
            topPerformers: this.identifyTopPerformers(data.topProducts),
            profitMargins: this.calculateProfitMargins(data),
            salesTrends: this.identifySalesTrends(data.orderStats)
        };
    }

    private calculateProductPerformance(productDetails: any, salesHistory: any) {
        return {
            salesVelocity: this.calculateSalesVelocity(salesHistory),
            profitContribution: this.calculateProfitContribution(productDetails, salesHistory),
            inventoryEfficiency: this.calculateInventoryEfficiency(productDetails, salesHistory)
        };
    }

    private analyzeProductData(productList: any, categoryPerformance: any) {
        return {
            topCategories: this.identifyTopCategories(categoryPerformance),
            slowMovingProducts: this.identifySlowMovingProducts(productList),
            restockRecommendations: this.generateRestockRecommendations(productList)
        };
    }

    private generateMarketingRecommendations(data: any) {
        return {
            promotionSuggestions: this.generatePromotionSuggestions(data),
            targetSegments: this.identifyTargetSegments(data.customerSegments),
            campaignOptimizations: this.suggestCampaignOptimizations(data.campaignPerformance)
        };
    }

    private analyzeBusinessMetrics(data: any) {
        return {
            performanceHighlights: this.identifyPerformanceHighlights(data.kpis),
            growthOpportunities: this.identifyGrowthOpportunities(data.trends),
            riskAreas: this.identifyRiskAreas(data)
        };
    }

    private calculatePlatformHealth(data: any) {
        return {
            overallHealth: this.assessOverallHealth(data),
            keyMetrics: this.identifyKeyMetrics(data),
            actionRecommendations: this.generateActionRecommendations(data)
        };
    }

    // Helper calculation methods
    private calculateGrowthRate(revenueData: any): number {
        // Implementation logic
        return 0; // placeholder
    }

    private identifyTopPerformers(productData: any): any[] {
        // Implementation logic
        return []; // placeholder
    }

    private calculateProfitMargins(salesData: any): any {
        // Implementation logic
        return {}; // placeholder
    }

    private identifySalesTrends(orderStats: any): any {
        // Implementation logic
        return {}; // placeholder
    }

    private calculateSalesVelocity(salesHistory: any): number {
        // Implementation logic
        return 0; // placeholder
    }

    private calculateProfitContribution(productDetails: any, salesHistory: any): number {
        // Implementation logic
        return 0; // placeholder
    }

    private calculateInventoryEfficiency(productDetails: any, salesHistory: any): number {
        // Implementation logic
        return 0; // placeholder
    }

    private identifyTopCategories(categoryPerformance: any): any[] {
        // Implementation logic
        return []; // placeholder
    }

    private identifySlowMovingProducts(productList: any): any[] {
        // Implementation logic
        return []; // placeholder
    }

    private generateRestockRecommendations(productList: any): any[] {
        // Implementation logic
        return []; // placeholder
    }

    private generatePromotionSuggestions(data: any): any[] {
        // Implementation logic
        return []; // placeholder
    }

    private identifyTargetSegments(customerSegments: any): any[] {
        // Implementation logic
        return []; // placeholder
    }

    private suggestCampaignOptimizations(campaignPerformance: any): any[] {
        // Implementation logic
        return []; // placeholder
    }

    private identifyPerformanceHighlights(kpis: any): any[] {
        // Implementation logic
        return []; // placeholder
    }

    private identifyGrowthOpportunities(trends: any): any[] {
        // Implementation logic
        return []; // placeholder
    }

    private identifyRiskAreas(data: any): any[] {
        // Implementation logic
        return []; // placeholder
    }

    private assessOverallHealth(data: any): string {
        // Implementation logic
        return ""; // placeholder
    }

    private identifyKeyMetrics(data: any): any[] {
        // Implementation logic
        return []; // placeholder
    }

    private generateActionRecommendations(data: any): any[] {
        // Implementation logic
        return []; // placeholder
    }

    // System prompts for different assistant types
    private getSystemPrompt(assistantType: AIAssistantType): string {
        const prompts = {
            [AIAssistantType.CUSTOMER]: `You are a customer insights specialist for an ecommerce store. 
                Focus on understanding customer behavior, preferences, and providing actionable insights about customers.`,
                
            [AIAssistantType.SALES]: `You are a sales and revenue analyst for an ecommerce store. 
                Focus on sales performance, revenue patterns, and providing actionable insights to increase sales.`,
                
            [AIAssistantType.PRODUCT]: `You are a product and inventory specialist for an ecommerce store. 
                Focus on product performance, inventory management, and providing insights about optimizing the product catalog.`,
                
            [AIAssistantType.MARKETING]: `You are a marketing and promotions expert for an ecommerce store. 
                Focus on campaign performance, promotion strategies, and providing actionable marketing insights.`,
                
            [AIAssistantType.ANALYTICS]: `You are a data analytics specialist for an ecommerce store. 
                Provide deep analytical insights and data-driven recommendations based on business metrics.`,
                
            [AIAssistantType.ADMIN]: `You are a comprehensive ecommerce platform analyst. 
                Provide high-level insights across all aspects of the store including customers, sales, products, marketing, and overall analytics.`
        };

        return prompts[assistantType] || prompts[AIAssistantType.ADMIN];
    }

    // Generate relevant suggestions based on assistant type
    private generateSuggestions(assistantType: AIAssistantType): string[] {
        const suggestions = {
            [AIAssistantType.CUSTOMER]: [
                "Who are our top customers by revenue?",
                "Show customers who haven't ordered in 30 days",
                "What products do our VIP customers prefer?",
                "Identify at-risk customers who might churn",
                "Analyze customer satisfaction trends"
            ],
            [AIAssistantType.SALES]: [
                "Show me this month's sales performance",
                "Compare revenue between this month and last month",
                "What are our best-selling products?",
                "Analyze sales by category",
                "Create a 15% discount code for new customers"
            ],
            [AIAssistantType.PRODUCT]: [
                "Which products have low inventory?",
                "Show products with decreasing sales",
                "What's our current inventory value?",
                "Identify products with highest profit margins",
                "Show products that are frequently purchased together"
            ],
            [AIAssistantType.MARKETING]: [
                "How are our current promotions performing?",
                "Which customer segments should we target next?",
                "Analyze our email campaign effectiveness",
                "Suggest promotions for slow-moving inventory",
                "What's our customer acquisition cost?"
            ],
            [AIAssistantType.ANALYTICS]: [
                "Show key performance indicators for this quarter",
                "What trends are emerging in our data?",
                "Forecast sales for next month",
                "Compare our performance against goals",
                "Identify areas of the business that need attention"
            ],
            [AIAssistantType.ADMIN]: [
                "Give me a store health overview",
                "Show critical metrics across all departments",
                "What are our key growth areas?",
                "Identify potential problem areas",
                "Summarize today's business performance"
            ]
        };

        return suggestions[assistantType] || [];
    }

    // Generate related queries based on the original query and assistant type
    private getRelatedQueries(query: string, assistantType: AIAssistantType): string[] {
        const patterns = {
            customer: ['customer', 'buyer', 'client', 'purchase', 'loyalty'],
            product: ['product', 'item', 'inventory', 'stock', 'catalog'],
            sales: ['sales', 'revenue', 'order', 'profit', 'discount'],
            marketing: ['marketing', 'promotion', 'campaign', 'email', 'offer'],
            analytics: ['analytics', 'metrics', 'kpi', 'performance', 'trend'],
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
                    relatedQueries.add("What's their purchasing history?");
                    relatedQueries.add("Show their lifetime value");
                    relatedQueries.add("When did they last purchase?");
                    break;
                case 'product':
                    relatedQueries.add("How is this product performing?");
                    relatedQueries.add("Show inventory status");
                    relatedQueries.add("What are related products?");
                    break;
                case 'sales':
                    relatedQueries.add("Compare with previous period");
                    relatedQueries.add("Show sales by category");
                    relatedQueries.add("What's driving revenue growth?");
                    break;
                case 'marketing':
                    relatedQueries.add("How effective are our promotions?");
                    relatedQueries.add("Show campaign ROI");
                    relatedQueries.add("Which segments should we target?");
                    break;
                case 'analytics':
                    relatedQueries.add("Show key trends");
                    relatedQueries.add("Forecast next month");
                    relatedQueries.add("What metrics need attention?");
                    break;
            }
        });

        // Add assistant-type specific queries
        switch (assistantType) {
            case AIAssistantType.CUSTOMER:
                relatedQueries.add("Segment customers by value");
                relatedQueries.add("Analyze purchase patterns");
                break;
            case AIAssistantType.SALES:
                relatedQueries.add("Show revenue breakdown");
                relatedQueries.add("Analyze order values");
                break;
            case AIAssistantType.PRODUCT:
                relatedQueries.add("Check inventory levels");
                relatedQueries.add("Identify restocking needs");
                break;
            case AIAssistantType.MARKETING:
                relatedQueries.add("Analyze promotion effectiveness");
                relatedQueries.add("Suggest new campaign ideas");
                break;
            case AIAssistantType.ANALYTICS:
                relatedQueries.add("Show business health metrics");
                relatedQueries.add("Identify growth opportunities");
                break;
            case AIAssistantType.ADMIN:
                relatedQueries.add("Show store overview");
                relatedQueries.add("Highlight critical issues");
                break;
        }

        return Array.from(relatedQueries).slice(0, 5);
    }
}