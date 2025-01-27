import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StockLevel } from '../schemas/stock-level.schema';

@Injectable()
export class StockLevelService {
    constructor(
        @InjectModel(StockLevel.name) private stockLevelModel: Model<StockLevel>
    ) {}

    async findAll(query: any = {}) {
        const filters: any = {};

        if (query.warehouseId) {
            filters.warehouseId = query.warehouseId;
        }

        if (query.productId) {
            filters.productId = query.productId;
        }

        if (query.clientId) {
            filters.clientId = query.clientId;
        }

        if (query.belowReorderPoint) {
            filters.$expr = { $lt: ['$currentStock', '$reorderPoint'] };
        }

        const page = query.page || 1;
        const limit = query.limit || 10;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            this.stockLevelModel
                .find(filters)
                .populate('productId', 'name code')
                .populate('warehouseId', 'name code')
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 }),
            this.stockLevelModel.countDocuments(filters)
        ]);

        return {
            items,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        };
    }

    async findOne(warehouseId: string, productId: string) {
        const stockLevel = await this.stockLevelModel
            .findOne({ warehouseId, productId })
            .populate('productId', 'name code')
            .populate('warehouseId', 'name code');

        if (!stockLevel) {
            throw new NotFoundException('Stock level not found');
        }

        return stockLevel;
    }

    async createOrUpdate(warehouseId: string, productId: string, clientId: string, updates: Partial<StockLevel>) {
        const stockLevel = await this.stockLevelModel.findOneAndUpdate(
            { warehouseId, productId, clientId },
            { $set: updates },
            { new: true, upsert: true }
        );

        return stockLevel;
    }

    async updateQuantity(warehouseId: string, productId: string, quantity: number) {
        const stockLevel = await this.stockLevelModel.findOneAndUpdate(
            { warehouseId, productId },
            {
                $inc: { currentStock: quantity },
                $set: { lastMovementDate: new Date() }
            },
            { new: true }
        );

        if (!stockLevel) {
            throw new NotFoundException('Stock level not found');
        }

        return stockLevel;
    }

    async recordCount(warehouseId: string, productId: string, quantity: number) {
        const stockLevel = await this.stockLevelModel.findOneAndUpdate(
            { warehouseId, productId },
            {
                $set: {
                    currentStock: quantity,
                    lastCountDate: new Date()
                }
            },
            { new: true }
        );

        if (!stockLevel) {
            throw new NotFoundException('Stock level not found');
        }

        return stockLevel;
    }

    async getLowStockItems(clientId: string) {
        return this.stockLevelModel.find({
            clientId,
            $expr: { $lt: ['$currentStock', '$reorderPoint'] }
        }).populate('productId', 'name code');
    }
}