// src/interfaces/report.interface.ts

export interface FileAttachment {
    name: string;
    type: string;
    url?: string;
    content?: string; // Base64 encoded content from client
    size?: number;
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
    status: 'pending' | 'reviewed' | 'archived';
}
