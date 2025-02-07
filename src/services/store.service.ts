import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Store } from '../schemas/store.schema';
import { Address } from '../schemas/address.schema';
import { Client } from '../schemas/client.schema';
import { User } from '../schemas/user.schema';
import { CreateStoreDto, UpdateStoreDto, ListStoreDto } from '../dtos/store.dto';
import { CreateAddressDto } from '../dtos/address.dto';

interface PopulatedStore extends Omit<Store, 'address'> {
    address?: {
        addressLine1: string;
        addressLine2?: string;
        postcode: string;
        city: any;
        state: any;
        country: any;
    };
}
@Injectable()
export class StoreService {
    constructor(
        @InjectModel(Store.name) private storeModel: Model<Store>,
        @InjectModel(Address.name) private addressModel: Model<Address>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        @InjectModel(User.name) private userModel: Model<User>,
    ) {}

    async create(storeData: CreateStoreDto & { clientId: string }) {
        // First create the address
        const addressData = {
            addressLine1: storeData.addressLine1,
            addressLine2: storeData.addressLine2,
            postcode: storeData.postcode,
            cityId: storeData.cityId,
            stateId: storeData.stateId,
            countryId: storeData.countryId
        };

        const address = await this.addressModel.create(addressData);

        // Then create store with the new address
        const store = await this.storeModel.create({
            name: storeData.name,
            code: storeData.code,
            clientId: storeData.clientId,
            addressId: address._id,
            isActive: true,
            externalIds: storeData.externalIds
        });

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
                populate: [
                    {
                        path: 'city',
                        model: 'City'
                    },
                    {
                        path: 'state',
                        model: 'State'
                    },
                    {
                        path: 'country',
                        model: 'Country'
                    }
                ]
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit) as unknown as PopulatedStore[];

        const items = stores.map(store => {
            const storeObj = store.toObject({ virtuals: true });
            return {
                ...storeObj,
                id: store._id,
                status: store.isActive ? 'ACTIVE' : 'INACTIVE',
                address: storeObj.address ? {
                    addressLine1: storeObj.address.addressLine1,
                    addressLine2: storeObj.address.addressLine2,
                    postcode: storeObj.address.postcode,
                    city: storeObj.address.city,
                    state: storeObj.address.state,
                    country: storeObj.address.country
                } : undefined
            };
        });

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

    async findConnectedStores(clientId: string) {
        const client = await this.clientModel.findById(clientId);
        if (!client?.venueBoostConnection?.venueShortCode) {
            return [];
        }

        // Find another client with same venueShortCode
        const connectedClient = await this.clientModel.findOne({
            _id: { $ne: clientId }, // Exclude current client
            'venueBoostConnection.venueShortCode': client.venueBoostConnection.venueShortCode,
            'venueBoostConnection.status': 'connected'
        });

        if (!connectedClient) {
            return [];
        }

        const stores = await this.storeModel
            .find({
                clientId: connectedClient._id,
                isActive: true,
                deletedAt: null
            })
            .populate({
                path: 'address',
                populate: ['city', 'state', 'country']
            });

        return stores.map(store => ({
            ...store.toObject({ virtuals: true }),
            id: store._id,
            status: store.isActive ? 'ACTIVE' : 'INACTIVE',
            address: store.address ? {
                addressLine1: store.address.addressLine1,
                addressLine2: store.address.addressLine2,
                postcode: store.address.postcode,
                city: store.address.city,
                state: store.address.state,
                country: store.address.country
            } : undefined
        }));
    }

    async connectUser(storeId: string, userId: string, clientId: string) {
        const store = await this.storeModel.findOne({ _id: storeId, clientId });
        if (!store) throw new NotFoundException('Store not found');

        await this.storeModel.findByIdAndUpdate(storeId, {
            $addToSet: { userIds: userId }
        });

        await this.userModel.findByIdAndUpdate(userId, {
            $addToSet: { storeIds: storeId }
        });

        return { message: 'User connected to store successfully' };
    }

    async disconnectUser(storeId: string, userId: string, clientId: string) {
        const store = await this.storeModel.findOne({ _id: storeId, clientId });
        if (!store) throw new NotFoundException('Store not found');

        await this.storeModel.findByIdAndUpdate(storeId, {
            $pull: { userIds: userId }
        });

        await this.userModel.findByIdAndUpdate(userId, {
            $pull: { storeIds: storeId },
            $unset: { primaryStoreId: 1 }
        });

        return { message: 'User disconnected from store successfully' };
    }
}