// src/interfaces/magic-link.interface.ts
export interface MagicLinkResponse {
    status: 'success' | 'expired' | 'used' | 'invalid';
    message: string;
    userId?: string;
    businessId?: string;
    clientId?: string;
    employeeId?: string;
    appClientId?: string;
    role?: string;
    auth_response?: any;
    has_changed_password?: boolean;
    sidebarLinks?: any[];
    features?: string[];
    featureLimits?: Record<string, any>;
    customFeatures?: string[];
    customLimits?: Record<string, any>;
    subscription?: {
        status: string;
        endDate?: Date;
        tier?: string;
        details?: any;
    };
    business?: {
        name?: string;
        email?: string;
        type?: string;
        subscriptionStatus?: string;
        subscriptionEndDate?: Date;
    };
    employee?: {
        id?: any;
        name?: string;
        email?: string;
        external_ids?: any;
    };
    client?: {
        id?: any;
        name?: string;
        type?: string;
        email?: string;
        contact_person?: string;
        external_ids?: any;
    };
}