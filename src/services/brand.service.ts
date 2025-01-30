// src/services/brand.service.ts
import {Injectable, NotFoundException} from '@nestjs/common';
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
        if (apiConfig && (apiConfig.apiKey || apiConfig.baseUrl ||
            Object.keys(apiConfig.endpoints || {}).length > 0 ||
            Object.keys(apiConfig.headers || {}).length > 0)) {

            await this.configModel.create({
                ...apiConfig,
                brandId: brand.id
            });
        }

        return brand;
    }

    async findAll(query: ListBrandDto & { clientId: string }) {
        const filters: any = {
            clientId: query.clientId // Always filter by clientId for security
        };

        if (query.search) {
            filters.$or = [
                { name: new RegExp(query.search, 'i') },
                { code: new RegExp(query.search, 'i') }
            ];
        }

        const brands = await this.brandModel
            .find(filters)
            .sort({ createdAt: -1 });

        // Fetch associated API configs
        const brandsWithConfig = await Promise.all(
            brands.map(async (brand) => {
                const config = await this.configModel.findOne({ brandId: brand.id });
                return {
                    ...brand.toObject(),
                    apiConfig: config
                };
            })
        );

        return brandsWithConfig;
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

        const config = await this.configModel.findOneAndUpdate(
            { brandId: id },
            { $set: updateConfigDto },
            { new: true, upsert: true }
        );
        return config;
    }
}