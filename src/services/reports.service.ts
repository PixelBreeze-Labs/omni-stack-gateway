// src/services/reports.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FileAttachment, Report, ReportsSummary } from '../interfaces/report.interface';
import { ClientApp } from '../interfaces/client-app.interface';
import { EmailService } from './email.service';
import { SupabaseService } from './supabase.service';
import { Client } from '../schemas/client.schema';

@Injectable()
export class ReportsService {
    constructor(
        @InjectModel('Report') private readonly reportModel: Model<Report>,
        @InjectModel('ClientApp') private readonly clientAppModel: Model<ClientApp>,
        @InjectModel('Client') private readonly clientModel: Model<Client>,
        private readonly emailService: EmailService,
        private readonly supabaseService: SupabaseService
    ) {}

    async create(report: Report): Promise<Report> {
        // Process file uploads if any
        let filesToSave: FileAttachment[] = [];
        if (report.content.files && report.content.files.length > 0) {
            // Create a temporary report to get an ID
            const tempReport = new this.reportModel({
                ...report,
                content: {
                    ...report.content,
                    files: [] // Start with empty files array
                }
            });
            const savedTempReport = await tempReport.save();

            // Upload files to Supabase
            filesToSave = await this.supabaseService.uploadReportFiles(
                savedTempReport._id.toString(),
                report.content.files
            );

            // Update the report with file URLs
            await this.reportModel.findByIdAndUpdate(
                savedTempReport._id,
                {
                    'content.files': filesToSave
                }
            );

            // Get the updated report
            const updatedReport = await this.reportModel.findById(savedTempReport._id);

            // Find the associated client app
            const clientApp = await this.clientAppModel.findOne({
                _id: report.clientApp.id
            });

            if (clientApp) {
                try {
                    await this.emailService.sendReportNotification(updatedReport, clientApp);
                } catch (error) {
                    console.error('Failed to send email notification:', error);
                }
            }

            return updatedReport;
        } else {
            // No files to process, continue with normal flow
            const newReport = new this.reportModel(report);
            const savedReport = await newReport.save();

            // Find the associated client app
            const clientApp = await this.clientAppModel.findOne({
                _id: report.clientApp.id
            });

            if (clientApp) {
                try {
                    await this.emailService.sendReportNotification(savedReport, clientApp);
                } catch (error) {
                    console.error('Failed to send email notification:', error);
                }
            }

            return savedReport;
        }
    }

    async findAll(query: any): Promise<{
        data: Report[];
        total: number;
        message: string;
        summary?: ReportsSummary;
    }> {
        const filter: any = {};
        const sort: any = {};

        // Apply filters
        if (query.status) filter.status = query.status;
        if (query.clientAppId) filter['clientApp.id'] = query.clientAppId;
        if (query.priority) filter.priority = query.priority;

        // Add search capability (search in sender name, email, or message content)
        if (query.search) {
            const searchRegex = new RegExp(query.search, 'i');
            filter.$or = [
                { 'content.sender.name': searchRegex },
                { 'content.sender.email': searchRegex },
                { 'content.message': searchRegex },
            ];
        }

        // Handle date range filtering
        if (query.fromDate || query.toDate) {
            filter.$or = [];
            if (query.fromDate) {
                const fromDate = new Date(query.fromDate);
                filter.$or.push({ 'metadata.timestamp': { $exists: true, $gte: fromDate } });
                filter.$or.push({ createdAt: { $exists: true, $gte: fromDate }, 'metadata.timestamp': { $exists: false } });
            }
            if (query.toDate) {
                const toDate = new Date(query.toDate);
                toDate.setDate(toDate.getDate() + 1);
                const toDateFilter = { $lte: toDate };
                if (filter.$or.length > 0) {
                    filter.$or = filter.$or.map(condition => ({ ...condition, ...toDateFilter }));
                } else {
                    filter.$or.push({ 'metadata.timestamp': { $exists: true, ...toDateFilter } });
                    filter.$or.push({ createdAt: { $exists: true, ...toDateFilter }, 'metadata.timestamp': { $exists: false } });
                }
            }
            if (filter.$or.length > 1) {
                filter.$and = [ { $or: filter.$or } ];
                delete filter.$or;
            } else if (filter.$or.length === 1) {
                filter.$or = filter.$or[0];
            }
        }

        // Determine sort order, prioritizing metadata.timestamp if available
        sort['metadata.timestamp'] = -1;
        sort['createdAt'] = -1;

        // Handle pagination
        const limit = query.limit ? parseInt(query.limit) : 10;
        let skip = 0;

        if (query.page) {
            skip = (parseInt(query.page) - 1) * limit;
        } else if (query.skip) {
            skip = parseInt(query.skip);
        }

        // Log query for debugging
        console.log(`Reports query: ${JSON.stringify(query)}`);
        console.log(`MongoDB filter: ${JSON.stringify(filter)}, sort: ${JSON.stringify(sort)}, skip: ${skip}, limit: ${limit}`);

        // Execute queries
        const data = await this.reportModel
            .find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .exec();

        const total = await this.reportModel.countDocuments(filter);

        // Get summary if requested
        let summary = null;
        if (query.includeSummary === 'true') {
            summary = await this.getReportsSummary(query.clientAppId);
        }

        return {
            data,
            total,
            message: 'Reports fetched successfully',
            summary
        };
    }

    async findOne(id: string): Promise<Report> {
        return await this.reportModel.findById(id).exec();
    }

    async update(id: string, report: Partial<Report>): Promise<Report> {
        return await this.reportModel
            .findByIdAndUpdate(id, report, { new: true })
            .exec();
    }

    async updateStatus(id: string, status: string): Promise<Report> {
        return await this.reportModel
            .findByIdAndUpdate(id, { status }, { new: true })
            .exec();
    }

    async delete(id: string): Promise<Report> {
        return await this.reportModel.findByIdAndDelete(id).exec();
    }

    async getReportsSummary(clientAppId?: string): Promise<ReportsSummary> {
        const baseFilter = clientAppId ? { 'clientApp.id': clientAppId } : {};

        // Get counts by status
        const pendingCount = await this.reportModel.countDocuments({
            ...baseFilter,
            status: 'pending'
        });

        const inProgressCount = await this.reportModel.countDocuments({
            ...baseFilter,
            status: 'in_progress'
        });

        const resolvedCount = await this.reportModel.countDocuments({
            ...baseFilter,
            status: 'resolved'
        });

        const closedCount = await this.reportModel.countDocuments({
            ...baseFilter,
            status: 'closed'
        });

        const archivedCount = await this.reportModel.countDocuments({
            ...baseFilter,
            status: 'archived'
        });

        // Get counts by priority
        const highPriorityCount = await this.reportModel.countDocuments({
            ...baseFilter,
            priority: 'high'
        });

        const mediumPriorityCount = await this.reportModel.countDocuments({
            ...baseFilter,
            priority: 'medium'
        });

        const lowPriorityCount = await this.reportModel.countDocuments({
            ...baseFilter,
            priority: 'low'
        });

        // Get recent activity counts based on metadata.timestamp if it exists, otherwise fallback to createdAt
        const now = new Date();

        // Last 24 hours
        const last24Hours = new Date(now);
        last24Hours.setHours(now.getHours() - 24);

        const last24HoursCount = await this.reportModel.countDocuments({
            ...baseFilter,
            $or: [
                { 'metadata.timestamp': { $exists: true, $gte: last24Hours } },
                { createdAt: { $exists: true, $gte: last24Hours }, 'metadata.timestamp': { $exists: false } }
            ]
        });

        // Last week
        const lastWeek = new Date(now);
        lastWeek.setDate(now.getDate() - 7);

        const lastWeekCount = await this.reportModel.countDocuments({
            ...baseFilter,
            $or: [
                { 'metadata.timestamp': { $exists: true, $gte: lastWeek } },
                { createdAt: { $exists: true, $gte: lastWeek }, 'metadata.timestamp': { $exists: false } }
            ]
        });

        // Last month
        const lastMonth = new Date(now);
        lastMonth.setMonth(now.getMonth() - 1);

        const lastMonthCount = await this.reportModel.countDocuments({
            ...baseFilter,
            $or: [
                { 'metadata.timestamp': { $exists: true, $gte: lastMonth } },
                { createdAt: { $exists: true, $gte: lastMonth }, 'metadata.timestamp': { $exists: false } }
            ]
        });

        // Total count
        const totalCount = await this.reportModel.countDocuments(baseFilter);

        return {
            total: totalCount,
            byStatus: {
                pending: pendingCount,
                in_progress: inProgressCount,
                resolved: resolvedCount,
                closed: closedCount,
                archived: archivedCount
            },
            byPriority: {
                low: lowPriorityCount,
                medium: mediumPriorityCount,
                high: highPriorityCount
            },
            recentActivity: {
                last24Hours: last24HoursCount,
                lastWeek: lastWeekCount,
                lastMonth: lastMonthCount
            }
        };
    }

    // Method to get WP Reports data for client details page
    async getWPReportsForClient(clientId: string): Promise<any> {
        // First get the client to find associated client app IDs
        const client = await this.clientModel.findById(clientId).exec();
        if (!client || !client.clientAppIds || !client.clientAppIds.length) {
            return {
                activeForms: 0,
                secureReports: 0,
                lastReportDate: null,
                reportCounts: {
                    total: 0,
                    pending: 0,
                    resolved: 0
                }
            };
        }

        const clientAppIds = client.clientAppIds.map(id => id.toString());

        // Get all client apps by their IDs
        const clientApps = await this.clientAppModel.find({
            _id: { $in: clientAppIds }
        }).exec();

        // Count secure reports (those with files attached)
        const secureReports = await this.reportModel.countDocuments({
            'clientApp.id': { $in: clientAppIds },
            'content.files.0': { $exists: true }
        });

       // Get the most recent report by metadata timestamp, falling back to createdAt
        const latestReport = await this.reportModel.findOne({
            'clientApp.id': { $in: clientAppIds }
        }).sort({ 'metadata.timestamp': -1, 'createdAt': -1 }).limit(1).exec();

        const lastReportDate = latestReport?.metadata?.timestamp || latestReport?.createdAt || null;

        // Get total reports count
        const totalReports = await this.reportModel.countDocuments({
            'clientApp.id': { $in: clientAppIds }
        });

        // Get pending reports count
        const pendingReports = await this.reportModel.countDocuments({
            'clientApp.id': { $in: clientAppIds },
            status: 'pending'
        });

        // Get resolved reports count
        const resolvedReports = await this.reportModel.countDocuments({
            'clientApp.id': { $in: clientAppIds },
            status: 'resolved'
        });

        // Count active forms (based on unique domain entries)
        const domains = new Set<string>();
        for (const app of clientApps) {
            if (Array.isArray(app.domain)) {
                app.domain.forEach(d => domains.add(d));
            } else if (app.domain) {
                domains.add(app.domain);
            }
        }

        return {
            activeForms: domains.size || clientApps.length,
            secureReports,
            lastReportDate,
            reportCounts: {
                total: totalReports,
                pending: pendingReports,
                resolved: resolvedReports
            }
        };
    }


async getReportsSummaryByClientId(clientId: string): Promise<ReportsSummary> {
    // First get the client to find associated client app IDs
    const client = await this.clientModel.findById(clientId).exec();

    if (!client || !client.clientAppIds || client.clientAppIds.length === 0) {
        // Return empty summary if client doesn't exist or has no apps
        return {
            total: 0,
            byStatus: {
                pending: 0,
                in_progress: 0,
                resolved: 0,
                closed: 0,
                archived: 0
            },
            byPriority: {
                low: 0,
                medium: 0,
                high: 0
            },
            recentActivity: {
                last24Hours: 0,
                lastWeek: 0,
                lastMonth: 0
            }
        };
    }

    // Convert clientAppIds to strings for comparing
    const clientAppIds = client.clientAppIds.map(id => id.toString());

    // Create a filter to match reports for any of these client apps
    const baseFilter = { 'clientApp.id': { $in: clientAppIds } };

    // Get counts by status
    const pendingCount = await this.reportModel.countDocuments({
        ...baseFilter,
        status: 'pending'
    });

    const inProgressCount = await this.reportModel.countDocuments({
        ...baseFilter,
        status: 'in_progress'
    });

    const resolvedCount = await this.reportModel.countDocuments({
        ...baseFilter,
        status: 'resolved'
    });

    const closedCount = await this.reportModel.countDocuments({
        ...baseFilter,
        status: 'closed'
    });

    const archivedCount = await this.reportModel.countDocuments({
        ...baseFilter,
        status: 'archived'
    });

    // Get counts by priority
    const highPriorityCount = await this.reportModel.countDocuments({
        ...baseFilter,
        priority: 'high'
    });

    const mediumPriorityCount = await this.reportModel.countDocuments({
        ...baseFilter,
        priority: 'medium'
    });

    const lowPriorityCount = await this.reportModel.countDocuments({
        ...baseFilter,
        priority: 'low'
    });

    // Get recent activity counts based on metadata.timestamp if it exists, otherwise fallback to createdAt
    const now = new Date();

    // Last 24 hours
    const last24Hours = new Date(now);
    last24Hours.setHours(now.getHours() - 24);

    const last24HoursCount = await this.reportModel.countDocuments({
        ...baseFilter,
        $or: [
            { 'metadata.timestamp': { $exists: true, $gte: last24Hours } },
            { createdAt: { $exists: true, $gte: last24Hours }, 'metadata.timestamp': { $exists: false } }
        ]
    });

    // Last week
    const lastWeek = new Date(now);
    lastWeek.setDate(now.getDate() - 7);

    const lastWeekCount = await this.reportModel.countDocuments({
        ...baseFilter,
        $or: [
            { 'metadata.timestamp': { $exists: true, $gte: lastWeek } },
            { createdAt: { $exists: true, $gte: lastWeek }, 'metadata.timestamp': { $exists: false } }
        ]
    });

    // Last month
    const lastMonth = new Date(now);

    lastMonth.setMonth(now.getMonth() - 1);

    const lastMonthCount = await this.reportModel.countDocuments({
        ...baseFilter,
        $or: [
            { 'metadata.timestamp': { $exists: true, $gte: lastMonth } },
            { createdAt: { $exists: true, $gte: lastMonth }, 'metadata.timestamp': { $exists: false } }
        ]
    });

    // Total count
    const totalCount = await this.reportModel.countDocuments(baseFilter);

    return {
        total: totalCount,
        byStatus: {
            pending: pendingCount,
            in_progress: inProgressCount,
            resolved: resolvedCount,
            closed: closedCount,
            archived: archivedCount
        },
        byPriority: {
            low: lowPriorityCount,
            medium: mediumPriorityCount,
            high: highPriorityCount
        },
        recentActivity: {
            last24Hours: last24HoursCount,
            lastWeek: lastWeekCount,
            lastMonth: lastMonthCount
        }
    };
}
}