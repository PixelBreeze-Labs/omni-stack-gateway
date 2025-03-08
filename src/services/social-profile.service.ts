// src/services/social-profile.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, SortOrder } from 'mongoose';
import { SocialProfile } from '../schemas/social-profile.schema';
import { CreateSocialProfileDto, UpdateSocialProfileDto, ListSocialProfileDto } from '../dtos/social-profile.dto';
import { OperatingEntity } from '../schemas/operating-entity.schema';

interface PaginatedResponse<T> {
    items: T[];
    total: number;
    pages: number;
    page: number;
    limit: number;
}

@Injectable()
export class SocialProfileService {
    constructor(
        @InjectModel(SocialProfile.name) private socialProfileModel: Model<SocialProfile>,
        @InjectModel(OperatingEntity.name) private operatingEntityModel: Model<OperatingEntity>
    ) {}

    async findAll(query: ListSocialProfileDto): Promise<PaginatedResponse<SocialProfile>> {
        const {
            page = 1,
            limit = 10,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            search,
            type,
            operatingEntityId
        } = query;

        const skip = (page - 1) * limit;

        // Build filter
        const filter: any = {};

        if (search) {
            filter.$or = [
                { accountName: new RegExp(search, 'i') },
                { username: new RegExp(search, 'i') },
                { url: new RegExp(search, 'i') }
            ];
        }

        if (type) {
            filter.type = type;
        }

        if (operatingEntityId) {
            filter.operatingEntityId = operatingEntityId;
        }

        // Build sort object for mongoose
        const sortOptions: { [key: string]: SortOrder } = {
            [sortBy]: sortOrder as SortOrder
        };

        const [items, total] = await Promise.all([
            this.socialProfileModel
                .find(filter)
                .populate('operatingEntityId', 'name type url')
                .sort(sortOptions)
                .skip(skip)
                .limit(limit)
                .lean()
                .exec(),
            this.socialProfileModel.countDocuments(filter)
        ]);

        return {
            items,
            total,
            pages: Math.ceil(total / limit),
            page,
            limit
        };
    }

    async create(createSocialProfileDto: CreateSocialProfileDto): Promise<SocialProfile> {
        // Verify operating entity exists and belongs to the same client
        const operatingEntity = await this.operatingEntityModel.findOne({
            _id: createSocialProfileDto.operatingEntityId,
            clientId: createSocialProfileDto.clientId
        });

        if (!operatingEntity) {
            throw new NotFoundException('Operating entity not found or does not belong to this client');
        }

        const profile = new this.socialProfileModel({
            ...createSocialProfileDto,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        return (await profile.save()).toObject();
    }

    async findOne(id: string): Promise<SocialProfile> {
        const profile = await this.socialProfileModel
            .findById(id)
            .populate('operatingEntityId', 'name type url')
            .lean()
            .exec();

        if (!profile) {
            throw new NotFoundException('Social profile not found');
        }
        return profile;
    }

    async update(id: string, updateSocialProfileDto: UpdateSocialProfileDto): Promise<SocialProfile> {
        // If updating operating entity, verify it exists
        if (updateSocialProfileDto.operatingEntityId) {
            const operatingEntity = await this.operatingEntityModel.findById(
                updateSocialProfileDto.operatingEntityId
            );

            if (!operatingEntity) {
                throw new NotFoundException('Operating entity not found');
            }
        }

        const profile = await this.socialProfileModel.findByIdAndUpdate(
            id,
            {
                ...updateSocialProfileDto,
                updatedAt: new Date()
            },
            { new: true }
        )
            .populate('operatingEntityId', 'name type url')
            .lean()
            .exec();

        if (!profile) {
            throw new NotFoundException('Social profile not found');
        }

        return profile;
    }

    async remove(id: string): Promise<void> {
        const result = await this.socialProfileModel.deleteOne({ _id: id }).exec();
        if (result.deletedCount === 0) {
            throw new NotFoundException('Social profile not found');
        }
    }
}