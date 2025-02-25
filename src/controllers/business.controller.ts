// src/controllers/business.controller.ts
import { Controller, Post, Get, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BusinessService } from '../services/business.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';

@ApiTags('Businesses')
@Controller('businesses')
export class BusinessController {
    constructor(private businessService: BusinessService) {}

    @Post(':id/subscribe')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update business details and create subscription' })
    @ApiResponse({ status: 201, description: 'Checkout session created successfully' })
    async updateBusinessAndSubscribe(
        @Req() req: Request & { client: Client },
        @Param('id') businessId: string,
        @Body() subscriptionData: {
            businessDetails?: {
                businessType?: string;
                phone?: string;
                address?: {
                    street?: string;
                    city?: string;
                    state?: string;
                    zip?: string;
                    country?: string;
                };
                taxId?: string;
                vatNumber?: string;
            };
            subscription: {
                planId: string;
                interval: 'month' | 'year';
            };
        }
    ) {
        return this.businessService.updateBusinessAndSubscribe(
            req.client.id,
            businessId,
            subscriptionData
        );
    }

    @Get('subscription/finalize')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Finalize subscription after successful payment' })
    @ApiResponse({ status: 200, description: 'Subscription finalized successfully' })
    async finalizeSubscription(
        @Req() req: Request & { client: Client },
        @Query('session_id') sessionId: string
    ) {
        return this.businessService.finalizeSubscription(req.client.id, sessionId);
    }
}