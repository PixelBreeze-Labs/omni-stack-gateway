// src/services/operating-entity.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, SortOrder } from 'mongoose';
import { OperatingEntity } from '../schemas/operating-entity.schema';
import { CreateOperatingEntityDto, UpdateOperatingEntityDto, ListOperatingEntityDto } from '../dtos/operating-entity.dto';

interface PaginatedResponse<T> {
    items: T[];
    total: number;
    pages: number;
    page: number;
    limit: number;
}

@Injectable()
export class OperatingEntityService {
    constructor(
        @InjectModel(OperatingEntity.name) private operatingEntityModel: Model<OperatingEntity>
    ) {}

    async findAll(query: ListOperatingEntityDto): Promise<PaginatedResponse<OperatingEntity>> {
        const {
            page = 1,
            limit = 10,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            search,
            type
        } = query;

        const skip = (page - 1) * limit;

        // Build filter
        const filter: any = {};

        if (search) {
            filter.$or = [
                { name: new RegExp(search, 'i') },
                { url: new RegExp(search, 'i') }
            ];
        }

        if (type) {
            filter.type = type;
        }

        // Build sort object for mongoose
        const sortOptions: { [key: string]: SortOrder } = {
            [sortBy]: sortOrder as SortOrder
        };

        const [items, total] = await Promise.all([
            this.operatingEntityModel
                .find(filter)
                .sort(sortOptions)
                .skip(skip)
                .limit(limit)
                .lean()
                .exec(),
            this.operatingEntityModel.countDocuments(filter)
        ]);

        return {
            items,
            total,
            pages: Math.ceil(total / limit),
            page,
            limit
        };
    }

    async create(createOperatingEntityDto: CreateOperatingEntityDto): Promise<OperatingEntity> {
        const entity = new this.operatingEntityModel({
            ...createOperatingEntityDto,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        return (await entity.save()).toObject();
    }

    async findOne(id: string): Promise<OperatingEntity> {
        const entity = await this.operatingEntityModel.findById(id).lean().exec();
        if (!entity) {
            throw new NotFoundException('Operating entity not found');
        }
        return entity;
    }

    async update(id: string, updateOperatingEntityDto: UpdateOperatingEntityDto): Promise<OperatingEntity> {
        const entity = await this.operatingEntityModel.findByIdAndUpdate(
            id,
            {
                ...updateOperatingEntityDto,
                updatedAt: new Date()
            },
            { new: true }
        )
            .lean()
            .exec();

        if (!entity) {
            throw new NotFoundException('Operating entity not found');
        }

        return entity;
    }

    async remove(id: string): Promise<void> {
        const result = await this.operatingEntityModel.deleteOne({ _id: id }).exec();
        if (result.deletedCount === 0) {
            throw new NotFoundException('Operating entity not found');
        }
    }
}