// src/services/community-report.service.ts
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Report, ReportStatus } from '../schemas/report.schema';
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
            customAuthorName: reportData.customAuthorName,
            visibleOnWeb: reportData.visibleOnWeb !== undefined ? reportData.visibleOnWeb : true,
            location: reportData.location,
            authorId: reportData.authorId,
            media: mediaUrls,
            audio: audioUrl,
            tags: reportData.tags || [],
            status: reportData.status || ReportStatus.PENDING_REVIEW,
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
            tags = [],
            visibleOnly = true,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = query;

        const skip = (page - 1) * limit;

        const filters: any = {
            clientId: clientId,
            isCommunityReport: true,
            // Exclude PENDING_REVIEW and REJECTED
            status: { $nin: [ReportStatus.PENDING_REVIEW, ReportStatus.REJECTED] }
        };

        // Only show reports marked as visible on web if requested
        if (visibleOnly) {
            filters.visibleOnWeb = true;
        }

        if (search) {
            filters.$or = [
                { title: new RegExp(search, 'i') },
                { 'content.message': new RegExp(search, 'i') },
                { customAuthorName: new RegExp(search, 'i') }
            ];
        }

        // Override the $nin filter if a specific status is requested
        if (status && status !== 'all') {
            filters.status = status;
        }

        if (category && category !== 'all') {
            filters.category = category;
        }

        // Add tags filter if provided
        if (tags && tags.length > 0) {
            filters.tags = { $in: tags };
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
            visibleOnWeb: true, // Only show publicly visible reports
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
                customAuthorName: obj.customAuthorName,
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
            visibleOnWeb: true,
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
        // Get featured reports based on the isFeatured flag
        const reports = await this.reportModel.find({
            clientId: clientId,
            isCommunityReport: true,
            visibleOnWeb: true,
            isFeatured: true,
            // Exclude PENDING_REVIEW and REJECTED
            status: { $nin: [ReportStatus.PENDING_REVIEW, ReportStatus.REJECTED] }
        })
            .sort({
                // Sort by recency
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
        const reports = await this.reportModel.find({
            clientId: clientId,
            isCommunityReport: true,
            visibleOnWeb: true,
            'location.lat': { $exists: true },
            'location.lng': { $exists: true },
            // Only show active, in progress, resolved, or no_resolution reports on the map
            status: {
                $in: [
                    ReportStatus.ACTIVE,
                    ReportStatus.IN_PROGRESS,
                    ReportStatus.RESOLVED,
                    ReportStatus.NO_RESOLUTION
                ]
            }
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
        const pendingReview = await this.reportModel.countDocuments({
            ...baseFilter,
            status: ReportStatus.PENDING_REVIEW
        });

        const rejected = await this.reportModel.countDocuments({
            ...baseFilter,
            status: ReportStatus.REJECTED
        });

        const active = await this.reportModel.countDocuments({
            ...baseFilter,
            status: ReportStatus.ACTIVE
        });

        const inProgress = await this.reportModel.countDocuments({
            ...baseFilter,
            status: ReportStatus.IN_PROGRESS
        });

        const resolved = await this.reportModel.countDocuments({
            ...baseFilter,
            status: ReportStatus.RESOLVED
        });

        const closed = await this.reportModel.countDocuments({
            ...baseFilter,
            status: ReportStatus.CLOSED
        });

        const noResolution = await this.reportModel.countDocuments({
            ...baseFilter,
            status: ReportStatus.NO_RESOLUTION
        });

        return {
            total,
            pendingReview,
            rejected,
            active,
            inProgress,
            resolved,
            closed,
            noResolution
        };
    }

    /**
     * Get statistics and data for the report form page
     * @param clientId The client ID
     */
    async getReportFormData(clientId: string) {
        // Get recent reports (limit to 3)
        const recentReports = await this.reportModel.find({
            clientId: clientId,
            isCommunityReport: true,
            visibleOnWeb: true,
            // Exclude PENDING_REVIEW and REJECTED
            status: { $nin: [ReportStatus.PENDING_REVIEW, ReportStatus.REJECTED] }
        })
            .sort({ createdAt: -1 })
            .limit(3);

        const transformedRecentReports = recentReports.map(report => {
            const reportObj = report.toObject();
            return {
                id: reportObj._id.toString(),
                title: reportObj.title,
                category: reportObj.category,
                status: reportObj.status,
                createdAt: reportObj.createdAt
            };
        });

        // Calculate impact statistics
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Monthly report count
        const monthlyReportCount = await this.reportModel.countDocuments({
            clientId: clientId,
            isCommunityReport: true,
            createdAt: { $gte: startOfMonth }
        });

        // Resolved report count
        const resolvedReportCount = await this.reportModel.countDocuments({
            clientId: clientId,
            isCommunityReport: true,
            status: ReportStatus.RESOLVED
        });

        // Calculate average response time (in hours)
        const reports = await this.reportModel.find({
            clientId: clientId,
            isCommunityReport: true,
            status: { $in: [ReportStatus.RESOLVED, ReportStatus.CLOSED] }
        })
            .sort({ createdAt: -1 })
            .limit(100); // Limit to recent reports for better accuracy

        let totalResponseTime = 0;
        let reportsWithUpdates = 0;

        reports.forEach(report => {
            if (report.updatedAt && report.createdAt) {
                const responseTime = (report.updatedAt.getTime() - report.createdAt.getTime()) / (1000 * 60 * 60); // Hours
                totalResponseTime += responseTime;
                reportsWithUpdates++;
            }
        });

        const averageResponseTime = reportsWithUpdates > 0
            ? Math.round(totalResponseTime / reportsWithUpdates)
            : 48; // Default to 48h if no data

        return {
            recentReports: transformedRecentReports,
            impactStats: {
                monthlyReportCount,
                resolvedReportCount,
                averageResponseTime
            }
        };
    }

    /**
     * Get all community reports for admin purposes
     * This includes all reports regardless of status or visibility
     */
    async getAdminReports(query: ListCommunityReportDto & { clientId: string }) {
        const {
            clientId,
            search,
            limit = 10,
            page = 1,
            status = 'all',
            category = 'all',
            tags = [],
            reportTags = [],
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = query;

        const skip = (page - 1) * limit;

        // Base filter for community reports
        const filters: any = {
            clientId: clientId,
            isCommunityReport: true
        };

        // Don't exclude any statuses by default for admin view
        // Add specific status filter if requested
        if (status && status !== 'all') {
            filters.status = status;
        }

        if (search) {
            filters.$or = [
                { title: new RegExp(search, 'i') },
                { 'content.message': new RegExp(search, 'i') },
                { customAuthorName: new RegExp(search, 'i') }
            ];
        }

        if (category && category !== 'all') {
            filters.category = category;
        }

        // Add tags filter if provided (string tags)
        if (tags && tags.length > 0) {
            filters.tags = { $in: tags };
        }

        // Add reportTags filter if provided (tag IDs)
        if (reportTags && reportTags.length > 0) {
            filters.reportTags = { $in: reportTags };
        }

        const sort: any = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const total = await this.reportModel.countDocuments(filters);

        // Get the reports
        const reports = await this.reportModel.find(filters)
            .populate('reportTags')  // Populate tag references
            .populate({
                path: 'authorId',
                model: 'User',
                select: 'name surname email'
            }) // Explicit population with model
            .sort(sort)
            .skip(skip)
            .limit(limit);

        const transformedReports = reports.map(report => {
            const reportObj = report.toObject();

            // Get author information if available
            let authorName = null;
            if (reportObj.authorId) {
                // Explicit type check and handling for both string and object types
                if (typeof reportObj.authorId === 'object') {
                    const author = reportObj.authorId as any;
                    authorName = author.name && author.surname
                        ? `${author.name} ${author.surname}`
                        : author.name || author.email || null;
                } else {
                    // If authorId is still a string despite populate, we'll use a fallback
                    authorName = null;
                }
            }

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
                _id: reportObj._id.toString(), // Keep _id and convert to string
                id: reportObj._id.toString(),  // Also provide id for compatibility
                message: reportObj.content?.message,
                authorName: reportObj.customAuthorName || authorName || null,
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
}