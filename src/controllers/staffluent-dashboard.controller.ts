// src/controllers/dashboard.controller.ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StaffluentDashboardService } from '../services/staffluent-dashboard.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';

@ApiTags('StaffluentDashboard')
@Controller('staffluent-dashboard')
export class StaffluentDashboardController {
    constructor(private dashboardService: StaffluentDashboardService) {}

    @Get('summary')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get dashboard summary data' })
    @ApiResponse({ status: 200, description: 'Returns dashboard summary' })
    async getDashboardSummary(
        @Req() req: Request & { client: Client }
    ) {
        return this.dashboardService.getDashboardSummary(req.client.id);
    }
}