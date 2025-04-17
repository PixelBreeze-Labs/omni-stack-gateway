// src/interfaces/report.interface.ts

export interface FileAttachment {
    name: string;
    type: string;
    url?: string;
    content?: string; // Base64 encoded content from client
    size?: number;
}

export enum ReportStatus {
    PENDING = 'pending',
    IN_PROGRESS = 'in_progress',
    RESOLVED = 'resolved',
    CLOSED = 'closed',
    ARCHIVED = 'archived'
}

export interface Report {
    id: string;
    clientApp: {
        id: string;
        type: string;
        domain: string;
        version: string;
    };
    content: {
        message: string;
        name?: string;
        files?: FileAttachment[];
    };
    metadata: {
        timestamp: Date;
        ipHash: string;
        userAgent: string;
    };
    status: ReportStatus;
    createdAt: Date;
}

export interface ReportsSummary {
    total: number;
    byStatus: {
        pending: number;
        in_progress: number;
        resolved: number;
        closed: number;
        archived: number;
    };
    byPriority?: {
        low: number;
        medium: number;
        high: number;
    };
    recentActivity: {
        last24Hours: number;
        lastWeek: number;
        lastMonth: number;
    };
}

export interface ReportsResponse {
    data: Report[];
    total: number;
    message: string;
    summary?: ReportsSummary;
}

export interface ReportParams {
    page?: number;
    limit?: number;
    clientAppId?: string;
    status?: ReportStatus;
    search?: string;
    fromDate?: string;
    toDate?: string;
    priority?: string;
    skip?: number;
}