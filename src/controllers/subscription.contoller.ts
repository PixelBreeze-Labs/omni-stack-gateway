// src/controllers/subscription.controller.ts
import { Controller, Post, Get, Req, UseGuards, Query } from '@nestjs/common';
import { SubscriptionService } from '../services/subscription.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
@UseGuards(ClientAuthGuard)
export class SubscriptionController {
    constructor(private subscriptionService: SubscriptionService) {}

    @ApiOperation({ summary: 'Sync products and prices from Stripe' })
    @ApiResponse({
        status: 200,
        description: 'Products and prices synchronized successfully',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                productsCount: { type: 'number' },
                pricesCount: { type: 'number' }
            }
        }
    })
    @Post('sync')
    async syncProductsAndPrices(@Req() req: Request & { client: Client }) {
        return this.subscriptionService.syncProductsAndPrices(req.client.id);
    }

    @ApiOperation({ summary: 'List all products with their prices' })
    @ApiQuery({ name: 'search', required: false, type: String })
    @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'INACTIVE'] })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiResponse({ status: 200, description: 'List of products with associated prices' })
    @Get('products')
    async getProductsWithPrices(
        @Req() req: Request & { client: Client },
        @Query() query: any
    ) {
        return this.subscriptionService.getProductsWithPrices(req.client.id);
    }


    @ApiOperation({ summary: 'Get all subscriptions' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'search', required: false, type: String })
    @ApiQuery({ name: 'status', required: false, enum: ['active', 'past_due', 'canceled', 'trialing', 'incomplete'] })
    @ApiQuery({ name: 'businessId', required: false, type: String })
    @ApiResponse({ status: 200, description: 'Returns a list of subscriptions' })
    @Get()
    async getSubscriptions(
        @Req() req: Request & { client: Client },
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
        @Query('status') status?: string,
        @Query('businessId') businessId?: string
    ) {
        return this.subscriptionService.getSubscriptions(
            req.client.id,
            {
                page,
                limit,
                search,
                status,
                businessId
            }
        );
    }

    @Get('active')
    async getActiveSubscriptions(
        @Req() req: Request & { client: Client },
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
        @Query('businessId') businessId?: string
    ) {
        return this.subscriptionService.getActiveSubscriptions(
            req.client.id,
            {
                page,
                limit,
                search,
                businessId
            }
        );
    }

    @Get('past-due')
    async getPastDueSubscriptions(
        @Req() req: Request & { client: Client },
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
        @Query('businessId') businessId?: string
    ) {
        return this.subscriptionService.getPastDueSubscriptions(
            req.client.id,
            {
                page,
                limit,
                search,
                businessId
            }
        );
    }

    @Get('canceled')
    async getCanceledSubscriptions(
        @Req() req: Request & { client: Client },
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
        @Query('businessId') businessId?: string
    ) {
        return this.subscriptionService.getCanceledSubscriptions(
            req.client.id,
            {
                page,
                limit,
                search,
                businessId
            }
        );
    }
}