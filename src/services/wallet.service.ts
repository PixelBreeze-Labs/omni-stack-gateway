// src/services/wallet.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Wallet } from '../schemas/wallet.schema';

@Injectable()
export class WalletService {
    constructor(
        @InjectModel(Wallet.name) private walletModel: Model<Wallet>
    ) {}

    async findOrCreateWallet(userId: string, clientId: string, currency: string = 'EUR'): Promise<Wallet> {
        try {
            const wallet = await this.walletModel.findOne({
                userId,
                clientId
            }).lean();

            if (!wallet) {
                try {
                    const newWallet = new this.walletModel({
                        userId,
                        clientId,
                        currency,
                        balance: 0,
                        isActive: true,
                        transactions: []
                    });
                    return await newWallet.save();
                } catch (createError) {
                    throw new BadRequestException({
                        message: 'Failed to create wallet',
                        error: createError.message,
                        details: { userId, clientId, currency }
                    });
                }
            }

            return wallet;
        } catch (error) {
            throw new BadRequestException({
                message: 'Wallet operation failed',
                error: error.message,
                stack: error.stack,
                details: { userId, clientId, operation: 'findOrCreateWallet' }
            });
        }
    }

    async addCredit(walletId: string, amount: number, data: {
        description: string;
        source: 'points_redemption' | 'refund' | 'manual_adjustment' | 'reward';
        metadata?: Record<string, any>;
        processedBy?: string;
    }): Promise<Wallet> {
        if (amount <= 0) {
            throw new BadRequestException('Credit amount must be positive');
        }

        const wallet = await this.walletModel.findById(walletId);
        if (!wallet) {
            throw new NotFoundException('Wallet not found');
        }

        const transaction = {
            amount,
            currency: wallet.currency,
            type: 'credit',
            description: data.description,
            source: data.source,
            metadata: data.metadata,
            processedBy: data.processedBy,
            timestamp: new Date()
        };

        return this.walletModel.findByIdAndUpdate(
            walletId,
            {
                $inc: { balance: amount },
                $push: { transactions: transaction }
            },
            { new: true }
        );
    }

    async deductAmount(walletId: string, amount: number, data: {
        description: string;
        source: 'points_redemption' | 'refund' | 'manual_adjustment' | 'reward';
        metadata?: Record<string, any>;
        processedBy?: string;
    }): Promise<Wallet> {
        if (amount <= 0) {
            throw new BadRequestException('Deduction amount must be positive');
        }

        const wallet = await this.walletModel.findById(walletId);
        if (!wallet) {
            throw new NotFoundException('Wallet not found');
        }

        if (wallet.balance < amount) {
            throw new BadRequestException('Insufficient wallet balance');
        }

        const transaction = {
            amount,
            currency: wallet.currency,
            type: 'debit',
            description: data.description,
            source: data.source,
            metadata: data.metadata,
            processedBy: data.processedBy,
            timestamp: new Date()
        };

        return this.walletModel.findByIdAndUpdate(
            walletId,
            {
                $inc: { balance: -amount },
                $push: { transactions: transaction }
            },
            { new: true }
        );
    }

    async getTransactionHistory(walletId: string, filters?: {
        startDate?: Date;
        endDate?: Date;
        source?: string;
        type?: 'credit' | 'debit';
    }): Promise<Wallet> {
        const query: any = { _id: walletId };
        const transactionMatch: any = {};

        if (filters) {
            if (filters.startDate || filters.endDate) {
                transactionMatch['transactions.timestamp'] = {};
                if (filters.startDate) {
                    transactionMatch['transactions.timestamp'].$gte = filters.startDate;
                }
                if (filters.endDate) {
                    transactionMatch['transactions.timestamp'].$lte = filters.endDate;
                }
            }
            if (filters.source) {
                transactionMatch['transactions.source'] = filters.source;
            }
            if (filters.type) {
                transactionMatch['transactions.type'] = filters.type;
            }
        }

        return this.walletModel.findOne(query)
            .select(Object.keys(transactionMatch).length ? {
                transactions: {
                    $filter: {
                        input: '$transactions',
                        cond: transactionMatch
                    }
                }
            } : {});
    }

    async getBalance(walletId: string): Promise<number> {
        const wallet = await this.walletModel.findById(walletId);
        if (!wallet) {
            throw new NotFoundException('Wallet not found');
        }
        return wallet.balance;
    }

    async getTransactions(walletId: string): Promise<any[]> {
        const wallet = await this.walletModel.findById(walletId);
        if (!wallet) {
            throw new NotFoundException('Wallet not found');
        }

        // Return transactions sorted by timestamp in descending order (newest first)
        return wallet.transactions.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    }
}