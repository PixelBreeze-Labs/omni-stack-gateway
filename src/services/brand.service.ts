// src/services/brand.service.ts
import {Injectable, NotFoundException, BadRequestException} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {BrandApiConfig} from "../schemas/brand-api-config.schema";
import {Brand} from "../schemas/brand.schema";
import {CreateBrandApiConfigDto, CreateBrandDto, ListBrandDto, UpdateBrandApiConfigDto} from "../dtos/brand.dto";


@Injectable()
@Injectable()
export class BrandService {
    constructor(
        @InjectModel(Brand.name) private brandModel: Model<Brand>,
        @InjectModel(BrandApiConfig.name) private configModel: Model<BrandApiConfig>
    ) {}

    async createWithConfig(
        brandData: CreateBrandDto & { clientId: string },
        apiConfig?: CreateBrandApiConfigDto
    ) {
        // Create the brand with clientId
        const brand = await this.brandModel.create({
            name: brandData.name,
            code: brandData.code,
            clientId: brandData.clientId,
            description: brandData.description,
            isActive: true
        });

        // If apiConfig exists and has non-empty values, create the config
        if (apiConfig && (apiConfig.apiKey || apiConfig.endpoint ||
            Object.keys(apiConfig.endpoints || {}).length > 0 ||
            Object.keys(apiConfig.headers || {}).length > 0)) {

            await this.configModel.create({
                ...apiConfig,
                brandId: brand.id,
                isAutoSyncEnabled: apiConfig.isAutoSyncEnabled ?? false,
                lastSyncStatus: undefined,
                lastSyncAttempt: undefined
            });
        }

        return brand;
    }


    async findAll(query: ListBrandDto & { clientId: string }) {
        const { clientId, search, limit = 10, page = 1, status } = query;
        const skip = (page - 1) * limit;

        // First, get all brand IDs with API configs
        let connectedBrandIds: string[] = [];
        if (status === 'CONNECTED' || status === 'DISCONNECTED') {
            const configs = await this.configModel.find({
                $and: [
                    { apiKey: { $exists: true, $ne: '' } },
                    { endpoint: { $exists: true, $ne: '' } }
                ]
            });
            connectedBrandIds = configs.map(config => config.brandId.toString());
        }

        // Build base filters
        const filters: any = { clientId };

        // Add search filter if present
        if (search) {
            filters.$or = [
                { name: new RegExp(search, 'i') },
                { code: new RegExp(search, 'i') },
                { description: new RegExp(search, 'i') }
            ];
        }

        // Add status filters
        switch(status?.toUpperCase()) {
            case 'ACTIVE':
                filters.isActive = true;
                break;
            case 'INACTIVE':
                filters.isActive = false;
                break;
            case 'CONNECTED':
                filters._id = { $in: connectedBrandIds };
                break;
            case 'DISCONNECTED':
                filters._id = { $nin: connectedBrandIds };
                break;
        }

        // Get total count for pagination
        const total = await this.brandModel.countDocuments(filters);
        const totalPages = Math.ceil(total / limit);

        // Get paginated brands
        const brands = await this.brandModel
            .find(filters)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Fetch associated API configs
        const items = await Promise.all(
            brands.map(async (brand) => {
                const config = await this.configModel.findOne({ brandId: brand.id });
                const isConnected = !!config && !!config.apiKey && !!config.endpoint;

                return {
                    ...brand.toObject(),
                    id: brand._id,
                    apiConfig: config,
                    status: brand.isActive ? 'ACTIVE' : 'INACTIVE',
                    isConnected,
                    totalProducts: 0, // You might want to fetch this from another service
                    lastSync: config?.lastSyncAttempt || null
                };
            })
        );

        return {
            items,
            total,
            pages: totalPages,
            page,
            limit
        };
    }

    async remove(id: string, clientId: string) {
        const brand = await this.brandModel.findOne({ _id: id, clientId });
        if (!brand) {
            throw new NotFoundException('Brand not found');
        }

        // Soft delete by setting isActive to false
        await this.brandModel.findByIdAndUpdate(
            id,
            { $set: { isActive: false } },
            { new: true }
        );

        return { message: 'Brand deactivated successfully' };
    }

    async hardDelete(id: string, clientId: string) {
        const brand = await this.brandModel.findOne({ _id: id, clientId });
        if (!brand) {
            throw new NotFoundException('Brand not found');
        }

        // Delete the associated API config first
        await this.configModel.deleteOne({ brandId: id });

        // Then delete the brand
        await this.brandModel.findByIdAndDelete(id);

        return { message: 'Brand deleted successfully' };
    }

    async findOne(id: string, clientId: string) {
        const brand = await this.brandModel.findOne({ _id: id, clientId });
        if (!brand) {
            throw new NotFoundException('Brand not found');
        }

        const config = await this.configModel.findOne({ brandId: brand.id });
        return {
            ...brand.toObject(),
            apiConfig: config
        };
    }

    async updateApiConfig(id: string, clientId: string, updateConfigDto: UpdateBrandApiConfigDto) {
        // First verify the brand belongs to the client
        const brand = await this.brandModel.findOne({ _id: id, clientId });
        if (!brand) {
            throw new NotFoundException('Brand not found');
        }

        // Prepare update data with proper handling of optional fields
        const updateData = {
            ...updateConfigDto,
            isAutoSyncEnabled: updateConfigDto.isAutoSyncEnabled ?? false
        };

        const config = await this.configModel.findOneAndUpdate(
            { brandId: id },
            {
                $set: updateData,
                // Only update lastSyncStatus and lastSyncAttempt if they exist in current config
                $setOnInsert: {
                    lastSyncStatus: undefined,
                    lastSyncAttempt: undefined
                }
            },
            { new: true, upsert: true }
        );
        return config;
    }

    async syncProducts(id: string, clientId: string) {
        // First verify the brand belongs to the client
        const brand = await this.brandModel.findOne({ _id: id, clientId });
        if (!brand) {
            throw new NotFoundException('Brand not found');
        }

        const config = await this.configModel.findOne({ brandId: id });
        if (!config) {
            throw new BadRequestException('Brand API configuration not found');
        }

        // Update last sync attempt timestamp
        await this.configModel.updateOne(
            { brandId: id },
            {
                $set: {
                    lastSyncAttempt: new Date(),
                    lastSyncStatus: 'PENDING'
                }
            }
        );

        // // Queue the sync job
        // const job = await this.queueService.addJob('sync-brand-products', {
        //     brandId: id,
        //     clientId,
        //     config: {
        //         apiKey: config.apiKey,
        //         endpoint: config.endpoint,
        //         apiSecret: config.apiSecret,
        //         endpoints: config.endpoints,
        //         headers: config.headers
        //     }
        // });

        return {
            message: 'Product synchronization started',
            // jobId: job.id,
            status: 'PENDING'
        };
    }
}