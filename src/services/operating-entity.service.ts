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

    async findAll(query: ListOperatingEntityDto & { clientId: string }): Promise<PaginatedResponse<OperatingEntity>> {
        const {
            page = 1,
            limit = 10,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            search,
            type,
            clientId
        } = query;

        const skip = (page - 1) * limit;

        // Build filter with clientId always included for security
        const filter: any = { clientId };

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

    async findOne(id: string, clientId: string): Promise<OperatingEntity> {
        // Filter by both ID and clientId for security
        const entity = await this.operatingEntityModel.findOne({
            _id: id,
            clientId
        }).lean().exec();

        if (!entity) {
            throw new NotFoundException('Operating entity not found');
        }
        return entity;
    }

    async update(id: string, updateOperatingEntityDto: UpdateOperatingEntityDto, clientId: string): Promise<OperatingEntity> {
        // Use findOneAndUpdate with clientId filter to ensure only own data can be updated
        const entity = await this.operatingEntityModel.findOneAndUpdate(
            { _id: id, clientId }, // Filter by both ID and clientId
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

    async remove(id: string, clientId: string): Promise<void> {
        // Delete only if both ID and clientId match
        const result = await this.operatingEntityModel.deleteOne({
            _id: id,
            clientId
        }).exec();

        if (result.deletedCount === 0) {
            throw new NotFoundException('Operating entity not found');
        }
    }
}