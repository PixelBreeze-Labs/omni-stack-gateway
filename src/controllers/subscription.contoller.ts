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
}