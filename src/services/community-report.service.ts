// src/services/community-report.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Report } from '../schemas/report.schema';
import {
    CreateCommunityReportDto,
    UpdateCommunityReportDto,
    ListCommunityReportDto
} from '../dtos/community-report.dto';
import { SupabaseService } from './supabase.service';

@Injectable()
export class CommunityReportService {
    constructor(
        @InjectModel(Report.name) private reportModel: Model<Report>,
        private readonly supabaseService: SupabaseService
    ) {}

    async create(
        reportData: CreateCommunityReportDto & { clientId: string },
        files: Express.Multer.File[] = [],
        audioFile?: Express.Multer.File
    ): Promise<Report> {
        const mediaUrls: string[] = [];

        // Upload images to Supabase
        if (files && files.length > 0) {
            for (const file of files) {
                const filename = `${Date.now()}-${file.originalname}`;
                const url = await this.supabaseService.uploadImage(file.buffer, filename);
                mediaUrls.push(url);
            }
        }

        // Handle audio upload
        let audioUrl: string | null = null;
        if (audioFile && audioFile.buffer) {
            try {
                const audioFilename = `audio-${Date.now()}.webm`;
                audioUrl = await this.supabaseService.uploadAudio(audioFile.buffer, audioFilename);
            } catch (error) {
                console.error('Audio upload failed', error);
            }
        }

        // Create the report object
        const now = new Date();
        const report = await this.reportModel.create({
            clientId: reportData.clientId,
            title: reportData.title,
            content: {
                message: reportData.content
            },
            category: reportData.category,
            isAnonymous: reportData.isAnonymous || false,
            location: reportData.location,
            authorId: reportData.authorId,
            media: mediaUrls,
            audio: audioUrl,
            status: 'pending',
            metadata: {
                timestamp: now,
                ipHash: '', // You may want to compute this from the request
                userAgent: '',
            },
            isCommunityReport: true,
            createdAt: now,
            updatedAt: now
        });

        return report;
    }

    async findAll(query: ListCommunityReportDto & { clientId: string }) {
        const {
            clientId,
            search,
            limit = 10,
            page = 1,
            status = 'all',
            category = 'all',
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = query;

        const skip = (page - 1) * limit;

        const filters: any = {
            clientId: clientId,
            isCommunityReport: true
        };

        if (search) {
            filters.$or = [
                { title: new RegExp(search, 'i') },
                { 'content.message': new RegExp(search, 'i') }
            ];
        }

        if (status && status !== 'all') {
            filters.status = status;
        }

        if (category && category !== 'all') {
            filters.category = category;
        }

        const sort: any = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const total = await this.reportModel.countDocuments(filters);

        const reports = await this.reportModel.find(filters)
            .sort(sort)
            .skip(skip)
            .limit(limit);

        const transformedReports = reports.map(report => {
            const reportObj = report.toObject();

            // Fix media URLs if needed
            if (reportObj.media) {
                reportObj.media = reportObj.media.map(url => {
                    if (typeof url === 'string' && url.startsWith('https://https://')) {
                        return url.replace('https://https://', 'https://');
                    }
                    return url;
                });
            }

            return {
                ...reportObj,
                id: reportObj._id.toString(),
                message: reportObj.content?.message,
                _id: undefined
            };
        });

        return {
            data: transformedReports,
            meta: {
                total,
                page,
                limit,
                hasMore: total > skip + reports.length
            }
        };
    }

    async findOne(id: string, clientId: string): Promise<Report> {
        const report = await this.reportModel.findOne({
            _id: id,
            clientId: clientId,
            isCommunityReport: true
        });

        if (!report) {
            throw new NotFoundException(`Report with ID ${id} not found`);
        }

        return report;
    }

    async getFeaturedReports(clientId: string) {
        // Get reports for the specific client
        const allReports = await this.reportModel.find({
            clientId: clientId,
            isCommunityReport: true,
            status: { $in: ['pending', 'in_progress', 'resolved'] }
        });

        // Shuffle randomly
        const shuffled = allReports.sort(() => 0.5 - Math.random());

        // Take first 6 reports or fewer if not enough
        const featured = shuffled.slice(0, Math.min(6, shuffled.length));

        // Transform reports
        const transformedReports = featured.map(report => {
            const reportObj = report.toObject();

            // Fix media URLs if needed
            if (reportObj.media) {
                reportObj.media = reportObj.media.map(url => {
                    if (typeof url === 'string' && url.startsWith('https://https://')) {
                        return url.replace('https://https://', 'https://');
                    }
                    return url;
                });
            }

            return {
                ...reportObj,
                id: reportObj._id.toString(),
                message: reportObj.content?.message,
                _id: undefined
            };
        });

        return {
            data: transformedReports
        };
    }

    async getMapReports(clientId: string) {
        // Get reports for the specific client with location data
        const reports = await this.reportModel.find({
            clientId: clientId,
            isCommunityReport: true,
            location: { $exists: true }
        });

        // Transform reports
        const transformedReports = reports.map(report => {
            const reportObj = report.toObject();

            // Fix media URLs if needed
            if (reportObj.media) {
                reportObj.media = reportObj.media.map(url => {
                    if (typeof url === 'string' && url.startsWith('https://https://')) {
                        return url.replace('https://https://', 'https://');
                    }
                    return url;
                });
            }

            return {
                ...reportObj,
                id: reportObj._id.toString(),
                message: reportObj.content?.message,
                _id: undefined
            };
        });

        return {
            data: transformedReports
        };
    }

    async update(id: string, clientId: string, updateReportDto: UpdateCommunityReportDto): Promise<Report> {
        const report = await this.findOne(id, clientId);

        const updateData: any = {
            ...updateReportDto,
            updatedAt: new Date()
        };

        // If content is provided, update the message in the nested structure
        if (updateReportDto.content) {
            updateData['content.message'] = updateReportDto.content;
            delete updateData.content;
        }

        const updatedReport = await this.reportModel.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true }
        );

        if (!updatedReport) {
            throw new NotFoundException(`Report with ID ${id} not found`);
        }

        return updatedReport;
    }

    async remove(id: string, clientId: string): Promise<void> {
        const report = await this.findOne(id, clientId);

        await this.reportModel.findByIdAndDelete(id);
    }

    async findNearby(lat: number, lng: number, maxDistance: number = 5000, clientId: string): Promise<Report[]> {
        return this.reportModel.find({
            clientId: clientId,
            isCommunityReport: true,
            location: {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [lng, lat]
                    },
                    $maxDistance: maxDistance
                }
            }
        });
    }
}