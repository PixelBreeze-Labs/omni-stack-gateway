import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiBody, ApiTags } from '@nestjs/swagger';
import { SnapfoodAIAssistantService } from '../services/snapfood-ai-assistant.service';
import { AIAssistantType, AIQueryContext } from '../types/ai-assistant.types';

@ApiTags('Snapfood AI Assistant')
@Controller('ai')
export class SnapfoodAIAssistantController {
    constructor(private readonly aiAssistantService: SnapfoodAIAssistantService) {}

    @Post('ask')
    @ApiOperation({ summary: 'Ask the Snapfood AI Assistant' })
    async askAssistant(
        @Body('query') query: string,
        @Body('context') context: AIQueryContext
    ) {
        return await this.aiAssistantService.query(query, context);
    }

    @Get('suggestions')
    @ApiOperation({ summary: 'Get suggested queries for the AI Assistant' })
    getSuggestions(
        @Query('type') assistantType: AIAssistantType
    ) {
        // Return suggested queries based on assistant type
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
}