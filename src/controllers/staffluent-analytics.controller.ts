// src/controllers/staffluent-analytics.controller.ts
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StaffluentAnalyticsService } from '../services/staffluent-analytics.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';

@ApiTags('StaffluentAnalytics')
@Controller('staffluent-analytics')
export class StaffluentAnalyticsController {
    constructor(private analyticsService: StaffluentAnalyticsService) {}

    @Get('businesses')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get business analytics data' })
    @ApiResponse({ status: 200, description: 'Returns business analytics' })
    async getBusinessAnalytics(
        @Req() req: Request & { client: Client },
        @Query('period') period?: string
    ) {
        return this.analyticsService.getBusinessAnalytics(
            req.client.id,
            period
        );
    }

    @Get('users')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get user analytics data' })
    @ApiResponse({ status: 200, description: 'Returns user analytics' })
    async getUserAnalytics(
        @Req() req: Request & { client: Client },
        @Query('period') period?: string
    ) {
        return this.analyticsService.getUserAnalytics(
            req.client.id,
            period
        );
    }
}