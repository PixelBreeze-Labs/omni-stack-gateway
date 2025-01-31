// src/controllers/sync.controller.ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { SyncService } from '../services/sync.service';
import {
    SyncPricesDto,
    SyncStocksDto,
    SyncProductsDto,
    SyncResponseDto
} from '../dtos/sync.dto';
import { Client } from '../schemas/client.schema';
import { GetClient } from '../decorators/get-client.decorator';

@ApiTags('Synchronization')
@Controller('sync')
@UseGuards(ClientAuthGuard)
export class SyncController {
    constructor(private readonly syncService: SyncService) {}

    @Post('prices')
    @ApiOperation({ summary: 'Sync prices' })
    @ApiResponse({
        status: 200,
        description: 'Prices synchronized successfully',
        type: SyncResponseDto
    })
    async syncPrices(
        @GetClient() client: Client,
        @Body() syncDto: SyncPricesDto
    ) {
        return this.syncService.syncPrices(client, syncDto);
    }

    @Post('stocks')
    @ApiOperation({ summary: 'Sync stocks' })
    @ApiResponse({
        status: 200,
        description: 'Stocks synchronized successfully',
        type: SyncResponseDto
    })
    async syncStocks(
        @GetClient() client: Client,
        @Body() syncDto: SyncStocksDto
    ) {
        return this.syncService.syncStocks(client, syncDto);
    }

    @Post('products')
    @ApiOperation({ summary: 'Sync products' })
    @ApiResponse({
        status: 200,
        description: 'Products synchronized successfully',
        type: SyncResponseDto
    })
    async syncProducts(
        @GetClient() client: Client,
        @Body() syncDto: SyncProductsDto
    ) {
        return this.syncService.syncProducts(client, syncDto);
    }
}