// src/interfaces/magic-link.interface.ts
export interface MagicLinkResponse {
    status: 'success' | 'expired' | 'used' | 'invalid';
    message: string;
    userId?: string;
    businessId?: string;
    auth_response?: any;
    has_changed_password?: boolean;
}