// src/services/community-report.service.ts
import {BadRequestException, Injectable, NotFoundException, UnauthorizedException} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Report, ReportStatus } from '../schemas/report.schema';
import { User } from '../schemas/user.schema';
import { ReportTag } from '../schemas/report-tag.schema';
import {
    CreateCommunityReportDto,
    UpdateCommunityReportDto,
    ListCommunityReportDto
} from '../dtos/community-report.dto';
import { SupabaseService } from './supabase.service';
import {ReportComment} from "../schemas/report-comment.schema";
export interface AnalyticsParams {
    startDate?: string;
    endDate?: string;
    category?: string;
    limit?: number;
}

@Injectable()
export class CommunityReportService {
    constructor(
        @InjectModel(Report.name) private reportModel: Model<Report>,
        @InjectModel(ReportTag.name) private reportTagModel: Model<ReportTag>,
        @InjectModel(User.name) private userModel: Model<User>,
        @InjectModel(ReportComment.name) private reportCommentModel: Model<ReportComment>,
        private readonly supabaseService: SupabaseService,
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

        // Handle reportTags similar to admin creation
        let reportTagsArray: string[] = [];

        if (reportData.reportTags) {
            try {
                // If it's already an array (from JSON-parsed data in controller)
                if (Array.isArray(reportData.reportTags)) {
                    reportTagsArray = reportData.reportTags;
                }
                // If it's a JSON string - use type assertion to fix TypeScript error
                else if (typeof reportData.reportTags === 'string' && (reportData.reportTags as string).startsWith('[')) {
                    reportTagsArray = JSON.parse(reportData.reportTags as string);
                }
                // If it's a comma-separated string - use type assertion to fix TypeScript error
                else if (typeof reportData.reportTags === 'string' && (reportData.reportTags as string).includes(',')) {
                    reportTagsArray = (reportData.reportTags as string).split(',').map(tag => tag.trim());
                }
                // If it's a single string value
                else if (typeof reportData.reportTags === 'string') {
                    reportTagsArray = [reportData.reportTags as string];
                }
            } catch (error) {
                console.error('Failed to parse reportTags in simple create:', error);
            }
        }

        console.log('Report tags for simple create:', reportTagsArray);

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
            reportTags: reportTagsArray, // Include reportTags in simple create
            status: reportData.status || ReportStatus.PENDING_REVIEW,
            metadata: {
                timestamp: now,
                ipHash: '', // You may want to compute this from the request
                userAgent: '',
            },
            isCommunityReport: true,
            isFromChatbot: reportData.isFromChatbot === 'false' ? false : Boolean(reportData.isFromChatbot || false),
            createdAt: now,
            updatedAt: now
        });

        return report;
    }
    /**
     * Create a report from admin with simplified tag handling
     */
    async createFromAdmin(
        reportData: any,
        files: Express.Multer.File[] = [],
        audioFile?: Express.Multer.File
    ): Promise<Report> {
        console.log('Raw reportData:', reportData);

        // Handle reportTags directly in FormData format (simple, direct approach)
        let reportTagsArray: string[] = [];

        // Direct single approach to extract tags from any format
        if (reportData.reportTags) {
            try {
                // If it's a JSON string, parse it
                if (typeof reportData.reportTags === 'string' && reportData.reportTags.startsWith('[')) {
                    reportTagsArray = JSON.parse(reportData.reportTags);
                }
                // If it's a comma-separated string
                else if (typeof reportData.reportTags === 'string' && reportData.reportTags.includes(',')) {
                    reportTagsArray = reportData.reportTags.split(',').map(tag => tag.trim());
                }
                // If it's a single string value
                else if (typeof reportData.reportTags === 'string') {
                    reportTagsArray = [reportData.reportTags];
                }
                // If it's already an array
                else if (Array.isArray(reportData.reportTags)) {
                    reportTagsArray = reportData.reportTags;
                }
            } catch (error) {
                console.error('Failed to parse reportTags:', error);
            }
        }

        // Handle individual reportTags[index] fields if array is still empty
        if (reportTagsArray.length === 0) {
            let index = 0;
            while (reportData[`reportTags[${index}]`]) {
                reportTagsArray.push(reportData[`reportTags[${index}]`]);
                index++;
            }
        }

        console.log('Final reportTagsArray:', reportTagsArray);

        // Use the standard create method but override reportTags
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

        // Create the report object directly to ensure reportTags is captured
        const now = new Date();
        const report = await this.reportModel.create({
            clientId: reportData.clientId,
            title: reportData.title,
            content: {
                message: reportData.content
            },
            category: reportData.category,
            isAnonymous: reportData.isAnonymous === 'true' || reportData.isAnonymous === true,
            isFeatured: reportData.isFeatured === 'true' || reportData.isFeatured === true,
            customAuthorName: reportData.customAuthorName,
            visibleOnWeb: reportData.visibleOnWeb !== 'false' && reportData.visibleOnWeb !== false,
            location: typeof reportData.location === 'string' ? JSON.parse(reportData.location) : reportData.location,
            authorId: reportData.authorId,
            media: mediaUrls,
            audio: audioUrl,
            tags: [],
            reportTags: reportTagsArray, // Use our extracted tags array directly
            status: reportData.status || ReportStatus.ACTIVE,
            metadata: {
                timestamp: now,
                ipHash: '',
                userAgent: '',
            },
            isCommunityReport: true,
            isFromChatbot: false,
            createdAt: now,
            updatedAt: now
        });

        console.log('Created report with reportTags:', report.reportTags);
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
            reportTags = [], // Added reportTags parameter
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

        // Add reportTags filter if provided
        if (reportTags && reportTags.length > 0) {
            filters.reportTags = { $in: reportTags };
        }

        const sort: any = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const total = await this.reportModel.countDocuments(filters);

        const reports = await this.reportModel.find(filters)
            .populate('reportTags') // Populate reportTags reference
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
        // First increment the view count atomically
        await this.reportModel.updateOne(
            { _id: id, clientId: clientId, isCommunityReport: true },
            { $inc: { viewCount: 1 } }
        );

        // Then retrieve the updated report
        const report = await this.reportModel.findOne({
            _id: id,
            clientId: clientId,
            isCommunityReport: true
        }).populate('reportTags');

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

        // Get related reports (nearby with same category)
        const relatedReports = await this.findRelatedReports(id, clientId);

        // Get recent reports
        const recentReports = await this.reportModel.find({
            _id: { $ne: id }, // Exclude current report
            clientId: clientId,
            isCommunityReport: true,
            visibleOnWeb: true,
            status: { $nin: [ReportStatus.PENDING_REVIEW, ReportStatus.REJECTED] }
        })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        // Transform recent reports to a simpler format
        const transformedRecentReports = recentReports.map(report => ({
            id: report._id.toString(),
            title: report.title,
            status: report.status,
            category: report.category,
            createdAt: report.createdAt
        }));

        return {
            ...reportObj,
            id: reportObj._id.toString(),
            content: reportObj.content?.message || '',
            _id: undefined,
            relatedReports: relatedReports.slice(0, 5), // Limit to 5 related reports
            recentReports: transformedRecentReports // Add recent reports
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
        // First, find the current report to check if it exists
        const existingReport = await this.reportModel.findOne({
            _id: id,
            clientId: clientId,
            isCommunityReport: true
        });

        if (!existingReport) {
            throw new NotFoundException(`Report with ID ${id} not found`);
        }

        // Check if the user is authorized to update this report
        if (existingReport.authorId && !existingReport.isAnonymous) {
            const user = await this.userModel.findById(existingReport.authorId);
            // Allow only if user is part of the same client
            if (!user || !user.client_ids.includes(clientId)) {
                throw new UnauthorizedException('You are not authorized to update this report');
            }
        }

        // Create an update object with only the specified fields
        const updateFields = {};

        // Only include specified fields, one by one
        if (updateReportDto.status !== undefined) {
            updateFields['status'] = updateReportDto.status;
        }

        if (updateReportDto.isFeatured !== undefined) {
            updateFields['isFeatured'] = updateReportDto.isFeatured;
        }

        if (updateReportDto.visibleOnWeb !== undefined) {
            updateFields['visibleOnWeb'] = updateReportDto.visibleOnWeb;
        }

        if (updateReportDto.title !== undefined) {
            updateFields['title'] = updateReportDto.title;
        }

        if (updateReportDto.category !== undefined) {
            updateFields['category'] = updateReportDto.category;
        }

        if (updateReportDto.reportTags !== undefined) {
            updateFields['reportTags'] = updateReportDto.reportTags;
        }

        if (updateReportDto.tags !== undefined) {
            updateFields['tags'] = updateReportDto.tags;
        }

        if (updateReportDto.isAnonymous !== undefined) {
            updateFields['isAnonymous'] = updateReportDto.isAnonymous;
        }

        if (updateReportDto.customAuthorName !== undefined) {
            updateFields['customAuthorName'] = updateReportDto.customAuthorName;
        }

        if (updateReportDto.location !== undefined) {
            updateFields['location'] = updateReportDto.location;
        }

        // Special handling for content
        if (updateReportDto.content !== undefined) {
            updateFields['content.message'] = updateReportDto.content;
        }

        // Always update the timestamp
        updateFields['updatedAt'] = new Date();

        console.log('Updating specific fields only:', updateFields);

        try {
            // Use Mongoose's updateOne method but only with specific fields
            const result = await this.reportModel.updateOne(
                { _id: id },
                { $set: updateFields }
            );

            if (result.modifiedCount === 0) {
                console.error('Update appeared to fail - no documents modified');
            }

            // Fetch the updated document
            const updatedReport = await this.reportModel.findById(id).populate('reportTags');
            if (!updatedReport) {
                throw new NotFoundException(`Report with ID ${id} not found after update`);
            }

            return updatedReport;
        } catch (error) {
            console.error(`Update error: ${error.message}`);
            throw error;
        }
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
            category?: string; // Added category filter
            reportTags?: string[]; // Added tags filter
            search?: string; // Added search capability
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
            order = 'desc',
            category = 'all',
            reportTags = [],
            search = ''
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

        // Add category filter if not 'all'
        if (category !== 'all') {
            filter.category = category;
        }

        // Add tag filter if provided
        if (reportTags && reportTags.length > 0) {
            filter.reportTags = { $in: reportTags };
        }

        // Add search filter if provided
        if (search) {
            filter.$or = [
                { title: new RegExp(search, 'i') },
                { 'content.message': new RegExp(search, 'i') },
                { customAuthorName: new RegExp(search, 'i') }
            ];
        }

        // Create the sort object
        const sortOption: any = {};
        sortOption[sort] = order === 'asc' ? 1 : -1;

        // Get total count
        const total = await this.reportModel.countDocuments(filter);

        // Get reports, including populated report tags
        const reports = await this.reportModel.find(filter)
            .populate('reportTags') // Populate report tags reference
            .sort(sortOption)
            .skip(skip)
            .limit(limit);

        // Get comment counts for each report
        const reportIds = reports.map(report => report._id);
        const commentCounts = await this.reportCommentModel.aggregate([
            { $match: { reportId: { $in: reportIds } } },
            { $group: { _id: '$reportId', count: { $sum: 1 } } }
        ]);

        // Create a map of report ID to comment count
        const commentCountMap = new Map();
        commentCounts.forEach(item => {
            commentCountMap.set(item._id.toString(), item.count);
        });

        // Transform reports with better handling for reportTags and adding comment counts
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

            // Add comment count
            const commentCount = commentCountMap.get(reportObj._id.toString()) || 0;

            // Add view count (or default to 0 if not present)
            const viewCount = reportObj.viewCount || 0;

            return {
                ...reportObj,
                id: reportObj._id.toString(),
                message: reportObj.content?.message || '',
                content: reportObj.content?.message || '',
                commentCount,
                viewCount,
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
     * Get all community reports for admin purposes with robust error handling
     * Only returns reports where isCommunityReport is true
     */
    async getAdminReports(query: ListCommunityReportDto & { clientId: string }) {
        try {
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

            // Base filter - only get community reports
            const filters: any = {
                clientId: clientId,
                isCommunityReport: true // Required filter to get only community reports
            };

            // Add specific status filter if requested
            if (status && status !== 'all') {
                filters.status = status;
            }

            // Add search with error handling
            if (search) {
                try {
                    filters.$or = [
                        { title: new RegExp(search, 'i') },
                        { 'content.message': new RegExp(search, 'i') },
                        { customAuthorName: new RegExp(search, 'i') }
                    ];
                } catch (e) {
                    console.error('Search filter error:', e);
                    // Continue without search filter if it fails
                }
            }

            // Add category with error handling
            if (category && category !== 'all') {
                filters.category = category;
            }

            // Add tags filter if provided (string tags) with error handling
            if (tags && Array.isArray(tags) && tags.length > 0) {
                filters.tags = { $in: tags };
            }

            // Add reportTags filter if provided (tag IDs) with error handling
            if (reportTags && Array.isArray(reportTags) && reportTags.length > 0) {
                filters.reportTags = { $in: reportTags };
            }

            // Create sort with fallback
            const sort: any = {};
            sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

            // Get total with error handling
            let total = 0;
            try {
                total = await this.reportModel.countDocuments(filters);
            } catch (e) {
                console.error('Count error:', e);
            }

            // Get the reports with error handling
            let reports = [];
            try {
                reports = await this.reportModel.find(filters)
                    .populate('reportTags')
                    .populate({
                        path: 'authorId',
                        model: 'User',
                        select: 'name surname email'
                    })
                    .sort(sort)
                    .skip(skip)
                    .limit(limit);
            } catch (e) {
                console.error('Find error:', e);
                // Try again with only essential filters
                try {
                    reports = await this.reportModel.find({
                        clientId: clientId,
                        isCommunityReport: true
                    })
                        .sort({ createdAt: -1 })
                        .skip(skip)
                        .limit(limit);
                } catch (innerE) {
                    console.error('Fallback find error:', innerE);
                    return {
                        data: [],
                        meta: {
                            total: 0,
                            page,
                            limit,
                            hasMore: false
                        }
                    };
                }
            }

            // Transform reports with safe handling
            const transformedReports = reports.map(report => {
                try {
                    const reportObj = report.toObject();

                    // Author information
                    let authorName = null;
                    if (reportObj.authorId) {
                        if (typeof reportObj.authorId === 'object') {
                            const author = reportObj.authorId;
                            authorName = author.name && author.surname
                                ? `${author.name} ${author.surname}`
                                : author.name || author.email || null;
                        }
                    }

                    // Safe media handling
                    let media = [];
                    if (reportObj.media) {
                        media = Array.isArray(reportObj.media) ? reportObj.media.map(url => {
                            if (typeof url === 'string' && url.startsWith('https://https://')) {
                                return url.replace('https://https://', 'https://');
                            }
                            return url;
                        }) : [];
                    }

                    // Ensure all required fields have default values
                    return {
                        ...reportObj,
                        _id: reportObj._id.toString(),
                        id: reportObj._id.toString(),
                        title: reportObj.title || 'Untitled Report',
                        content: reportObj.content || { message: '' },
                        message: reportObj.content?.message || '',
                        category: reportObj.category || 'other',
                        status: reportObj.status || 'pending_review',
                        isAnonymous: Boolean(reportObj.isAnonymous),
                        visibleOnWeb: reportObj.visibleOnWeb !== undefined ? reportObj.visibleOnWeb : true,
                        isFeatured: Boolean(reportObj.isFeatured),
                        customAuthorName: reportObj.customAuthorName || '',
                        authorName: reportObj.customAuthorName || authorName || null,
                        location: reportObj.location || { lat: null, lng: null },
                        tags: Array.isArray(reportObj.tags) ? reportObj.tags : [],
                        reportTags: Array.isArray(reportObj.reportTags) ? reportObj.reportTags : [],
                        media: media,
                        createdAt: reportObj.createdAt || new Date(),
                        updatedAt: reportObj.updatedAt || new Date(),
                        isCommunityReport: true, // Always true as we're filtering for it
                        isFromChatbot: Boolean(reportObj.isFromChatbot)
                    };
                } catch (e) {
                    console.error('Report transform error:', e);
                    // Return a minimal safe report if transform fails
                    return {
                        _id: report._id.toString(),
                        id: report._id.toString(),
                        title: 'Error displaying report',
                        content: { message: '' },
                        message: '',
                        category: 'unknown',
                        status: 'unknown',
                        isAnonymous: false,
                        visibleOnWeb: true,
                        isFeatured: false,
                        customAuthorName: '',
                        authorName: null,
                        location: { lat: null, lng: null },
                        media: [],
                        tags: [],
                        reportTags: [],
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        isCommunityReport: true,
                        isFromChatbot: false
                    };
                }
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
        } catch (error) {
            console.error('Admin reports error:', error);
            // Return an empty result if the entire function fails
            return {
                data: [],
                meta: {
                    total: 0,
                    page: 1,
                    limit: 10,
                    hasMore: false
                }
            };
        }
    }
    /**
     * Get a report by ID for admin purposes with special handling
     * This includes better error handling for missing fields
     */
    async findOneAdmin(id: string, clientId: string): Promise<any> {
        const report = await this.reportModel.findOne({
            _id: id,
            clientId: clientId,
            isCommunityReport: true
        })
            .populate('reportTags')  // Populate tag references
            .populate({
                path: 'authorId',
                model: 'User',
                select: 'name surname email'
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

        // Get author information if available
        let authorName = null;
        if (reportObj.authorId) {
            // Explicit type check and handling for both string and object types
            if (typeof reportObj.authorId === 'object') {
                const author = reportObj.authorId as any;
                authorName = author.name && author.surname
                    ? `${author.name} ${author.surname}`
                    : author.name || author.email || null;
            }
        }

        // Ensure location exists to prevent errors in frontend
        if (!reportObj.location) {
            reportObj.location = { lat: null, lng: null };
        }

        // Ensure reportTags is always an array
        if (!reportObj.reportTags) {
            reportObj.reportTags = [];
        }

        // Add related data
        const relatedReports = await this.findRelatedReports(id, clientId);

        return {
            ...reportObj,
            _id: reportObj._id.toString(),
            id: reportObj._id.toString(),
            message: reportObj.content?.message || '',
            content: reportObj.content?.message || '',
            authorName: reportObj.customAuthorName || authorName || null,
            relatedReports: relatedReports.slice(0, 5) // Limit to 5 related reports
        };
    }

    async updateReportTags(id: string, clientId: string, reportTags: string[]): Promise<Report> {
        try {
            // First, log the parameters
            console.log(`Updating tags for report: ID=${id}, clientId=${clientId}, tags=`, reportTags);

            // Use findOneAndUpdate to do the entire operation in one step
            // This is safer and prevents race conditions
            const updatedReport = await this.reportModel.findOneAndUpdate(
                {
                    _id: id,
                    clientId: clientId,
                    isCommunityReport: true
                },
                {
                    $set: {
                        reportTags: reportTags,
                        updatedAt: new Date()
                    }
                },
                { new: true }
            );

            if (!updatedReport) {
                throw new NotFoundException(`Report withs ID=${id}, clientId=${clientId}, tags=${reportTags}}`);
            }

            return updatedReport;
        } catch (error) {
            console.error(`Error updating report tags: ${error.message}`);
            if (error.name === 'CastError') {
                throw new BadRequestException(`Invalid ID format: ${id}`);
            }
            throw error;
        }
    }

    // Add these methods to the CommunityReportService class

    /**
     * Get overall dashboard statistics for a client
     */
    async getDashboardStats(clientId: string) {
        try {
            // Get total reports count
            const totalReports = await this.reportModel.countDocuments({
                clientId,
                isCommunityReport: true
            });

            // Get counts by status
            const pendingCount = await this.reportModel.countDocuments({
                clientId,
                isCommunityReport: true,
                status: ReportStatus.PENDING_REVIEW
            });

            const activeCount = await this.reportModel.countDocuments({
                clientId,
                isCommunityReport: true,
                status: ReportStatus.ACTIVE
            });

            const inProgressCount = await this.reportModel.countDocuments({
                clientId,
                isCommunityReport: true,
                status: ReportStatus.IN_PROGRESS
            });

            const resolvedCount = await this.reportModel.countDocuments({
                clientId,
                isCommunityReport: true,
                status: ReportStatus.RESOLVED
            });

            const closedCount = await this.reportModel.countDocuments({
                clientId,
                isCommunityReport: true,
                status: ReportStatus.CLOSED
            });

            // Get category breakdown for better dashboard display
            const categoryBreakdown = await this.reportModel.aggregate([
                {
                    $match: {
                        clientId,
                        isCommunityReport: true
                    }
                },
                {
                    $group: {
                        _id: '$category',
                        count: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        category: { $ifNull: ['$_id', 'uncategorized'] },
                        count: 1
                    }
                },
                {
                    $sort: { count: -1 }
                }
            ]);

            // Get count of users with reports
            const activeUsers = await this.reportModel.aggregate([
                {
                    $match: {
                        clientId,
                        isCommunityReport: true,
                        authorId: { $exists: true, $ne: null }
                    }
                },
                {
                    $group: {
                        _id: '$authorId',
                        count: { $sum: 1 }
                    }
                },
                {
                    $count: 'total'
                }
            ]);

            const activeCitizens = activeUsers.length > 0 ? activeUsers[0].total : 0;

            // Calculate average response time in hours for resolved reports
            const resolvedReportsData = await this.reportModel.find({
                clientId,
                isCommunityReport: true,
                status: { $in: [ReportStatus.RESOLVED, ReportStatus.CLOSED] },
                createdAt: { $exists: true },
                updatedAt: { $exists: true }
            }).select('createdAt updatedAt');

            let totalResponseTime = 0;
            let reportsWithData = 0;

            resolvedReportsData.forEach(report => {
                if (report.createdAt && report.updatedAt) {
                    const responseTime = (report.updatedAt.getTime() - report.createdAt.getTime()) / (1000 * 60 * 60); // Hours
                    totalResponseTime += responseTime;
                    reportsWithData++;
                }
            });

            const averageResponseTime = reportsWithData > 0
                ? Math.round(totalResponseTime / reportsWithData)
                : 48; // Default if no data

            // Get recent activity (last 5 reports)
            const recentActivity = await this.reportModel.find({
                clientId,
                isCommunityReport: true
            })
                .sort({ createdAt: -1 })
                .limit(5)
                .select('title category status createdAt')
                .lean();

            // Calculate monthly trending data
            const now = new Date();
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(now.getMonth() - 6);

            const monthlyTrend = await this.reportModel.aggregate([
                {
                    $match: {
                        clientId,
                        isCommunityReport: true,
                        createdAt: { $gte: sixMonthsAgo }
                    }
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' }
                        },
                        count: { $sum: 1 }
                    }
                },
                {
                    $sort: { '_id.year': 1, '_id.month': 1 }
                },
                {
                    $project: {
                        _id: 0,
                        year: '$_id.year',
                        month: '$_id.month',
                        count: 1
                    }
                }
            ]);

            return {
                totalReports,
                pendingCount,
                activeCount,
                inProgressCount,
                resolvedCount,
                closedCount,
                activeCitizens,
                averageResponseTime,
                categoryBreakdown,
                recentActivity,
                monthlyTrend
            };
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
            return {
                totalReports: 0,
                pendingCount: 0,
                activeCount: 0,
                inProgressCount: 0,
                resolvedCount: 0,
                closedCount: 0,
                activeCitizens: 0,
                averageResponseTime: 0,
                categoryBreakdown: [],
                recentActivity: [],
                monthlyTrend: []
            };
        }
    }

    /**
     * Get monthly report trends
     */
    async getMonthlyReportTrends(clientId: string, year: number = new Date().getFullYear()) {
        const months = [
            'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        ];

        const startDate = new Date(year, 0, 1); // January 1st of the specified year
        const endDate = new Date(year, 11, 31, 23, 59, 59); // December 31st of the specified year

        const result = await this.reportModel.aggregate([
            {
                $match: {
                    clientId,
                    isCommunityReport: true,
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: { $month: '$createdAt' },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);

        // Convert to expected format and fill in missing months
        const monthlyData = months.map((month, index) => {
            const foundMonth = result.find(item => item._id === index + 1);
            return {
                month,
                value: foundMonth ? foundMonth.count : 0
            };
        });

        return monthlyData;
    }

    /**
     * Get reports distribution by status
     */
    async getReportsByStatus(clientId: string) {
        const result = await this.reportModel.aggregate([
            {
                $match: {
                    clientId,
                    isCommunityReport: true
                }
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    status: '$_id',
                    count: 1
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);

        return result;
    }

    /**
     * Get top report locations
     */
    async getTopReportLocations(clientId: string, limit: number = 5) {
        // Get report count by geographic clusters based on coordinate proximity
        const locationAnalysis = await this.reportModel.aggregate([
            {
                $match: {
                    clientId,
                    isCommunityReport: true,
                    'location.lat': { $exists: true, $ne: null },
                    'location.lng': { $exists: true, $ne: null }
                }
            },
            {
                $group: {
                    _id: {
                        // Round coordinates to create natural geographic clusters
                        // 2 decimal places ≈ 1.1km precision, which is good for district-level grouping
                        lat: { $round: ['$location.lat', 2] },
                        lng: { $round: ['$location.lng', 2] }
                    },
                    reports: { $sum: 1 },
                    reportIds: { $push: '$_id' },
                    // Store the center coordinates of this cluster
                    avgLat: { $avg: '$location.lat' },
                    avgLng: { $avg: '$location.lng' }
                }
            },
            {
                $sort: { reports: -1 }
            },
            {
                $limit: limit
            }
        ]);

        // For each location, calculate how many reports are resolved
        const topLocations = [];
        for (const location of locationAnalysis) {
            const resolvedCount = await this.reportModel.countDocuments({
                _id: { $in: location.reportIds },
                status: ReportStatus.RESOLVED
            });

            const resolvedRate = Math.round((resolvedCount / location.reports) * 100);

            // Generate a properly formatted location name based on coordinates
            // Using more precise coordinate representation
            const lat = location.avgLat || location._id.lat;
            const lng = location.avgLng || location._id.lng;

            // Convert coordinates to a more readable format
            const latDeg = Math.abs(lat);
            const latDir = lat >= 0 ? 'N' : 'S';
            const lngDeg = Math.abs(lng);
            const lngDir = lng >= 0 ? 'E' : 'W';

            // Format the location name with cardinal directions
            const locationName = `${latDeg.toFixed(4)}° ${latDir}, ${lngDeg.toFixed(4)}° ${lngDir}`;

            topLocations.push({
                name: locationName,
                coordinates: {
                    lat: lat,
                    lng: lng
                },
                reports: location.reports,
                resolvedRate
            });
        }

        return topLocations;
    }

    /**
     * Get recent reports
     */
    async getRecentReports(clientId: string, limit: number = 5) {
        const reports = await this.reportModel.find({
            clientId,
            isCommunityReport: true,
            visibleOnWeb: true
        })
            .sort({ createdAt: -1 })
            .limit(limit);

        return reports.map(report => {
            const reportObj = report.toObject();
            return {
                _id: reportObj._id.toString(),
                title: reportObj.title,
                category: reportObj.category,
                status: reportObj.status,
                createdAt: reportObj.createdAt,
                location: reportObj.location ? `Near (${reportObj.location.lat.toFixed(2)}, ${reportObj.location.lng.toFixed(2)})` : 'Unknown location'
            };
        });
    }

    /**
     * Get user engagement metrics
     */
    async getCitizenEngagementMetrics(clientId: string) {
        const now = new Date();
        const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Count new users this month
        const newUsersThisMonth = await this.userModel.countDocuments({
            client_ids: clientId,
            createdAt: { $gte: startOfCurrentMonth }
        });

        // Count users who submitted reports
        const reportingUsers = await this.reportModel.aggregate([
            {
                $match: {
                    clientId,
                    isCommunityReport: true,
                    authorId: { $exists: true, $ne: null }
                }
            },
            {
                $group: {
                    _id: '$authorId',
                    reportCount: { $sum: 1 }
                }
            }
        ]);

        // Calculate average reports per user
        const avgReportsPerUser = reportingUsers.length > 0
            ? reportingUsers.reduce((sum, user) => sum + user.reportCount, 0) / reportingUsers.length
            : 0;

        return {
            newUsersThisMonth,
            reportingUserCount: reportingUsers.length,
            avgReportsPerUser: parseFloat(avgReportsPerUser.toFixed(1))
        };
    }


    /**
     * Apply common filters based on params
     */
    private getBaseFilters(clientId: string, params: AnalyticsParams) {
        const filters: any = {
            clientId,
            isCommunityReport: true
        };

        // Date range filters
        if (params.startDate) {
            filters.createdAt = { $gte: new Date(params.startDate) };
        }

        if (params.endDate) {
            filters.createdAt = filters.createdAt || {};
            filters.createdAt.$lte = new Date(params.endDate);
        }

        // Category filter
        if (params.category && params.category !== 'all') {
            filters.category = params.category;
        }

        return filters;
    }

    /**
     * Get resolution metrics
     */
    async getResolutionMetrics(clientId: string, params: AnalyticsParams) {
        const baseFilters = this.getBaseFilters(clientId, params);

        // Get overall metrics
        const total = await this.reportModel.countDocuments(baseFilters);

        const resolved = await this.reportModel.countDocuments({
            ...baseFilters,
            status: ReportStatus.RESOLVED
        });

        const resolutionRate = total > 0 ? parseFloat(((resolved / total) * 100).toFixed(1)) : 0;

        // Get resolution time for resolved reports
        const resolvedReports = await this.reportModel.find({
            ...baseFilters,
            status: ReportStatus.RESOLVED,
            createdAt: { $exists: true },
            updatedAt: { $exists: true }
        }).select('createdAt updatedAt');

        let totalResolutionTime = 0;

        resolvedReports.forEach(report => {
            if (report.createdAt && report.updatedAt) {
                const resolutionTime = (report.updatedAt.getTime() - report.createdAt.getTime()) / (1000 * 60 * 60); // hours
                totalResolutionTime += resolutionTime;
            }
        });

        const avgResolutionTime = resolvedReports.length > 0
            ? parseFloat((totalResolutionTime / resolvedReports.length).toFixed(1))
            : 0;

        // Get resolution metrics by category
        const categoryMetrics = await this.reportModel.aggregate([
            {
                $match: baseFilters
            },
            {
                $group: {
                    _id: '$category',
                    total: { $sum: 1 },
                    resolved: {
                        $sum: {
                            $cond: [{ $eq: ['$status', ReportStatus.RESOLVED] }, 1, 0]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    category: '$_id',
                    total: 1,
                    resolved: 1,
                    resolutionRate: {
                        $cond: [
                            { $gt: ['$total', 0] },
                            { $multiply: [{ $divide: ['$resolved', '$total'] }, 100] },
                            0
                        ]
                    }
                }
            },
            {
                $sort: { total: -1 }
            }
        ]);

        // Round resolution rates
        categoryMetrics.forEach(metric => {
            metric.resolutionRate = parseFloat(metric.resolutionRate.toFixed(1));
        });

        // Generate resolution trend data
        const trendData = [];
        const now = new Date();

        // Create weekly data points for the past 5 weeks
        for (let i = 4; i >= 0; i--) {
            const endDate = new Date(now);
            endDate.setDate(now.getDate() - (i * 7));
            const startDate = new Date(endDate);
            startDate.setDate(endDate.getDate() - 7);

            const periodFilters = {
                ...baseFilters,
                createdAt: { $gte: startDate, $lt: endDate }
            };

            const periodTotal = await this.reportModel.countDocuments(periodFilters);

            const periodResolved = await this.reportModel.countDocuments({
                ...periodFilters,
                status: ReportStatus.RESOLVED
            });

            const periodRate = periodTotal > 0
                ? parseFloat(((periodResolved / periodTotal) * 100).toFixed(1))
                : 0;

            trendData.push({
                date: endDate.toISOString().split('T')[0],
                resolutionRate: periodRate
            });
        }

        return {
            overall: {
                total,
                resolved,
                resolutionRate,
                avgResolutionTime
            },
            byCategory: categoryMetrics,
            trend: trendData
        };
    }

    /**
     * Complete the category trends method to add count for top categories
     */
    async getCategoryTrends(clientId: string, params: AnalyticsParams) {
        const baseFilters = this.getBaseFilters(clientId, params);

        // Get overall distribution by category
        const distribution = await this.reportModel.aggregate([
            {
                $match: baseFilters
            },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);

        // Calculate total for percentages
        const total = distribution.reduce((sum, item) => sum + item.count, 0);

        // Add percentage to each category
        const distributionWithPercentage = distribution.map(item => ({
            category: item._id,
            count: item.count,
            percentage: parseFloat(((item.count / total) * 100).toFixed(1))
        }));

        // Get category growth
        const now = new Date();
        const oneMonthAgo = new Date(now);
        oneMonthAgo.setMonth(now.getMonth() - 1);
        const twoMonthsAgo = new Date(oneMonthAgo);
        twoMonthsAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const currentMonthCountByCategory = await this.reportModel.aggregate([
            {
                $match: {
                    ...baseFilters,
                    createdAt: { $gte: oneMonthAgo, $lte: now }
                }
            },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 }
                }
            }
        ]);

        const previousMonthCountByCategory = await this.reportModel.aggregate([
            {
                $match: {
                    ...baseFilters,
                    createdAt: { $gte: twoMonthsAgo, $lt: oneMonthAgo }
                }
            },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Calculate growth rates
        const growth = [];

        for (const category of currentMonthCountByCategory) {
            const currentCount = category.count;
            const previousCategory = previousMonthCountByCategory.find(c => c._id === category._id);
            const previousCount = previousCategory ? previousCategory.count : 0;

            let growthRate = 0;
            if (previousCount > 0) {
                growthRate = parseFloat((((currentCount - previousCount) / previousCount) * 100).toFixed(1));
            } else if (currentCount > 0) {
                growthRate = 100; // If there were no reports before, but now there are, that's 100% growth
            }

            growth.push({
                category: category._id,
                monthlyGrowth: growthRate
            });
        }

        // Generate trend data (reports per week per category)
        const categoryTrends = [];
        const topCategories = distribution.slice(0, 5).map(item => item._id); // Get top 5 categories

        // Get 4 weeks of data
        for (let i = 3; i >= 0; i--) {
            const endDate = new Date(now);
            endDate.setDate(now.getDate() - (i * 7));
            const startDate = new Date(endDate);
            startDate.setDate(endDate.getDate() - 7);

            const weekData = await this.reportModel.aggregate([
                {
                    $match: {
                        ...baseFilters,
                        createdAt: { $gte: startDate, $lt: endDate }
                    }
                },
                {
                    $group: {
                        _id: '$category',
                        count: { $sum: 1 }
                    }
                }
            ]);

            const trendPoint = {
                date: endDate.toISOString().split('T')[0]
            };

            // Add counts for top categories
            for (const category of topCategories) {
                const categoryData = weekData.find(item => item._id === category);
                trendPoint[category] = categoryData ? categoryData.count : 0;
            }

            categoryTrends.push(trendPoint);
        }

        return {
            distribution: distributionWithPercentage,
            growth,
            trends: categoryTrends
        };
    }

    /**
     * Get geographic distribution
     */
    async getGeographicDistribution(clientId: string, params: AnalyticsParams) {
        const baseFilters = this.getBaseFilters(clientId, params);
        const limit = params.limit || 5;

        // Add location filters
        const filters = {
            ...baseFilters,
            'location.lat': { $exists: true },
            'location.lng': { $exists: true }
        };

        // Get report hotspots
        const hotspots = await this.reportModel.aggregate([
            {
                $match: filters
            },
            {
                $group: {
                    _id: {
                        lat: { $round: ['$location.lat', 2] },
                        lng: { $round: ['$location.lng', 2] }
                    },
                    count: { $sum: 1 },
                    reportIds: { $push: '$_id' }
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: limit
            }
        ]);

        // Enhance hotspots with category breakdown
        const enhancedHotspots = [];
        for (const hotspot of hotspots) {
            // Get category breakdown for this location
            const categoryBreakdown = await this.reportModel.aggregate([
                {
                    $match: {
                        ...filters,
                        _id: { $in: hotspot.reportIds }
                    }
                },
                {
                    $group: {
                        _id: '$category',
                        count: { $sum: 1 }
                    }
                },
                {
                    $sort: { count: -1 }
                }
            ]);

            // Get status breakdown
            const statusBreakdown = await this.reportModel.aggregate([
                {
                    $match: {
                        ...filters,
                        _id: { $in: hotspot.reportIds }
                    }
                },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]);

            enhancedHotspots.push({
                location: {
                    lat: hotspot._id.lat,
                    lng: hotspot._id.lng
                },
                count: hotspot.count,
                categories: categoryBreakdown.map(cat => ({
                    name: cat._id,
                    count: cat.count
                })),
                statuses: statusBreakdown.map(status => ({
                    name: status._id,
                    count: status.count
                }))
            });
        }

        // Get overall location heatmap data (simplified for frontend rendering)
        const heatmapData = await this.reportModel.aggregate([
            {
                $match: filters
            },
            {
                $project: {
                    lat: '$location.lat',
                    lng: '$location.lng',
                    weight: 1 // Base weight of 1 per report
                }
            }
        ]);

        return {
            hotspots: enhancedHotspots,
            heatmapData: heatmapData.map(point => ({
                lat: point.lat,
                lng: point.lng,
                weight: point.weight
            }))
        };
    }

    /**
     * Get response time metrics
     */
    async getResponseTimeMetrics(clientId: string, params: AnalyticsParams) {
        const baseFilters = this.getBaseFilters(clientId, params);

        // Only look at reports that have been resolved or closed for accurate response times
        const filters = {
            ...baseFilters,
            status: { $in: [ReportStatus.RESOLVED, ReportStatus.CLOSED] },
            createdAt: { $exists: true },
            updatedAt: { $exists: true }
        };

        // Get all relevant reports for analysis
        const reports = await this.reportModel.find(filters).select('createdAt updatedAt category');

        if (reports.length === 0) {
            return {
                averageResponseTime: 0,
                byCategory: [],
                byWeekday: [],
                responseTimeTrend: []
            };
        }

        // Calculate overall average response time in hours
        let totalResponseTime = 0;
        const responseTimesByCategory = {};
        const responseTimesByWeekday = [0, 0, 0, 0, 0, 0, 0]; // Sunday to Saturday
        const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
        const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        // Collect data for trend analysis
        const reportsByMonth = {};

        for (const report of reports) {
            const responseTime = (report.updatedAt.getTime() - report.createdAt.getTime()) / (1000 * 60 * 60); // Hours

            // Add to total
            totalResponseTime += responseTime;

            // Add to category breakdown
            const category = report.category || 'uncategorized';
            if (!responseTimesByCategory[category]) {
                responseTimesByCategory[category] = {
                    total: 0,
                    count: 0
                };
            }
            responseTimesByCategory[category].total += responseTime;
            responseTimesByCategory[category].count++;

            // Add to weekday breakdown
            const weekday = report.createdAt.getDay(); // 0 = Sunday, 6 = Saturday
            responseTimesByWeekday[weekday] += responseTime;
            weekdayCounts[weekday]++;

            // Add to monthly trend
            const monthKey = `${report.createdAt.getFullYear()}-${(report.createdAt.getMonth() + 1).toString().padStart(2, '0')}`;
            if (!reportsByMonth[monthKey]) {
                reportsByMonth[monthKey] = {
                    total: 0,
                    count: 0
                };
            }
            reportsByMonth[monthKey].total += responseTime;
            reportsByMonth[monthKey].count++;
        }

        // Calculate average response time
        const averageResponseTime = parseFloat((totalResponseTime / reports.length).toFixed(1));

        // Calculate average response time by category
        const byCategory = Object.keys(responseTimesByCategory).map(category => ({
            category,
            averageResponseTime: parseFloat((responseTimesByCategory[category].total / responseTimesByCategory[category].count).toFixed(1))
        })).sort((a, b) => a.averageResponseTime - b.averageResponseTime);

        // Calculate average response time by weekday
        const byWeekday = weekdayCounts.map((count, index) => ({
            weekday: weekdayNames[index],
            averageResponseTime: count > 0 ? parseFloat((responseTimesByWeekday[index] / count).toFixed(1)) : 0
        }));

        // Create trend data
        const responseTimeTrend = Object.keys(reportsByMonth).sort().map(month => ({
            month,
            averageResponseTime: parseFloat((reportsByMonth[month].total / reportsByMonth[month].count).toFixed(1))
        }));

        return {
            averageResponseTime,
            byCategory,
            byWeekday,
            responseTimeTrend
        };
    }

    /**
     * Get user engagement metrics
     */
    async getUserEngagementMetrics(clientId: string, params: AnalyticsParams) {
        const baseFilters = this.getBaseFilters(clientId, params);

        // Get count of unique users who submitted reports
        const userActivity = await this.reportModel.aggregate([
            {
                $match: {
                    ...baseFilters,
                    authorId: { $exists: true, $ne: null }
                }
            },
            {
                $group: {
                    _id: '$authorId',
                    reportCount: { $sum: 1 },
                    firstReport: { $min: '$createdAt' },
                    lastReport: { $max: '$createdAt' }
                }
            }
        ]);

        // Calculate basic metrics
        const totalUsers = userActivity.length;

        if (totalUsers === 0) {
            return {
                totalUsers: 0,
                activeUsers: 0,
                averageReportsPerUser: 0,
                retention: 0,
                engagement: []
            };
        }

        const totalReports = userActivity.reduce((sum, user) => sum + user.reportCount, 0);
        const averageReportsPerUser = parseFloat((totalReports / totalUsers).toFixed(1));

        // Classify users by activity level
        const powerUsers = userActivity.filter(user => user.reportCount >= 5).length;
        const regularUsers = userActivity.filter(user => user.reportCount >= 2 && user.reportCount < 5).length;
        const oneTimeUsers = userActivity.filter(user => user.reportCount === 1).length;

        // Calculate user retention (users who submitted reports in more than one month)
        const retainedUsers = userActivity.filter(user => {
            const firstMonth = `${user.firstReport.getFullYear()}-${user.firstReport.getMonth()}`;
            const lastMonth = `${user.lastReport.getFullYear()}-${user.lastReport.getMonth()}`;
            return firstMonth !== lastMonth;
        }).length;

        const retentionRate = parseFloat(((retainedUsers / totalUsers) * 100).toFixed(1));

        // Generate engagement trend data (reports by month)
        const now = new Date();
        const months = [];

        // Get 6 months of data
        for (let i = 5; i >= 0; i--) {
            const date = new Date(now);
            date.setMonth(now.getMonth() - i);
            const year = date.getFullYear();
            const month = date.getMonth();

            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 0, 23, 59, 59);

            // Count reports and unique users for this month
            const monthlyStats = await this.reportModel.aggregate([
                {
                    $match: {
                        ...baseFilters,
                        createdAt: { $gte: startDate, $lte: endDate },
                        authorId: { $exists: true, $ne: null }
                    }
                },
                {
                    $group: {
                        _id: null,
                        reports: { $sum: 1 },
                        uniqueUsers: { $addToSet: '$authorId' }
                    }
                }
            ]);

            const monthData = {
                date: `${year}-${(month + 1).toString().padStart(2, '0')}`,
                reports: monthlyStats.length > 0 ? monthlyStats[0].reports : 0,
                users: monthlyStats.length > 0 ? monthlyStats[0].uniqueUsers.length : 0
            };

            months.push(monthData);
        }

        return {
            totalUsers,
            averageReportsPerUser,
            userBreakdown: {
                powerUsers,
                regularUsers,
                oneTimeUsers
            },
            retention: {
                retainedUsers,
                retentionRate
            },
            engagement: months
        };
    }

    /**
     * Get comparative analysis (current period vs previous period)
     */
    async getComparativeAnalysis(clientId: string, params: AnalyticsParams) {
        // Define time periods
        const endDate = params.endDate ? new Date(params.endDate) : new Date();
        const startDate = params.startDate ? new Date(params.startDate) : new Date(endDate);
        startDate.setMonth(startDate.getMonth() - 1); // Default to 1 month period if not specified

        // Calculate previous period (same duration, immediately before)
        const periodDuration = endDate.getTime() - startDate.getTime();
        const previousPeriodEnd = new Date(startDate);
        previousPeriodEnd.setDate(previousPeriodEnd.getDate() - 1);
        const previousPeriodStart = new Date(previousPeriodEnd.getTime() - periodDuration);

        // Create filter for current period
        const currentPeriodFilter = {
            clientId,
            isCommunityReport: true,
            createdAt: { $gte: startDate, $lte: endDate }
        };

        // Create filter for previous period
        const previousPeriodFilter = {
            clientId,
            isCommunityReport: true,
            createdAt: { $gte: previousPeriodStart, $lte: previousPeriodEnd }
        };

        // Get metrics for current period
        const currentPeriodReportCount = await this.reportModel.countDocuments(currentPeriodFilter);
        const currentPeriodResolvedCount = await this.reportModel.countDocuments({
            ...currentPeriodFilter,
            status: ReportStatus.RESOLVED
        });
        const currentPeriodUserCount = (await this.reportModel.aggregate([
            {
                $match: {
                    ...currentPeriodFilter,
                    authorId: { $exists: true, $ne: null }
                }
            },
            {
                $group: {
                    _id: '$authorId'
                }
            }
        ])).length;

        // Get metrics for previous period
        const previousPeriodReportCount = await this.reportModel.countDocuments(previousPeriodFilter);
        const previousPeriodResolvedCount = await this.reportModel.countDocuments({
            ...previousPeriodFilter,
            status: ReportStatus.RESOLVED
        });
        const previousPeriodUserCount = (await this.reportModel.aggregate([
            {
                $match: {
                    ...previousPeriodFilter,
                    authorId: { $exists: true, $ne: null }
                }
            },
            {
                $group: {
                    _id: '$authorId'
                }
            }
        ])).length;

        // Calculate category comparison
        const currentPeriodCategories = await this.reportModel.aggregate([
            {
                $match: currentPeriodFilter
            },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);

        const previousPeriodCategories = await this.reportModel.aggregate([
            {
                $match: previousPeriodFilter
            },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Combine category data
        const categoryComparison = currentPeriodCategories.map(category => {
            const previousCategory = previousPeriodCategories.find(c => c._id === category._id);
            const previousCount = previousCategory ? previousCategory.count : 0;

            return {
                category: category._id,
                current: category.count,
                previous: previousCount,
                change: previousCount > 0
                    ? parseFloat((((category.count - previousCount) / previousCount) * 100).toFixed(1))
                    : null
            };
        });

        // Calculate percentages and changes
        const reportGrowth = previousPeriodReportCount > 0
            ? parseFloat((((currentPeriodReportCount - previousPeriodReportCount) / previousPeriodReportCount) * 100).toFixed(1))
            : null;

        const resolvedGrowth = previousPeriodResolvedCount > 0
            ? parseFloat((((currentPeriodResolvedCount - previousPeriodResolvedCount) / previousPeriodResolvedCount) * 100).toFixed(1))
            : null;

        const userGrowth = previousPeriodUserCount > 0
            ? parseFloat((((currentPeriodUserCount - previousPeriodUserCount) / previousPeriodUserCount) * 100).toFixed(1))
            : null;

        return {
            periods: {
                current: {
                    start: startDate,
                    end: endDate
                },
                previous: {
                    start: previousPeriodStart,
                    end: previousPeriodEnd
                }
            },
            metrics: {
                reports: {
                    current: currentPeriodReportCount,
                    previous: previousPeriodReportCount,
                    change: reportGrowth
                },
                resolved: {
                    current: currentPeriodResolvedCount,
                    previous: previousPeriodResolvedCount,
                    change: resolvedGrowth
                },
                users: {
                    current: currentPeriodUserCount,
                    previous: previousPeriodUserCount,
                    change: userGrowth
                }
            },
            categories: categoryComparison
        };
    }

    /**
     * Get trending keywords from report titles and content
     */
    async getTrendingKeywords(clientId: string, params: AnalyticsParams) {
        const baseFilters = this.getBaseFilters(clientId, params);
        const limit = params.limit || 10;

        // Get reports for the period
        const reports = await this.reportModel.find(baseFilters)
            .select('title content.message')
            .limit(1000); // Limit to 1000 reports for performance

        // Common words to exclude (stopwords)
        const stopwords = [
            'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'with', 'by', 'about', 'as', 'into', 'like', 'through', 'after', 'over',
            'between', 'out', 'of', 'from', 'up', 'down', 'is', 'are', 'was', 'were',
            'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
            'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'i',
            'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'
        ];

        // Process all report text to extract keywords
        const wordFrequency = {};

        reports.forEach(report => {
            // Combine title and content
            let text = `${report.title || ''} ${report.content?.message || ''}`;

            // Convert to lowercase and remove special characters
            text = text.toLowerCase().replace(/[^\w\s]/g, '');

            // Split into words
            const words = text.split(/\s+/);

            // Count word frequency, excluding stopwords and short words
            words.forEach(word => {
                if (word && word.length > 3 && !stopwords.includes(word)) {
                    wordFrequency[word] = (wordFrequency[word] || 0) + 1;
                }
            });
        });

        // Convert to array and sort by frequency
        const keywords = Object.keys(wordFrequency)
            .map(word => ({
                keyword: word,
                count: wordFrequency[word]
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);

        // Get top keywords by period (weekly for the last month)
        const now = new Date();
        const periodKeywords = [];

        // Get keyword trends for the last 4 weeks
        for (let i = 3; i >= 0; i--) {
            const endDate = new Date(now);
            endDate.setDate(now.getDate() - (i * 7));
            const startDate = new Date(endDate);
            startDate.setDate(endDate.getDate() - 7);

            // Get reports for this period
            const periodReports = await this.reportModel.find({
                ...baseFilters,
                createdAt: { $gte: startDate, $lt: endDate }
            }).select('title content.message');

            // Process words for this period
            const periodWordFreq = {};

            periodReports.forEach(report => {
                let text = `${report.title || ''} ${report.content?.message || ''}`;
                text = text.toLowerCase().replace(/[^\w\s]/g, '');
                const words = text.split(/\s+/);

                words.forEach(word => {
                    if (word && word.length > 3 && !stopwords.includes(word)) {
                        periodWordFreq[word] = (periodWordFreq[word] || 0) + 1;
                    }
                });
            });

            // Get top 5 keywords for this period
            const topKeywords = Object.keys(periodWordFreq)
                .map(word => ({
                    keyword: word,
                    count: periodWordFreq[word]
                }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);

            periodKeywords.push({
                period: {
                    start: startDate,
                    end: endDate
                },
                keywords: topKeywords
            });
        }

        return {
            topKeywords: keywords,
            trendsByPeriod: periodKeywords
        };
    }

    /**
     * Get all report tags for a client
     * @param clientId The client ID
     */
    async getAllReportTags(clientId: string) {
        try {
            // Fetch all tags for this client
            const tags = await this.reportTagModel.find({
                clientId: clientId
            }).sort({ name: 1 });

            return tags.map(tag => ({
                id: tag._id.toString(),
                name: tag.name,
                description: tag.description
            }));
        } catch (error) {
            console.error('Error fetching report tags:', error);
            return [];
        }
    }


    /**
     * Update only the isFeatured field of a report
     * @param id Report ID
     * @param clientId Client ID
     * @param isFeatured Boolean value to set
     * @returns Updated report
     */
    async updateIsFeatured(id: string, clientId: string, isFeatured: boolean): Promise<Report> {
        // First, check if the report exists
        const existingReport = await this.reportModel.findOne({
            _id: id,
            clientId: clientId,
            isCommunityReport: true
        });

        if (!existingReport) {
            throw new NotFoundException(`Report with ID ${id} not found`);
        }

        console.log(`Updating isFeatured field only for report ${id} to: ${isFeatured}`);

        // Update only the isFeatured field and updatedAt timestamp
        const result = await this.reportModel.updateOne(
            { _id: id },
            {
                $set: {
                    isFeatured: isFeatured,
                    updatedAt: new Date()
                }
            }
        );

        if (result.modifiedCount === 0) {
            console.error('Failed to update isFeatured field');
        }

        // Fetch the updated report
        const updatedReport = await this.reportModel.findById(id);
        if (!updatedReport) {
            throw new NotFoundException(`Report with ID ${id} not found after update`);
        }

        return updatedReport;
    }


    /**
     * Update only the status field of a report
     * @param id Report ID
     * @param clientId Client ID
     * @param status New status value
     * @returns Updated report
     */
    async updateStatus(id: string, clientId: string, status: ReportStatus): Promise<Report> {
        // First, check if the report exists
        const existingReport = await this.reportModel.findOne({
            _id: id,
            clientId: clientId,
            isCommunityReport: true
        });

        if (!existingReport) {
            throw new NotFoundException(`Report with ID ${id} not found`);
        }

        console.log(`Updating status field only for report ${id} to: ${status}`);

        // Update only the status field and updatedAt timestamp
        const result = await this.reportModel.updateOne(
            { _id: id },
            {
                $set: {
                    status: status,
                    updatedAt: new Date()
                }
            }
        );

        if (result.modifiedCount === 0) {
            console.error('Failed to update status field');
        }

        // Fetch the updated report
        const updatedReport = await this.reportModel.findById(id);
        if (!updatedReport) {
            throw new NotFoundException(`Report with ID ${id} not found after update`);
        }

        return updatedReport;
    }


    /**
     * Get comments for a report
     */
    async getReportComments(reportId: string, clientId: string) {
        // First check if the report exists and belongs to the client
        const report = await this.reportModel.findOne({
            _id: reportId,
            clientId: clientId,
            isCommunityReport: true
        });

        if (!report) {
            throw new NotFoundException(`Report with ID ${reportId} not found`);
        }

        // Get comments with populated user information
        const comments = await this.reportCommentModel.find({
            reportId: reportId,
            clientId: clientId
        })
            .sort({ createdAt: -1 })
            .populate({
                path: 'authorId',
                model: 'User',
                select: 'name surname email image'
            })
            .lean();

        // Transform comments into a more frontend-friendly format
        const transformedComments = comments.map(comment => {
            // Extract author information
            let author = null;
            if (comment.authorId) {
                const user = comment.authorId as any;
                author = {
                    id: user._id.toString(),
                    name: user.name && user.surname ? `${user.name} ${user.surname}` : user.name || user.email,
                };
            }

            return {
                id: comment._id.toString(),
                content: comment.content,
                author,
                createdAt: comment.createdAt,
                updatedAt: comment.updatedAt
            };
        });

        return {
            data: transformedComments,
            total: transformedComments.length
        };
    }

    /**
     * Add a comment to a report
     */
    async addReportComment(reportId: string, clientId: string, userId: string, content: string) {
        // First check if the report exists and belongs to the client
        const report = await this.reportModel.findOne({
            _id: reportId,
            clientId: clientId,
            isCommunityReport: true
        });

        if (!report) {
            throw new NotFoundException(`Report with ID ${reportId} not found`);
        }

        // Check if the user exists and belongs to the client
        const user = await this.userModel.findById(userId);
        if (!user) {
            throw new NotFoundException(`User with ID ${userId} not found`);
        }

        if (!user.client_ids.includes(clientId)) {
            throw new UnauthorizedException('User does not belong to this client');
        }

        // Create the comment
        const comment = await this.reportCommentModel.create({
            reportId,
            clientId,
            authorId: userId,
            content: content.trim(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Increment the comment count on the report
        await this.reportModel.updateOne(
            { _id: reportId },
            {
                $inc: { commentCount: 1 },
                $set: { updatedAt: new Date() }
            }
        );

        // Return the newly created comment with author information
        const populatedComment = await this.reportCommentModel.findById(comment._id)
            .populate({
                path: 'authorId',
                model: 'User',
                select: 'name surname email image'
            })
            .lean();

        // Transform the comment
        const user2 = populatedComment.authorId as any;
        const author = {
            id: user2._id.toString(),
            name: user2.name && user2.surname ? `${user2.name} ${user2.surname}` : user2.name || user2.email,
        };

        return {
            id: populatedComment._id.toString(),
            content: populatedComment.content,
            author,
            createdAt: populatedComment.createdAt,
            updatedAt: populatedComment.updatedAt
        };
    }

    async getReportsByCategory(clientId: string) {
        try {
            const result = await this.reportModel.aggregate([
                {
                    $match: {
                        clientId,
                        isCommunityReport: true
                    }
                },
                {
                    $group: {
                        _id: '$category',
                        count: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        category: { $ifNull: ['$_id', 'other'] },
                        name: { $ifNull: ['$_id', 'other'] },
                        count: 1,
                        // Add color for frontend display
                        color: {
                            $switch: {
                                branches: [
                                    { case: { $eq: ['$_id', 'infrastructure'] }, then: '#64748B' },
                                    { case: { $eq: ['$_id', 'environment'] }, then: '#22C55E' },
                                    { case: { $eq: ['$_id', 'community'] }, then: '#A855F7' },
                                    { case: { $eq: ['$_id', 'safety'] }, then: '#EF4444' },
                                    { case: { $eq: ['$_id', 'health_services'] }, then: '#EC4899' },
                                    { case: { $eq: ['$_id', 'public_services'] }, then: '#3B82F6' },
                                    { case: { $eq: ['$_id', 'transportation'] }, then: '#F97316' }
                                ],
                                default: '#6B7280'
                            }
                        }
                    }
                },
                {
                    $sort: { count: -1 }
                }
            ]);

            // Format category names for display
            return result.map(item => ({
                ...item,
                name: item.name ? item.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Other',
                displayName: item.name ? item.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Other'
            }));
        } catch (error) {
            console.error('Error getting reports by category:', error);
            return [];
        }
    }
}