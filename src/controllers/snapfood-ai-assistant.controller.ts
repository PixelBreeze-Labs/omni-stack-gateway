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
                "What are the most common ordering times?"
            ],
            [AIAssistantType.SOCIAL]: [
                "What's our community engagement rate?",
                "Show me trending social interactions",
                "Which features are most used?"
            ],
            // Add more suggestions for other types
        };

        return suggestions[assistantType] || [];
    }
}