// src/services/brand.service.ts
import {Injectable, NotFoundException} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {BrandApiConfig} from "../schemas/brand-api-config.schema";
import {Brand} from "../schemas/brand.schema";
import {CreateBrandApiConfigDto, CreateBrandDto, ListBrandDto, UpdateBrandApiConfigDto} from "../dtos/brand.dto";


@Injectable()
export class BrandService {
    constructor(
        @InjectModel(Brand.name) private brandModel: Model<Brand>,
        @InjectModel(BrandApiConfig.name) private configModel: Model<BrandApiConfig>
    ) {
    }

    async createWithConfig(createBrandDto: CreateBrandDto, apiConfig?: CreateBrandApiConfigDto) {
        const brand = await this.brandModel.create(createBrandDto);

        if (apiConfig) {
            await this.configModel.create({
                ...apiConfig,
                brandId: brand.id
            });
        }

        return brand;
    }

    async findAll(query: ListBrandDto) {
        const filters: any = {};

        if (query.search) {
            filters.$or = [
                { name: new RegExp(query.search, 'i') },
                { code: new RegExp(query.search, 'i') }
            ];
        }

        if (query.clientId) {
            filters.clientId = query.clientId;
        }

        return this.brandModel.find(filters);
    }

    async findOne(id: string) {
        const brand = await this.brandModel.findById(id);
        if (!brand) {
            throw new NotFoundException('Brand not found');
        }
        return brand;
    }

    async updateApiConfig(id: string, updateConfigDto: UpdateBrandApiConfigDto) {
        const config = await this.configModel.findOneAndUpdate(
            { brandId: id },
            { $set: updateConfigDto },
            { new: true, upsert: true }
        );
        return config;
    }
}