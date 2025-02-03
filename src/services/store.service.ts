// src/services/store.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Store } from '../schemas/store.schema';
import { CreateStoreDto, UpdateStoreDto, ListStoreDto } from '../dtos/store.dto';

@Injectable()
export class StoreService {
    constructor(
        @InjectModel(Store.name) private storeModel: Model<Store>
    ) {}

    async create(storeData: CreateStoreDto & { clientId: string }) {
        const store = await this.storeModel.create({
            ...storeData,
            isActive: true
        });

        return store;
    }

    async findAll(query: ListStoreDto & { clientId: string }) {
        const { clientId, search, limit = 10, page = 1, status } = query;
        const skip = (page - 1) * limit;

        // Build base filters
        const filters: any = { clientId };

        // Add search filter if present
        if (search) {
            filters.$or = [
                { name: new RegExp(search, 'i') },
                { code: new RegExp(search, 'i') }
            ];
        }

        // Add status filters
        if (status && status !== 'ALL') {
            filters.isActive = status === 'ACTIVE';
        }

        // Get total count for pagination
        const total = await this.storeModel.countDocuments(filters);
        const totalPages = Math.ceil(total / limit);

        // Get paginated stores with populated address
        const stores = await this.storeModel
            .find(filters)
            .populate('address')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const items = stores.map(store => ({
            ...store.toObject(),
            id: store._id,
            status: store.isActive ? 'ACTIVE' : 'INACTIVE'
        }));

        return {
            items,
            total,
            pages: totalPages,
            page,
            limit
        };
    }

    async findOne(id: string, clientId: string) {
        const store = await this.storeModel
            .findOne({ _id: id, clientId })
            .populate('address');

        if (!store) {
            throw new NotFoundException('Store not found');
        }

        return store;
    }

    async update(id: string, clientId: string, updateStoreDto: UpdateStoreDto) {
        const store = await this.storeModel.findOneAndUpdate(
            { _id: id, clientId },
            { $set: updateStoreDto },
            { new: true }
        ).populate('address');

        if (!store) {
            throw new NotFoundException('Store not found');
        }

        return store;
    }

    async remove(id: string, clientId: string) {
        const store = await this.storeModel.findOne({ _id: id, clientId });
        if (!store) {
            throw new NotFoundException('Store not found');
        }

        // Soft delete by setting isActive to false and deletedAt
        await this.storeModel.findByIdAndUpdate(
            id,
            {
                $set: {
                    isActive: false,
                    deletedAt: new Date()
                }
            },
            { new: true }
        );

        return { message: 'Store deactivated successfully' };
    }

    async hardDelete(id: string, clientId: string) {
        const store = await this.storeModel.findOne({ _id: id, clientId });
        if (!store) {
            throw new NotFoundException('Store not found');
        }

        await this.storeModel.findByIdAndDelete(id);

        return { message: 'Store deleted successfully' };
    }
}