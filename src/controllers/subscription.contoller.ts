// src/controllers/subscription.controller.ts
import { Controller, Post, Get, Req, UseGuards } from '@nestjs/common';
import { SubscriptionService } from '../services/subscription.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

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

    @ApiOperation({ summary: 'List all Stripe products available to the client' })
    @ApiResponse({ status: 200, description: 'List of Stripe products' })
    @Get('products')
    async getClientProducts(@Req() req: Request & { client: Client }) {
        return this.subscriptionService.getClientProducts(req.client.id);
    }

    @ApiOperation({ summary: 'List all Stripe prices available to the client' })
    @ApiResponse({ status: 200, description: 'List of Stripe prices' })
    @Get('prices')
    async getClientPrices(@Req() req: Request & { client: Client }) {
        return this.subscriptionService.getClientPrices(req.client.id);
    }

    @ApiOperation({ summary: 'Fetch raw products data directly from Stripe' })
    @ApiResponse({ status: 200, description: 'Raw Stripe products data' })
    @Get('stripe/products')
    async listStripeProducts(@Req() req: Request & { client: Client }) {
        return this.subscriptionService.listStripeProducts(req.client.id);
    }

    @ApiOperation({ summary: 'Fetch raw prices data directly from Stripe' })
    @ApiResponse({ status: 200, description: 'Raw Stripe prices data' })
    @Get('stripe/prices')
    async listStripePrices(@Req() req: Request & { client: Client }) {
        return this.subscriptionService.listStripePrices(req.client.id);
    }
}