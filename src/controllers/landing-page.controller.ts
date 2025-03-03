// src/controllers/landing-page.controller.ts
import { Controller, Get, Post, Body, Param, UsePipes, ValidationPipe } from '@nestjs/common';
import { SnapfoodAdminService } from '../services/snapfood-admin.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { LandingPageTrackingDto } from '../dtos/landing-page-tracking.dto';

@ApiTags('Landing Page')
@Controller('api/landing-page')
export class LandingPageController {
    constructor(private readonly snapfoodAdminService: SnapfoodAdminService) {}

    @ApiOperation({ summary: 'Get landing page data by hashId' })
    @ApiParam({ name: 'hashId', description: 'Restaurant hash ID' })
    @ApiResponse({ status: 200, description: 'Landing page data retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Landing page not found' })
    @Get(':hashId')
    async getLandingPage(@Param('hashId') hashId: string) {
        return await this.snapfoodAdminService.forward(
            `external/landing-page/${hashId}`,
            'GET'
        );
    }

    @ApiOperation({ summary: 'Track landing page action' })
    @ApiResponse({ status: 200, description: 'Action tracked successfully' })
    @ApiResponse({ status: 400, description: 'Invalid input' })
    @ApiResponse({ status: 404, description: 'Restaurant not found' })
    @Post('track')
    @UsePipes(new ValidationPipe({ transform: true }))
    async trackLandingPageAction(@Body() trackingData: LandingPageTrackingDto) {
        return await this.snapfoodAdminService.forward(
            'external/landing-page/track',
            'POST',
            trackingData
        );
    }
}