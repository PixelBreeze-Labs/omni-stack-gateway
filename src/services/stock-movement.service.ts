import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StockMovement } from '../schemas/stock-movement.schema';
import { StockMovementType } from '../enums/stock.enum';
import { StockLevelService } from './stock-level.service';

@Injectable()
export class StockMovementService {
    constructor(
        @InjectModel(StockMovement.name) private stockMovementModel: Model<StockMovement>,
        private stockLevelService: StockLevelService
    ) {}

    async recordMovement(data: {
        warehouseId: string;
        productId: string;
        clientId: string;
        type: StockMovementType;
        quantity: number;
        operationId?: string;
        batchId?: string;
        reference?: string;
        notes?: string;
    }) {
        // Get current stock level
        const currentLevel = await this.stockLevelService.findOne(
            data.warehouseId,
            data.productId
        );

        const previousStock = currentLevel.currentStock;

        // Calculate new stock based on movement type
        let quantityChange = data.quantity;
        if (
            data.type === StockMovementType.SALE ||
            data.type === StockMovementType.TRANSFER_OUT
        ) {
            quantityChange = -data.quantity;
        }

        // Update stock level
        await this.stockLevelService.updateQuantity(
            data.warehouseId,
            data.productId,
            quantityChange
        );

        // Create movement record
        const movement = new this.stockMovementModel({
            ...data,
            previousStock,
            newStock: previousStock + quantityChange
        });

        return movement.save();
    }

    async findAll(query: any = {}) {
        const filters: any = {};

        if (query.warehouseId) {
            filters.warehouseId = query.warehouseId;
        }

        if (query.productId) {
            filters.productId = query.productId;
        }

        if (query.type) {
            filters.type = query.type;
        }

        if (query.startDate || query.endDate) {
            filters.createdAt = {};
            if (query.startDate) {
                filters.createdAt.$gte = new Date(query.startDate);
            }
            if (query.endDate) {
                filters.createdAt.$lte = new Date(query.endDate);
            }
        }

        const page = query.page || 1;
        const limit = query.limit || 10;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            this.stockMovementModel
                .find(filters)
                .populate('productId', 'name code')
                .populate('warehouseId', 'name code')
                .populate('operationId', 'number type')
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 }),
            this.stockMovementModel.countDocuments(filters)
        ]);

        return {
            items,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        };
    }

    async getProductMovements(productId: string, startDate?: Date, endDate?: Date) {
        const filters: any = { productId };

        if (startDate || endDate) {
            filters.createdAt = {};
            if (startDate) {
                filters.createdAt.$gte = startDate;
            }
            if (endDate) {
                filters.createdAt.$lte = endDate;
            }
        }

        return this.stockMovementModel
            .find(filters)
            .populate('warehouseId', 'name code')
            .populate('operationId', 'number type')
            .sort({ createdAt: -1 });
    }

    async getWarehouseMovements(warehouseId: string, startDate?: Date, endDate?: Date) {
        const filters: any = { warehouseId };

        if (startDate || endDate) {
            filters.createdAt = {};
            if (startDate) {
                filters.createdAt.$gte = startDate;
            }
            if (endDate) {
                filters.createdAt.$lte = endDate;
            }
        }

        return this.stockMovementModel
            .find(filters)
            .populate('productId', 'name code')
            .populate('operationId', 'number type')
            .sort({ createdAt: -1 });
    }
}