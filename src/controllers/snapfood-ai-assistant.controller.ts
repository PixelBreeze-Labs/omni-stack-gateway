import { Controller, Post, Body, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { SnapfoodAIAssistantService } from '../services/snapfood-ai-assistant.service';
import { AIAssistantType, AIQueryContext } from '../types/ai-assistant.types';

@ApiTags('Snapfood AI Assistant')
@ApiBearerAuth()
@Controller('ai')
export class SnapfoodAIAssistantController {
    constructor(private readonly aiAssistantService: SnapfoodAIAssistantService) {}

    @Post('ask')
    @ApiOperation({ summary: 'Ask the Snapfood AI Assistant' })
    @ApiResponse({
        status: 200,
        description: 'Returns AI analysis and insights based on the query'
    })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                query: { type: 'string', example: "Who are our top customers this month?" },
                context: {
                    type: 'object',
                    properties: {
                        assistantType: {
                            type: 'string',
                            enum: Object.values(AIAssistantType),
                            example: 'customer'
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
                "Who are our most valuable customers?",
                "Show me customers at risk of churning",
                "What are the most common ordering times?",
                "Which customers haven't ordered in the last 30 days?",
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
            [AIAssistantType.SOCIAL]: "Analyze our social engagement and community health",
            [AIAssistantType.FOOD]: "Show me our menu performance and identify trending items",
            [AIAssistantType.SALES]: "Provide a sales performance overview and highlight key metrics",
            [AIAssistantType.ANALYTICS]: "Give me a comprehensive analysis of our platform performance",
            [AIAssistantType.ADMIN]: "Provide a complete platform health check and highlight critical areas"
        };

        return await this.aiAssistantService.query(defaultQueries[type] || defaultQueries[AIAssistantType.ADMIN], context);
    }

    @Get('health-check')
    @ApiOperation({ summary: 'Get platform health overview' })
    @ApiResponse({
        status: 200,
        description: 'Returns comprehensive platform health analysis'
    })
    async getPlatformHealth() {
        const context: AIQueryContext = {
            assistantType: AIAssistantType.ADMIN,
            startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0]
        };

        return await this.aiAssistantService.query(
            "Provide a comprehensive platform health analysis highlighting critical metrics, potential issues, and areas for improvement",
            context
        );
    }

    @Get('quick-stats')
    @ApiOperation({ summary: 'Get quick platform statistics' })
    @ApiResponse({
        status: 200,
        description: 'Returns key platform statistics and metrics'
    })
    async getQuickStats() {
        const context: AIQueryContext = {
            assistantType: AIAssistantType.ANALYTICS,
            startDate: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0]
        };

        return await this.aiAssistantService.query(
            "Give me a quick overview of key platform metrics for the last 7 days",
            context
        );
    }
}