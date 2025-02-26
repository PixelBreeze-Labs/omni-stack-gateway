// src/controllers/business.controller.ts
import { Controller, Post, Get, Param, Body, Query, Req, UseGuards, Patch } from '@nestjs/common';
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

    @Get()
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all businesses' })
    @ApiResponse({ status: 200, description: 'Returns a list of businesses' })
    async getBusinesses(
        @Req() req: Request & { client: Client },
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
        @Query('status') status?: string,
        @Query('isTrialing') isTrialing?: boolean,
        @Query('isTestAccount') isTestAccount?: boolean
    ) {
        return this.businessService.getBusinesses(
            req.client.id,
            {
                page,
                limit,
                search,
                status,
                isTrialing,
                isTestAccount
            }
        );
    }

    @Get('trials')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get businesses in trial period' })
    @ApiResponse({ status: 200, description: 'Returns a list of businesses in trial period' })
    async getTrialBusinesses(
        @Req() req: Request & { client: Client },
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
        @Query('sort') sort?: string,
        @Query('isTestAccount') isTestAccount?: boolean
    ) {
        return this.businessService.getTrialBusinesses(
            req.client.id,
            {
                page,
                limit,
                search,
                sort,
                isTestAccount
            }
        );
    }

    @Patch(':id/deactivate')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Deactivate a business' })
    @ApiResponse({ status: 200, description: 'Business deactivated successfully' })
    async deactivateBusiness(
        @Req() req: Request & { client: Client },
        @Param('id') businessId: string
    ) {
        return this.businessService.updateBusinessStatus(
            req.client.id,
            businessId,
            false
        );
    }

    @Patch(':id/activate')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Activate a business' })
    @ApiResponse({ status: 200, description: 'Business activated successfully' })
    async activateBusiness(
        @Req() req: Request & { client: Client },
        @Param('id') businessId: string
    ) {
        return this.businessService.updateBusinessStatus(
            req.client.id,
            businessId,
            true
        );
    }

    @Patch(':id/mark-test-account')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Mark a business as a test account' })
    @ApiResponse({ status: 200, description: 'Business marked as test account successfully' })
    async markAsTestAccount(
        @Req() req: Request & { client: Client },
        @Param('id') businessId: string,
        @Body() data: { isTestAccount: boolean }
    ) {
        return this.businessService.updateBusinessTestStatus(
            req.client.id,
            businessId,
            data.isTestAccount
        );
    }
}