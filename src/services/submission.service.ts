// src/services/submission.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Submission } from "../schemas/submission.schema";
import { CreateSubmissionDto, ListSubmissionDto } from "../dtos/submission.dto";

@Injectable()
export class SubmissionService {
    constructor(
        @InjectModel(Submission.name) private submissionModel: Model<Submission>
    ) {}

    async create(submissionData: CreateSubmissionDto & { clientId: string, status: string }) {
        const submission = await this.submissionModel.create(submissionData);
        return submission;
    }

    async findAll(query: ListSubmissionDto & { clientId: string }) {
        const { clientId, search, limit = 10, page = 1, status, type } = query;
        const skip = (page - 1) * limit;

        // Build base filters
        const filters: any = { clientId };

        // Add search filter if present
        if (search) {
            filters.$or = [
                { firstName: new RegExp(search, 'i') },
                { lastName: new RegExp(search, 'i') },
                { email: new RegExp(search, 'i') },
                { content: new RegExp(search, 'i') }
            ];
        }

        // Add status filter if present
        if (status) {
            filters.status = status;
        }

        // Add type filter if present
        if (type) {
            filters.type = type;
        }

        // Get total count for pagination
        const total = await this.submissionModel.countDocuments(filters);
        const totalPages = Math.ceil(total / limit);

        // Get paginated submissions
        const submissions = await this.submissionModel
            .find(filters)
            .populate('clientId', 'name email') // Add relevant client fields
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        return {
            items: submissions,
            total,
            pages: totalPages,
            page,
            limit
        };
    }
}