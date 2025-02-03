import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Store } from '../schemas/store.schema';
import { Address } from '../schemas/address.schema';
import { CreateStoreDto, UpdateStoreDto, ListStoreDto } from '../dtos/store.dto';
import { CreateAddressDto } from '../dtos/address.dto';

interface PopulatedStore extends Store {
    address?: Address & {
        city?: any;
        state?: any;
        country?: any;
    }
}

@Injectable()
export class StoreService {
    constructor(
        @InjectModel(Store.name) private storeModel: Model<Store>,
        @InjectModel(Address.name) private addressModel: Model<Address>
    ) {}

    async create(storeData: CreateStoreDto & { clientId: string }) {
        // Create store with basic data
        const storeToCreate = {
            name: storeData.name,
            code: storeData.code,
            clientId: storeData.clientId,
            isActive: true
        };

        // Add address if provided
        if (storeData.addressId) {
            storeToCreate['address'] = storeData.addressId;
        }

        // Add external IDs if provided
        if (storeData.externalIds) {
            storeToCreate['externalIds'] = storeData.externalIds;
        }

        const store = await this.storeModel.create(storeToCreate);

        // Return populated store
        return await this.storeModel
            .findById(store._id)
            .populate({
                path: 'address',
                populate: ['city', 'state', 'country']
            });
    }

    async createAddress(addressData: CreateAddressDto & { clientId: string }) {
        const address = await this.addressModel.create({
            ...addressData,
            clientId: addressData.clientId
        });

        return address;
    }

    async findAll(query: ListStoreDto & { clientId: string }) {
        const { clientId, search, limit = 10, page = 1, status } = query;
        const skip = (page - 1) * limit;

        const filters: any = { clientId };

        if (search) {
            filters.$or = [
                { name: new RegExp(search, 'i') },
                { code: new RegExp(search, 'i') }
            ];
        }

        if (status && status !== 'ALL') {
            filters.isActive = status === 'ACTIVE';
        }

        const total = await this.storeModel.countDocuments(filters);
        const totalPages = Math.ceil(total / limit);

        const stores = await this.storeModel
            .find(filters)
            .populate({
                path: 'address',
                populate: ['city', 'state', 'country']
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit) as unknown as PopulatedStore[];

        const items = stores.map(store => ({
            ...store.toObject(),
            id: store._id,
            status: store.isActive ? 'ACTIVE' : 'INACTIVE',
            address: store.address ? {
                ...store.address,
                city: store.address.city,
                state: store.address.state,
                country: store.address.country
            } : undefined
        }));

        return {
            items,
            total,
            pages: totalPages,
            page,
            limit
        };
    }

    async update(id: string, clientId: string, updateStoreDto: UpdateStoreDto) {
        const updateData: any = {
            ...updateStoreDto
        };

        // Handle address update if provided
        if (updateStoreDto.addressId) {
            updateData.address = updateStoreDto.addressId;
        }

        const store = await this.storeModel.findOneAndUpdate(
            { _id: id, clientId },
            { $set: updateData },
            { new: true }
        ).populate({
            path: 'address',
            populate: ['city', 'state', 'country']
        });

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

    async findOne(id: string, clientId: string) {
        const store = await this.storeModel
            .findOne({ _id: id, clientId })
            .populate({
                path: 'address',
                populate: ['city', 'state', 'country']
            });

        if (!store) {
            throw new NotFoundException('Store not found');
        }

        return store;
    }

    async hardDelete(id: string, clientId: string) {
        const store = await this.storeModel
            .findOne({ _id: id, clientId });

        if (!store) {
            throw new NotFoundException('Store not found');
        }

        await this.storeModel.findByIdAndDelete(id);

        return { message: 'Store deleted successfully' };
    }
}