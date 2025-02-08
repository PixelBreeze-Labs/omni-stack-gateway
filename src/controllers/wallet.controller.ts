// src/controllers/wallet.controller.ts
import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { WalletService } from '../services/wallet.service';
import { TransactionDto, TransactionFilterDto } from '../dtos/wallet.dto';
import { Client } from '../schemas/client.schema';

@ApiTags('Wallet')
@ApiBearerAuth()
@Controller('wallets')
@UseGuards(ClientAuthGuard)
export class WalletController {
    constructor(private readonly walletService: WalletService) {}

    @Get(':id/balance')
    @ApiOperation({ summary: 'Get wallet balance' })
    @ApiResponse({ status: 200, description: 'Returns the current wallet balance' })
    async getBalance(@Param('id') id: string) {
        const balance = await this.walletService.getBalance(id);
        return { balance };
    }

    @Get(':id/transactions')
    @ApiOperation({ summary: 'Get wallet transaction history' })
    @ApiResponse({ status: 200, description: 'Returns wallet transactions with optional filters' })
    async getTransactions(
        @Param('id') id: string,
        @Query() filters: TransactionFilterDto
    ) {
        return this.walletService.getTransactionHistory(id, filters);
    }

    @Post(':id/credit')
    @ApiOperation({ summary: 'Add credit to wallet' })
    @ApiResponse({ status: 200, description: 'Credit added successfully' })
    async addCredit(
        @Param('id') id: string,
        @Body() transactionDto: TransactionDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.walletService.addCredit(id, transactionDto.amount, {
            ...transactionDto,
            processedBy: req.client.id
        });
    }

    @Post(':id/debit')
    @ApiOperation({ summary: 'Deduct amount from wallet' })
    @ApiResponse({ status: 200, description: 'Amount deducted successfully' })
    @ApiResponse({ status: 400, description: 'Insufficient balance' })
    async deductAmount(
        @Param('id') id: string,
        @Body() transactionDto: TransactionDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.walletService.deductAmount(id, transactionDto.amount, {
            ...transactionDto,
            processedBy: req.client.id
        });
    }
}