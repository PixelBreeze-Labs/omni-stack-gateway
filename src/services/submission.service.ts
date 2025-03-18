// src/services/submission.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Submission } from "../schemas/submission.schema";
import { CreateSubmissionDto, ListSubmissionDto, UpdateSubmissionDto } from "../dtos/submission.dto";

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

    async updateSubmission(id: string, clientId: string, updateData: UpdateSubmissionDto) {
        // Find and update the submission, ensuring it belongs to the client
        const submission = await this.submissionModel.findOneAndUpdate(
            { _id: id, clientId },
            { ...updateData, updatedAt: new Date() },
            { new: true } // Return the updated document
        );

        if (!submission) {
            return null; // Submission not found or doesn't belong to this client
        }

        return submission;
    }

    // Create contact submission
    async createContactSubmission(data: {
        firstName: string;
        lastName: string;
        email: string;
        phone?: string;
        content: string;
        clientId: string;
        userAgent?: string;
        ipAddress?: string;
    }) {
        // Create metadata with timestamp and optional IP hash/user agent
        const metadata = {
            timestamp: new Date(),
            ipHash: data.ipAddress ? this.hashIpAddress(data.ipAddress) : '',
            userAgent: data.userAgent || ''
        };

        // Create the submission with type always set to 'contact'
        const submission = await this.submissionModel.create({
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            phone: data.phone,
            content: data.content,
            clientId: data.clientId,
            type: 'contact', // Always set to contact type
            status: 'pending',
            metadata
        });

        return submission;
    }

    // Helper method to hash IP address for privacy
    private hashIpAddress(ip: string): string {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(ip).digest('hex');
    }
}