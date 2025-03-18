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

@Injectable()
export class CommunityReportService {
    constructor(
        @InjectModel(Report.name) private reportModel: Model<Report>,
        @InjectModel(ReportTag.name) private reportTagModel: Model<ReportTag>,
        @InjectModel(User.name) private userModel: Model<User>,
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

    /**
     * Create a report from admin with proper handling for reportTags
     */
    async createFromAdmin(
        reportData: any,
        files: Express.Multer.File[] = [],
        audioFile?: Express.Multer.File
    ): Promise<Report> {

        // Create a clean report data object
        const cleanedData: CreateCommunityReportDto & { clientId: string } = {
            title: reportData.title,
            content: reportData.content,
            category: reportData.category,
            clientId: reportData.clientId,
            // Process boolean fields
            isAnonymous: reportData.isAnonymous === 'true' || reportData.isAnonymous === true,
            isFeatured: reportData.isFeatured === 'true' || reportData.isFeatured === true,
            visibleOnWeb: reportData.visibleOnWeb === 'true' || reportData.visibleOnWeb === true || reportData.visibleOnWeb === undefined,
            isFromChatbot: false,
            // Set additional fields
            status: reportData.status || ReportStatus.ACTIVE,
            customAuthorName: reportData.customAuthorName || undefined,
            authorId: reportData.authorId || undefined,
        };

        // Process location
        if (reportData.location) {
            try {
                if (typeof reportData.location === 'string') {
                    cleanedData.location = JSON.parse(reportData.location);
                } else {
                    cleanedData.location = reportData.location;
                }
            } catch (e) {
                console.warn('Error parsing location data', e);
            }
        }

        // Initialize tag arrays
        cleanedData.tags = [];
        cleanedData.reportTags = [];

        // Handle reportTags - Enhanced approach
        if (reportData.reportTags) {
            try {
                // Direct JSON string from frontend
                if (typeof reportData.reportTags === 'string') {
                    // Check if it's a JSON array
                    if (reportData.reportTags.startsWith('[')) {
                        cleanedData.reportTags = JSON.parse(reportData.reportTags);
                    } else if (reportData.reportTags.includes(',')) {
                        // Handle comma-separated list
                        cleanedData.reportTags = reportData.reportTags.split(',').map(tag => tag.trim());
                    } else {
                        // Single tag ID
                        cleanedData.reportTags = [reportData.reportTags];
                    }
                } else if (Array.isArray(reportData.reportTags)) {
                    // Direct array assignment
                    cleanedData.reportTags = reportData.reportTags;
                }
            } catch (e) {
                console.error('Error processing reportTags JSON', e);
            }
        }

        // Check for reportTags[] format (common in form submissions)
        const reportTagKeys = Object.keys(reportData)
            .filter(key => key.startsWith('reportTags['))
            .sort((a, b) => {
                // Sort by index number
                const indexA = parseInt(a.match(/\[(\d+)\]/)?.[1] || '0');
                const indexB = parseInt(b.match(/\[(\d+)\]/)?.[1] || '0');
                return indexA - indexB;
            });

        console.log('Found reportTag keys:', reportTagKeys);

        if (reportTagKeys.length > 0) {
            const tagsArray: string[] = [];
            for (const key of reportTagKeys) {
                if (reportData[key]) {
                    console.log(`Found reportTag value for ${key}:`, reportData[key]);
                    tagsArray.push(reportData[key]);
                }
            }
            if (tagsArray.length > 0) {
                console.log('Setting reportTags from array values:', tagsArray);
                cleanedData.reportTags = tagsArray;
            }
        }

        // Process regular tags similarly
        if (reportData.tags) {
            if (typeof reportData.tags === 'string') {
                try {
                    const parsedTags = JSON.parse(reportData.tags);
                    if (Array.isArray(parsedTags)) {
                        cleanedData.tags = parsedTags;
                    } else {
                        cleanedData.tags = [reportData.tags];
                    }
                } catch (e) {
                    // If not valid JSON, treat as comma-separated or single tag
                    if (reportData.tags.includes(',')) {
                        cleanedData.tags = reportData.tags.split(',').map(tag => tag.trim());
                    } else {
                        cleanedData.tags = [reportData.tags];
                    }
                }
            } else if (Array.isArray(reportData.tags)) {
                cleanedData.tags = reportData.tags;
            }
        }

        // Check media files
        console.log('Processing media files:', files.length);
        files.forEach((file, index) => {
            console.log(`Media file ${index}:`, file.fieldname, file.originalname, file.mimetype, file.size);
        });

        // Log the cleaned data for debugging
        console.log('Cleaned report data:', JSON.stringify({
            ...cleanedData,
            reportTags: cleanedData.reportTags,
            tags: cleanedData.tags
        }));

        // Now use the standard create method with the cleaned data
        return this.create(cleanedData, files, audioFile);
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
}