import { Controller, Post, Body, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { CRMAIAssistantService } from '../services/crm-ai-assistant.service';
import { AIAssistantType, AIQueryContext } from '../types/ai-assistant.types';
import { ClientAuthGuard } from '../guards/client-auth.guard';

@ApiTags('CRM AI Assistant')
@ApiBearerAuth()
@Controller('trackmaster/ai')
@UseGuards(ClientAuthGuard)
export class CRMAIAssistantController {
    constructor(private readonly aiAssistantService: CRMAIAssistantService) {}

    @Post('ask')
    @ApiOperation({ summary: 'Ask the CRM AI Assistant' })
    @ApiResponse({
        status: 200,
        description: 'Returns AI analysis and insights based on the query'
    })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                query: { 
                    type: 'string', 
                    example: "How are our sales performing this month?" 
                },
                context: {
                    type: 'object',
                    properties: {
                        assistantType: {
                            type: 'string',
                            enum: Object.values(AIAssistantType),
                            example: 'sales'
                        },
                        startDate: {
                            type: 'string',
                            example: '2024-01-01'
                        },
                        endDate: {
                            type: 'string',
                            example: '2024-02-18'
                        },
                        customerId: {
                            type: 'string',
                            example: '123'
                        },
                        productId: {
                            type: 'string',
                            example: '456'
                        },
                        categoryId: {
                            type: 'string',
                            example: '789'
                        },
                        searchTerm: {
                            type: 'string',
                            example: 'high value'
                        }
                    }
                }
            },
            required: ['query', 'context']
        }
    })
    async askAssistant(
        @Body('query') query: string,
        @Body('context') context: AIQueryContext
    ) {
        return await this.aiAssistantService.query(query, context);
    }

    @Get('suggestions')
    @ApiOperation({ summary: 'Get suggested queries for the AI Assistant' })
    @ApiResponse({
        status: 200,
        description: 'Returns suggested queries based on assistant type'
    })
    @ApiQuery({
        name: 'type',
        enum: AIAssistantType,
        required: true,
        description: 'Type of AI assistant to get suggestions for'
    })
    getSuggestions(
        @Query('type') assistantType: AIAssistantType
    ) {
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

    @Get('insights/:type')
    @ApiOperation({ summary: 'Get pre-generated insights for specific area' })
    @ApiResponse({
        status: 200,
        description: 'Returns key insights for the specified area'
    })
    @ApiQuery({
        name: 'startDate',
        required: false,
        type: 'string',
        description: 'Start date for analysis (YYYY-MM-DD)'
    })
    @ApiQuery({
        name: 'endDate',
        required: false,
        type: 'string',
        description: 'End date for analysis (YYYY-MM-DD)'
    })
    async getInsights(
        @Param('type') type: AIAssistantType,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        const context: AIQueryContext = {
            assistantType: type,
            startDate,
            endDate
        };

        // Default queries for each type
        const defaultQueries = {
            [AIAssistantType.CUSTOMER]: "Give me an overview of our customer base and identify key trends",
            [AIAssistantType.SALES]: "Provide a sales performance overview and highlight key metrics",
            [AIAssistantType.PRODUCT]: "Give me an overview of our product catalog and inventory status",
            [AIAssistantType.MARKETING]: "Analyze our marketing campaigns and promotion effectiveness",
            [AIAssistantType.ANALYTICS]: "Give me a comprehensive analysis of our store performance",
            [AIAssistantType.ADMIN]: "Provide a complete store health check and highlight critical areas"
        };

        return await this.aiAssistantService.query(defaultQueries[type] || defaultQueries[AIAssistantType.ADMIN], context);
    }

    @Get('dashboard')
    @ApiOperation({ summary: 'Get store dashboard overview' })
    @ApiResponse({
        status: 200,
        description: 'Returns comprehensive store performance analysis'
    })
    async getStoreDashboard() {
        const context: AIQueryContext = {
            assistantType: AIAssistantType.ADMIN,
            startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0]
        };

        return await this.aiAssistantService.query(
            "Provide a comprehensive store health analysis highlighting sales, inventory, customer metrics, and key performance indicators",
            context
        );
    }

    @Get('create-discount')
    @ApiOperation({ summary: 'Generate a discount code with AI assistance' })
    @ApiResponse({
        status: 200,
        description: 'Returns AI-generated discount recommendation'
    })
    @ApiQuery({
        name: 'percentage',
        required: false,
        type: 'number',
        description: 'Discount percentage'
    })
    @ApiQuery({
        name: 'target',
        required: false,
        type: 'string',
        description: 'Target customer segment'
    })
    async createDiscountSuggestion(
        @Query('percentage') percentage?: number,
        @Query('target') target?: string,
    ) {
        const context: AIQueryContext = {
            assistantType: AIAssistantType.MARKETING,
            searchTerm: target
        };

        const discountPrompt = percentage 
            ? `Create a ${percentage}% discount code targeting ${target || 'all customers'}`
            : `Suggest an optimal discount strategy for ${target || 'increasing sales'}`;

        return await this.aiAssistantService.query(discountPrompt, context);
    }
}