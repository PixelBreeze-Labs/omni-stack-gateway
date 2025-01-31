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
        const brand = await this.brandModel.create(brandData);

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
        const { clientId, search, limit = 10, page = 1 } = query;
        const skip = (page - 1) * limit;

        // Build filters
        const filters: any = {
            clientId // Always filter by clientId for security
        };

        if (search) {
            filters.$or = [
                { name: new RegExp(search, 'i') },
                { code: new RegExp(search, 'i') }
            ];
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
                return {
                    ...brand.toObject(),
                    id: brand._id, // Ensure id is present
                    apiConfig: config,
                    status: brand.isActive ? 'ACTIVE' : 'INACTIVE', // Add status
                    totalProducts: 0, // Add default value or fetch from another service
                    lastSync: null // Add default value or fetch from sync service
                };
            })
        );

        // Return paginated response
        return {
            items,
            total,
            pages: totalPages,
            page,
            limit
        };
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