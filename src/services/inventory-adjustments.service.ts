// src/services/inventory-adjustment.service.ts
import {BadRequestException, Injectable, NotFoundException} from "@nestjs/common";
import {InventoryAdjustment} from "../schemas/inventory-adjustment.schema";
import {InventoryItem} from "../schemas/inventory-item.schema";
import {CreateAdjustmentDto, ListAdjustmentsDto} from "../dtos/inventory-adjustment.dto";
import {InjectModel} from "@nestjs/mongoose";
import {Product} from "../schemas/product.schema";
import { Document, Model } from 'mongoose';
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

            const adjustment = await this.adjustmentModel.create({
                ...dto,
                status: 'PENDING',
                // TODO: dynamic cost price
                valueImpact: this.calculateValueImpact(dto.type, dto.quantity, 0)
            });

            await session.commitTransaction();
            return adjustment;
        } catch (error) {
            await session.abortTransaction();
            throw error;
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

    private async updateInventory(adjustment: any) {
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

    private calculateValueImpact(type: string, quantity: number, costPrice: number): number {
        switch (type) {
            case 'INCREASE':
                return quantity * costPrice;
            case 'DECREASE':
                return -(quantity * costPrice);
            case 'SET':
                return 0; // Requires current quantity to calculate
            default:
                return 0;
        }
    }
}