// src/services/community-report.service.ts
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Report } from '../schemas/report.schema';
import { User } from '../schemas/user.schema';
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
        @InjectModel(User.name) private userModel: Model<User>,
        private readonly supabaseService: SupabaseService
    ) {}

    async create(
        reportData: CreateCommunityReportDto & { clientId: string },
        files: Express.Multer.File[] = [],
        audioFile?: Express.Multer.File
    ): Promise<Report> {
        // Validate authorId if provided and not anonymous
        if (reportData.authorId && !reportData.isAnonymous) {
            const user = await this.userModel.findById(reportData.authorId);
            if (!user) {
                throw new NotFoundException(`User with ID ${reportData.authorId} not found`);
            }

            // Check if user belongs to this client
            if (!user.client_ids.includes(reportData.clientId)) {
                throw new UnauthorizedException(`User does not belong to this client`);
            }
        }

        const mediaUrls: string[] = [];

        // Upload images to Supabase
        if (files && files.length > 0) {
            for (const file of files) {
                const filename = `${Date.now()}-${file.originalname}`;
                const url = await this.supabaseService.uploadCommunityImage(file.buffer, filename);
                mediaUrls.push(url);
            }
        }

        // Handle audio upload
        let audioUrl: string | null = null;
        if (audioFile && audioFile.buffer) {
            try {
                const audioFilename = `audio-${Date.now()}.webm`;
                audioUrl = await this.supabaseService.uploadCommunityAudio(audioFile.buffer, audioFilename);
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
            isFromChatbot: reportData.isFromChatbot || false,
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

    async findOne(id: string, clientId: string): Promise<any> {
        const report = await this.reportModel.findOne({
            _id: id,
            clientId: clientId,
            isCommunityReport: true
        });

        if (!report) {
            throw new NotFoundException(`Report with ID ${id} not found`);
        }

        // Transform the report to a more frontend-friendly format
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

        // Add related data (could be implemented further)
        const relatedReports = await this.findRelatedReports(id, clientId);

        return {
            ...reportObj,
            id: reportObj._id.toString(),
            content: reportObj.content?.message || '',
            _id: undefined,
            relatedReports: relatedReports.slice(0, 5) // Limit to 5 related reports
        };
    }

    // Helper method to find related reports
    async findRelatedReports(id: string, clientId: string, maxDistance = 1000): Promise<any[]> {
        const report = await this.reportModel.findById(id);
        if (!report || !report.location) return [];

        // Find reports nearby with the same category
        const nearbyReports = await this.reportModel.find({
            _id: { $ne: id }, // Exclude current report
            clientId: clientId,
            isCommunityReport: true,
            category: report.category,
            location: {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [report.location.lng, report.location.lat]
                    },
                    $maxDistance: maxDistance
                }
            }
        }).limit(10);

        // Transform reports as needed
        return nearbyReports.map(report => {
            const obj = report.toObject();
            return {
                id: obj._id.toString(),
                title: obj.title,
                status: obj.status,
                category: obj.category,
                location: obj.location,
                createdAt: obj.createdAt
            };
        });
    }

    async update(id: string, clientId: string, updateReportDto: UpdateCommunityReportDto): Promise<Report> {
        const report = await this.findOne(id, clientId);

        // Check if the user is authorized to update this report
        if (report.authorId && !report.isAnonymous) {

        const user = await this.userModel.findById(report.authorId);
        // Allow only if user is part of the same client
        if (!user || !user.client_ids.includes(clientId)) {
            throw new UnauthorizedException('You are not authorized to update this report');
        }

        }

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

    async remove(id: string, clientId: string,): Promise<void> {
        const report = await this.findOne(id, clientId);

        // Check if the user is authorized to delete this report
        if (report.authorId && !report.isAnonymous) {

                const user = await this.userModel.findById(report.authorId);
                // Allow only if user is part of the same client
                if (!user || !user.client_ids.includes(clientId)) {
                    throw new UnauthorizedException('You are not authorized to delete this report');
                }

        }

        await this.reportModel.findByIdAndDelete(id);
    }

    async findNearby(lat: number, lng: number, clientId: string, maxDistance: number = 5000): Promise<Report[]> {
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

    async getFeaturedReports(clientId: string): Promise<{ data: any[] }> {
        // Get featured reports based on criteria like:
        // - Recent reports (last 7 days)
        // - Reports with high engagement
        // - Reports marked as important by admins
        // - Reports with media content

        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

        // Fetch reports from the last two weeks, prioritize ones with media
        const reports = await this.reportModel.find({
            clientId: clientId,
            isCommunityReport: true,
            createdAt: { $gte: twoWeeksAgo },
            // You can add other criteria like:
            // status: { $ne: 'closed' }  // Not closed reports
        })
            .sort({
                // Sort by having media first, then by date
                media: -1,
                createdAt: -1
            })
            .limit(20); // Limit to 20 featured reports

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

        return { data: transformedReports };
    }

    async getMapReports(clientId: string): Promise<any[]> {
        // Get all reports suitable for map display
        // For map, we only need reports with valid location data
        const reports = await this.reportModel.find({
            clientId: clientId,
            isCommunityReport: true,
            'location.lat': { $exists: true },
            'location.lng': { $exists: true }
        })
            .sort({ createdAt: -1 })
            .limit(500); // Reasonable limit for map markers

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

            // For map reports, ensure location data is valid
            if (!reportObj.location || typeof reportObj.location.lat !== 'number' || typeof reportObj.location.lng !== 'number') {
                console.warn(`Report ${reportObj._id} has invalid location data`);
            }

            return {
                ...reportObj,
                id: reportObj._id.toString(),
                message: reportObj.content?.message,
                content: {
                    ...reportObj.content,
                    // Truncate message for map view to keep data size smaller
                    message: reportObj.content?.message?.substring(0, 200) +
                        (reportObj.content?.message?.length > 200 ? '...' : '')
                },
                _id: undefined
            };
        })
            .filter(report => report.location && typeof report.location.lat === 'number' && typeof report.location.lng === 'number');

        return transformedReports;
    }

    /**
     * Get reports submitted by the current user
     * @param userId The omnistackUserId (authorId) of the current user
     * @param clientId The client ID
     * @param query Optional query parameters for filtering/pagination
     */
    async getUserReports(
        userId: string,
        clientId: string,
        query: {
            page?: number;
            limit?: number;
            status?: string;
            sort?: string;
            order?: 'asc' | 'desc';
        } = {}
    ) {
        if (!userId) {
            throw new UnauthorizedException('User ID is required');
        }

        // Set defaults
        const {
            page = 1,
            limit = 10,
            status = 'all',
            sort = 'createdAt',
            order = 'desc'
        } = query;

        const skip = (page - 1) * limit;

        // Build the filter
        const filter: any = {
            authorId: userId,
            clientId: clientId,
            isCommunityReport: true
        };

        // Add status filter if not 'all'
        if (status !== 'all') {
            filter.status = status;
        }

        // Create the sort object
        const sortOption: any = {};
        sortOption[sort] = order === 'asc' ? 1 : -1;

        // Get total count
        const total = await this.reportModel.countDocuments(filter);

        // Get reports
        const reports = await this.reportModel.find(filter)
            .sort(sortOption)
            .skip(skip)
            .limit(limit);

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
                message: reportObj.content?.message || '',
                content: reportObj.content?.message || '',
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

    /**
     * Get report statistics for a specific user
     * @param userId The user ID to get stats for
     * @param clientId The client ID
     */
    async getReportStats(userId: string, clientId: string) {
        if (!userId) {
            throw new UnauthorizedException('User ID is required');
        }

        // Build the filter for user's reports
        const baseFilter = {
            authorId: userId,
            clientId: clientId,
            isCommunityReport: true
        };

        // Get total count
        const total = await this.reportModel.countDocuments(baseFilter);

        // Get counts by status
        const pending = await this.reportModel.countDocuments({
            ...baseFilter,
            status: 'pending'
        });

        const inProgress = await this.reportModel.countDocuments({
            ...baseFilter,
            status: 'in_progress'
        });

        const resolved = await this.reportModel.countDocuments({
            ...baseFilter,
            status: 'resolved'
        });

        const closed = await this.reportModel.countDocuments({
            ...baseFilter,
            status: 'closed'
        });

        return {
            total,
            pending,
            inProgress,
            resolved,
            closed
        };
    }
}