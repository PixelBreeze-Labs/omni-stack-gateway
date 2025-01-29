import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Batch } from '../schemas/batch.schema';
import { BatchStatus } from '../enums/batches.enum';

@Injectable()
export class BatchService {
    constructor(
        @InjectModel(Batch.name) private batchModel: Model<Batch>
    ) {}

    async create(data: any): Promise<Batch> {
        const lastBatch = await this.batchModel
            .findOne()
            .sort({ createdAt: -1 });

        const batchNumber = this.generateBatchNumber(lastBatch?.batchNumber);

        const batch = new this.batchModel({
            ...data,
            batchNumber,
            remainingQty: data.quantity,
            status: this.calculateInitialStatus(data.quantity)
        });

        return batch.save();
    }

    private generateBatchNumber(lastNumber?: string): string {
        const year = new Date().getFullYear().toString().slice(-2);
        const month = (new Date().getMonth() + 1).toString().padStart(2, '0');

        if (!lastNumber || !lastNumber.startsWith(`B${year}${month}`)) {
            return `B${year}${month}001`;
        }

        const sequence = parseInt(lastNumber.slice(-3)) + 1;
        return `B${year}${month}${sequence.toString().padStart(3, '0')}`;
    }

    private calculateInitialStatus(quantity: number): BatchStatus {
        return quantity > 0 ? BatchStatus.ACTIVE : BatchStatus.EXPIRED;
    }

    async findAll(query: any) {
        const {
            page = 1,
            pageSize = 10,
            status,
            search,
            warehouseId,
            clientId
        } = query;

        const filter: any = { clientId };

        if (status && status !== 'all') {
            filter.status = status.toUpperCase();
        }

        if (search) {
            filter.$or = [
                { batchNumber: new RegExp(search, 'i') },
                { supplier: new RegExp(search, 'i') }
            ];
        }

        if (warehouseId && warehouseId !== 'all') {
            filter.warehouseId = warehouseId;
        }

        const [items, total] = await Promise.all([
            this.batchModel
                .find(filter)
                .populate('productId', 'name sku')
                .populate('warehouseId', 'name')
                .skip((page - 1) * pageSize)
                .limit(pageSize)
                .sort({ createdAt: -1 }),
            this.batchModel.countDocuments(filter)
        ]);

        const formattedItems = items.map(item => ({
            id: item._id,
            batchNumber: item.batchNumber,
            quantity: item.quantity,
            remainingQty: item.remainingQty,
            status: item.status,
            expiryDate: item.expiryDate,
            received: item.received,
            supplier: item.supplier,
            product: item.productId ? (item.productId as any).name : '',
            sku: item.productId ? (item.productId as any).sku : '',
            warehouse: item.warehouseId ? (item.warehouseId as any).name : '',
            warehouseId: item.warehouseId,
            productId: item.productId
        }));

        return {
            items: formattedItems,
            total,
            page: Number(page),
            pages: Math.ceil(total / pageSize)
        };
    }

    async findOne(id: string) {
        const batch = await this.batchModel
            .findById(id)
            .populate('productId', 'name sku')
            .populate('warehouseId', 'name');

        if (!batch) {
            throw new NotFoundException('Batch not found');
        }

        return batch;
    }

    async update(id: string, updateData: any) {
        const batch = await this.batchModel.findById(id);

        if (!batch) {
            throw new NotFoundException('Batch not found');
        }

        if (updateData.quantity) {
            updateData.remainingQty = updateData.quantity;
            updateData.status = this.calculateInitialStatus(updateData.quantity);
        }

        Object.assign(batch, updateData);
        return batch.save();
    }

    async deactivate(id: string) {
        const batch = await this.batchModel.findById(id);

        if (!batch) {
            throw new NotFoundException('Batch not found');
        }

        batch.status = BatchStatus.EXPIRED;
        return batch.save();
    }

    async remove(id: string) {
        const batch = await this.batchModel.findByIdAndDelete(id);

        if (!batch) {
            throw new NotFoundException('Batch not found');
        }

        return batch;
    }

    async findByProduct(productId: string, clientId: string) {
        return this.batchModel
            .find({ productId, clientId })
            .populate('warehouseId', 'name')
            .sort({ createdAt: -1 });
    }

    async findByWarehouse(warehouseId: string, clientId: string) {
        return this.batchModel
            .find({ warehouseId, clientId })
            .populate('productId', 'name sku')
            .sort({ createdAt: -1 });
    }

    async getActiveBatchesQuantity(productId: string, warehouseId: string) {
        const result = await this.batchModel.aggregate([
            {
                $match: {
                    productId,
                    warehouseId,
                    status: BatchStatus.ACTIVE
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$remainingQty" }
                }
            }
        ]);

        return result[0]?.total || 0;
    }

    async getMetrics(clientId: string) {
        const now = new Date();
        const monthAgo = new Date(now.setMonth(now.getMonth() - 1));

        const [currentMetrics, previousMetrics] = await Promise.all([
            this.getCurrentMetrics(clientId),
            this.getPreviousMetrics(clientId, monthAgo)
        ]);

        return {
            activeBatches: {
                count: currentMetrics.active,
                change: currentMetrics.active - previousMetrics.active
            },
            nearExpiry: {
                count: currentMetrics.nearExpiry,
                change: currentMetrics.nearExpiry - previousMetrics.nearExpiry
            },
            processing: {
                count: currentMetrics.processing,
                change: currentMetrics.processing - previousMetrics.processing
            },
            stockValue: {
                value: currentMetrics.value,
                change: ((currentMetrics.value - previousMetrics.value) / previousMetrics.value * 100) || 0
            }
        };
    }

    private async getCurrentMetrics(clientId: string) {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        const [active, nearExpiry, processing, valueResult] = await Promise.all([
            this.batchModel.countDocuments({
                clientId,
                status: BatchStatus.ACTIVE
            }),
            this.batchModel.countDocuments({
                clientId,
                expiryDate: { $lte: nextMonth },
                status: BatchStatus.ACTIVE
            }),
            this.batchModel.countDocuments({
                clientId,
                status: BatchStatus.PROCESSING
            }),
            this.batchModel.aggregate([
                {
                    $match: {
                        clientId,
                        status: BatchStatus.ACTIVE
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: {
                            $sum: { $multiply: ["$remainingQty", "$unitCost"] }
                        }
                    }
                }
            ])
        ]);

        return {
            active,
            nearExpiry,
            processing,
            value: valueResult[0]?.total || 0
        };
    }

    private async getPreviousMetrics(clientId: string, date: Date) {
        const [active, nearExpiry, processing, valueResult] = await Promise.all([
            this.batchModel.countDocuments({
                clientId,
                status: BatchStatus.ACTIVE,
                createdAt: { $lte: date }
            }),
            this.batchModel.countDocuments({
                clientId,
                status: BatchStatus.ACTIVE,
                expiryDate: { $lte: date },
                createdAt: { $lte: date }
            }),
            this.batchModel.countDocuments({
                clientId,
                status: BatchStatus.PROCESSING,
                createdAt: { $lte: date }
            }),
            this.batchModel.aggregate([
                {
                    $match: {
                        clientId,
                        status: BatchStatus.ACTIVE,
                        createdAt: { $lte: date }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: {
                            $sum: { $multiply: ["$remainingQty", "$unitCost"] }
                        }
                    }
                }
            ])
        ]);

        return {
            active,
            nearExpiry,
            processing,
            value: valueResult[0]?.total || 0
        };
    }
}