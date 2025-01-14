// src/interfaces/report.interface.ts
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
    };
    metadata: {
        timestamp: Date;
        ipHash: string;
        userAgent: string;
    };
    status: 'pending' | 'reviewed' | 'archived';
}
