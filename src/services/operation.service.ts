import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Operation } from '../schemas/operation.schema';
import { OperationItem } from '../schemas/operation-item.schema';
import { OperationType, OperationStatus } from '../enums/operations.enum';
import { StockMovementService } from './stock-movement.service';
import { StockMovementType } from '../enums/stock.enum';

@Injectable()
export class OperationService {
    constructor(
        @InjectModel(Operation.name) private operationModel: Model<Operation>,
        @InjectModel(OperationItem.name) private operationItemModel: Model<OperationItem>,
        private stockMovementService: StockMovementService
    ) {}

    private generateOperationNumber(type: OperationType, sequence: number): string {
        const prefix = type.substring(0, 2);
        const date = new Date().getFullYear().toString().substring(2);
        return `${prefix}${date}${sequence.toString().padStart(6, '0')}`;
    }

    private mapOperationTypeToMovementType(operationType: OperationType): StockMovementType {
        switch (operationType) {
            case OperationType.PURCHASE:
                return StockMovementType.PURCHASE;
            case OperationType.SALE:
                return StockMovementType.SALE;
            case OperationType.TRANSFER:
                return StockMovementType.TRANSFER_OUT;
            case OperationType.ADJUSTMENT:
                return StockMovementType.ADJUSTMENT;
            case OperationType.RETURN:
                return StockMovementType.RETURN;
            case OperationType.COUNT:
                return StockMovementType.COUNT;
            default:
                throw new BadRequestException('Invalid operation type');
        }
    }

    async create(data: {
        clientId: string;
        warehouseId: string;
        type: OperationType;
        items: Array<{
            productId: string;
            quantity: number;
            unitCost?: number;
            notes?: string;
        }>;
        batchId?: string;
        externalVendorId?: string;
        reference?: string;
        notes?: string;
    }) {
        // Generate operation number
        const sequence = await this.operationModel.countDocuments() + 1;
        const number = this.generateOperationNumber(data.type, sequence);

        // Create operation
        const operation = new this.operationModel({
            clientId: data.clientId,
            warehouseId: data.warehouseId,
            type: data.type,
            number,
            status: OperationStatus.DRAFT,
            batchId: data.batchId,
            externalVendorId: data.externalVendorId,
            reference: data.reference,
            notes: data.notes
        });

        await operation.save();

        // Create operation items
        const items = await Promise.all(
            data.items.map(item =>
                new this.operationItemModel({
                    operationId: operation.id,
                    ...item
                }).save()
            )
        );

        return { operation, items };
    }

    async findAll(query: any = {}) {
        const filters: any = {};

        if (query.clientId) {
            filters.clientId = query.clientId;
        }

        if (query.warehouseId) {
            filters.warehouseId = query.warehouseId;
        }

        if (query.type) {
            filters.type = query.type;
        }

        if (query.status) {
            filters.status = query.status;
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
            this.operationModel
                .find(filters)
                .populate('warehouseId', 'name code')
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 }),
            this.operationModel.countDocuments(filters)
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
        const operation = await this.operationModel
            .findById(id)
            .populate('warehouseId', 'name code');

        if (!operation) {
            throw new NotFoundException('Operation not found');
        }

        const items = await this.operationItemModel
            .find({ operationId: id })
            .populate('productId', 'name code');

        return { operation, items };
    }

    async update(id: string, updateData: Partial<Operation>) {
        const operation = await this.operationModel.findById(id);

        if (!operation) {
            throw new NotFoundException('Operation not found');
        }

        if (operation.status !== OperationStatus.DRAFT) {
            throw new BadRequestException('Cannot update completed or cancelled operation');
        }

        Object.assign(operation, updateData);
        await operation.save();

        return operation;
    }

    async updateItems(id: string, items: Array<{
        id?: string;
        productId: string;
        quantity: number;
        unitCost?: number;
        notes?: string;
    }>) {
        const operation = await this.findOne(id);

        if (operation.operation.status !== OperationStatus.DRAFT) {
            throw new BadRequestException('Cannot update items of completed or cancelled operation');
        }

        // Remove existing items
        await this.operationItemModel.deleteMany({ operationId: id });

        // Create new items
        const newItems = await Promise.all(
            items.map(item =>
                new this.operationItemModel({
                    operationId: id,
                    ...item
                }).save()
            )
        );

        return { operation: operation.operation, items: newItems };
    }

    async complete(id: string) {
        const { operation, items } = await this.findOne(id);

        if (operation.status !== OperationStatus.DRAFT) {
            throw new BadRequestException('Operation cannot be completed');
        }

        // Record stock movements for each item
        await Promise.all(
            items.map(item => {
                const movementType = this.mapOperationTypeToMovementType(operation.type);
                return this.stockMovementService.recordMovement({
                    warehouseId: operation.warehouseId,
                    productId: item.productId,
                    clientId: operation.clientId,
                    type: movementType,
                    quantity: item.quantity,
                    operationId: operation.id,
                    batchId: operation.batchId,
                    reference: operation.reference,
                    notes: item.notes
                });
            })
        );

        // Update operation status
        operation.status = OperationStatus.COMPLETED;
        await operation.save();

        return { operation, items };
    }

    async cancel(id: string, reason?: string) {
        const operation = await this.operationModel.findById(id);

        if (!operation) {
            throw new NotFoundException('Operation not found');
        }

        if (operation.status === OperationStatus.COMPLETED) {
            throw new BadRequestException('Cannot cancel completed operation');
        }

        operation.status = OperationStatus.CANCELLED;
        if (reason) {
            operation.notes = operation.notes
                ? `${operation.notes}\nCancellation reason: ${reason}`
                : `Cancellation reason: ${reason}`;
        }

        await operation.save();

        return operation;
    }

    async getOperationsByProduct(productId: string, query: any = {}) {
        const items = await this.operationItemModel
            .find({ productId })
            .populate({
                path: 'operationId',
                match: {
                    ...(query.status && { status: query.status }),
                    ...(query.type && { type: query.type })
                },
                populate: { path: 'warehouseId', select: 'name code' }
            })
            .sort({ createdAt: -1 });

        return items.filter(item => item.operationId !== null);
    }

    async getOperationsByWarehouse(warehouseId: string, query: any = {}) {
        return this.findAll({
            ...query,
            warehouseId
        });
    }

    async delete(id: string) {
        const operation = await this.operationModel.findById(id);

        if (!operation) {
            throw new NotFoundException('Operation not found');
        }

        if (operation.status !== OperationStatus.DRAFT) {
            throw new BadRequestException('Can only delete draft operations');
        }
        await this.operationItemModel.deleteMany({ operationId: id });

        return this.operationModel.findByIdAndDelete(id).exec();

        // TODO: check this agai
        // await operation.delete();
        // return { message: 'Operation deleted successfully' };
    }
}