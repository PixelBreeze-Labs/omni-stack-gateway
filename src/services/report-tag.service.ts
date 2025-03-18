import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, SortOrder } from 'mongoose';
import { ReportTag, ReportTagDocument } from '../schemas/report-tag.schema';
import { CreateReportTagDto, UpdateReportTagDto, ListReportTagDto } from '../dtos/report-tag.dto';

@Injectable()
export class ReportTagService {
    constructor(
        @InjectModel(ReportTag.name) private reportTagModel: Model<ReportTagDocument>
    ) {}

    async findAll(query: ListReportTagDto & { clientId: string }) {
        const {
            clientId,
            page = 1,
            limit = 20,
            sortBy = 'name',
            sortOrder = 'asc',
            search
        } = query;

        const skip = (page - 1) * limit;

        // Build filter
        const filter: any = { clientId };
        if (search) {
            filter.name = new RegExp(search, 'i');
        }

        // Build sort object for mongoose
        const sortOptions: { [key: string]: SortOrder } = {
            [sortBy]: sortOrder as SortOrder
        };

        const [items, total] = await Promise.all([
            this.reportTagModel
                .find(filter)
                .sort(sortOptions)
                .skip(skip)
                .limit(limit)
                .lean()
                .exec(),
            this.reportTagModel.countDocuments(filter)
        ]);

        return {
            data: items,
            meta: {
                total,
                page,
                limit,
                hasMore: total > skip + items.length
            }
        };
    }

    async create(createReportTagDto: CreateReportTagDto & { clientId: string }): Promise<ReportTag> {
        try {
            const reportTag = new this.reportTagModel({
                ...createReportTagDto,
                createdAt: new Date(),
                updatedAt: new Date()
            });

            return await reportTag.save();
        } catch (error) {
            if (error.code === 11000) {
                throw new ConflictException('A tag with this name already exists for this client');
            }
            throw error;
        }
    }

    async findOne(id: string, clientId: string): Promise<ReportTag> {
        const reportTag = await this.reportTagModel.findOne({
            _id: id,
            clientId
        }).lean().exec();

        if (!reportTag) {
            throw new NotFoundException('Report tag not found');
        }

        // Use type assertion to resolve the TypeScript error
        return reportTag as unknown as ReportTag;
    }

    async update(id: string, clientId: string, updateReportTagDto: UpdateReportTagDto): Promise<ReportTag> {
        try {
            const reportTag = await this.reportTagModel.findOneAndUpdate(
                { _id: id, clientId },
                {
                    ...updateReportTagDto,
                    updatedAt: new Date()
                },
                { new: true }
            )
                .lean()
                .exec();

            if (!reportTag) {
                throw new NotFoundException('Report tag not found');
            }

            // Use type assertion to resolve the TypeScript error
            return reportTag as unknown as ReportTag;
        } catch (error) {
            if (error.code === 11000) {
                throw new ConflictException('A tag with this name already exists for this client');
            }
            throw error;
        }
    }

    async remove(id: string, clientId: string): Promise<void> {
        const result = await this.reportTagModel.deleteOne({
            _id: id,
            clientId
        }).exec();

        if (result.deletedCount === 0) {
            throw new NotFoundException('Report tag not found');
        }
    }
}