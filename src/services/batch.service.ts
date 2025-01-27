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

    async create(data: Partial<Batch>): Promise<Batch> {
        const batch = new this.batchModel(data);
        return batch.save();
    }

    async findAll(query: any = {}) {
        const filters: any = {};

        if (query.clientId) {
            filters.clientId = query.clientId;
        }

        if (query.warehouseId) {
            filters.warehouseId = query.warehouseId;
        }

        if (query.productId) {
            filters.productId = query.productId;
        }

        if (query.status) {
            filters.status = query.status;
        }

        if (query.batchNumber) {
            filters.batchNumber = new RegExp(query.batchNumber, 'i');
        }

        const page = query.page || 1;
        const limit = query.limit || 10;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            this.batchModel
                .find(filters)
                .populate('productId', 'name code')
                .populate('warehouseId', 'name code')
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 }),
            this.batchModel.countDocuments(filters)
        ]);

        return {
            items,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        };
    }

    async findOne(id: string) {
        const batch = await this.batchModel
            .findById(id)
            .populate('productId', 'name code')
            .populate('warehouseId', 'name code');

        if (!batch) {
            throw new NotFoundException('Batch not found');
        }

        return batch;
    }

    async update(id: string, updateData: Partial<Batch>) {
        const batch = await this.batchModel.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true }
        ).populate('productId', 'name code')
            .populate('warehouseId', 'name code');

        if (!batch) {
            throw new NotFoundException('Batch not found');
        }

        return batch;
    }

    async deactivate(id: string) {
        const batch = await this.batchModel.findByIdAndUpdate(
            id,
            { $set: { status: BatchStatus.INACTIVE } },
            { new: true }
        );

        if (!batch) {
            throw new NotFoundException('Batch not found');
        }

        return batch;
    }

    async remove(id: string) {
        const batch = await this.batchModel.findByIdAndDelete(id);

        if (!batch) {
            throw new NotFoundException('Batch not found');
        }

        return batch;
    }

    async findByProduct(productId: string, clientId: string) {
        return this.batchModel.find({
            productId,
            clientId,
            status: BatchStatus.ACTIVE
        });
    }

    async findByWarehouse(warehouseId: string, clientId: string) {
        return this.batchModel.find({
            warehouseId,
            clientId,
            status: BatchStatus.ACTIVE
        });
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
                    totalQuantity: { $sum: "$quantity" }
                }
            }
        ]);

        return result[0]?.totalQuantity || 0;
    }
}