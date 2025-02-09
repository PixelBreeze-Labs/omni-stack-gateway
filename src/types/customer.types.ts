// src/types/customer.types.ts

export type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';
export type CustomerType = 'REGULAR' | 'VIP';
export type FilterStatus = 'ACTIVE' | 'INACTIVE' | 'ALL';
export type FilterType = 'REGULAR' | 'VIP' | 'ALL';
export type RegistrationSource = 'manual' | 'metroshop' | 'metrosuites' | 'bookmaster' | 'trackmaster' | 'other';

export interface CustomerResponse {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    status: CustomerStatus;
    type: CustomerType;
    avatar?: string;
    clientIds: string[];
    isActive: boolean;
    external_ids: Record<string, any>;
    addressId?: string;
    metadata?: Record<string, any>;
    // User-related fields
    source: RegistrationSource;
    userId?: string;
    points: number;
    totalSpend: number;
    membershipTier: string;
    walletBalance: number;
    registrationDate: Date;
    lastActive: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface CustomerListResponse {
    items: CustomerResponse[];
    total: number;
    pages: number;
    page: number;
    limit: number;
    includedClientIds?: string[];
}