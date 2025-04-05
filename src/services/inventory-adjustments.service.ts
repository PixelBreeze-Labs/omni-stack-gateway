// src/services/inventory-adjustment.service.ts
import {BadRequestException, Injectable, NotFoundException} from "@nestjs/common";
import {InventoryAdjustment} from "../schemas/inventory-adjustment.schema";
import {InventoryItem} from "../schemas/inventory-item.schema";
import {CreateAdjustmentDto, ListAdjustmentsDto} from "../dtos/inventory-adjustment.dto";
import {InjectModel} from "@nestjs/mongoose";
import {Product} from "../schemas/product.schema";
import { Document, Model, ClientSession } from 'mongoose';
import {IInventoryAdjustment} from "../interfaces/inventory-adjustment.interface";

@Injectable()
export class InventoryAdjustmentService {
    constructor(
        @InjectModel(InventoryAdjustment.name) private adjustmentModel: Model<InventoryAdjustment>,
        @InjectModel(Product.name) private productModel: Model<Product>,
        @InjectModel(InventoryItem.name) private inventoryModel: Model<InventoryItem>
    ) {}

    async create(dto: CreateAdjustmentDto & { clientId: string }) {
        const session = await this.adjustmentModel.startSession();
        try {
            session.startTransaction();

            const product = await this.productModel.findById(dto.productId);
            if (!product) throw new NotFoundException('Product not found');

            // Get current inventory to calculate value impact for SET operations
            const currentInventory = await this.inventoryModel.findOne({
                productId: dto.productId,
                warehouseId: dto.warehouseId
            });

            // Get product cost price (fallback to 0 if not available)
            const costPrice = product.costPrice || 0;
            
            // Calculate value impact based on current inventory and cost price
            const valueImpact = this.calculateValueImpact(
                dto.type, 
                dto.quantity, 
                costPrice, 
                currentInventory?.quantity || 0
            );

            const adjustment = await this.adjustmentModel.create([{
                ...dto,
                status: 'PENDING',
                valueImpact
            }], { session });

            await session.commitTransaction();
            return adjustment[0];
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            await session.endSession();
        }
    }

    async findAll(query: ListAdjustmentsDto & { clientId: string }) {
        const { status, warehouseId, page = 1, limit = 10, clientId } = query;

        const filter: any = { clientId };
        if (status) filter.status = status;
        if (warehouseId) filter.warehouseId = warehouseId;

        const [items, total] = await Promise.all([
            this.adjustmentModel
                .find(filter)
                .populate('productId')
                .populate('warehouseId')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            this.adjustmentModel.countDocuments(filter)
        ]);

        return {
            items,
            total,
            page,
            limit
        };
    }

    async findOne(id: string, clientId: string) {
        const adjustment = await this.adjustmentModel
            .findOne({ _id: id, clientId })
            .populate('productId')
            .populate('warehouseId');

        if (!adjustment) throw new NotFoundException('Adjustment not found');
        return adjustment;
    }

    async approve(id: string, approvedBy: string, clientId: string) {
        const adjustment = await this.adjustmentModel
            .findOneAndUpdate(
                { _id: id, clientId, status: 'PENDING' },
                {
                    $set: {
                        status: 'COMPLETED',
                        approvedBy
                    }
                },
                { new: true }
            );

        if (!adjustment) {
            throw new NotFoundException('Adjustment not found or not pending');
        }

        await this.updateInventory(adjustment);
        return adjustment;
    }

    async reject(id: string, reason: string, clientId: string) {
        return this.adjustmentModel.findOneAndUpdate(
            { _id: id, clientId },
            {
                status: 'REJECTED',
                reason
            },
            { new: true }
        );
    }

    private async updateInventory(adjustment: InventoryAdjustment) {
        const update = this.getInventoryUpdate(adjustment);
        await this.inventoryModel.updateOne(
            {
                productId: adjustment.productId,
                warehouseId: adjustment.warehouseId
            },
            update,
            { upsert: true } as any
        );
    }

    private getInventoryUpdate(adjustment: InventoryAdjustment) {
        switch (adjustment.type) {
            case 'INCREASE':
                return { $inc: { quantity: adjustment.quantity } };
            case 'DECREASE':
                return { $inc: { quantity: -adjustment.quantity } };
            case 'SET':
                return { $set: { quantity: adjustment.quantity } };
            default:
                throw new BadRequestException('Invalid adjustment type');
        }
    }

    private calculateValueImpact(type: string, quantity: number, costPrice: number, currentQuantity: number = 0): number {
        switch (type) {
            case 'INCREASE':
                return quantity * costPrice;
            case 'DECREASE':
                return -(quantity * costPrice);
            case 'SET':
                // Calculate the difference between current and new quantity
                const quantityDifference = quantity - currentQuantity;
                return quantityDifference * costPrice;
            default:
                return 0;
        }
    }
}