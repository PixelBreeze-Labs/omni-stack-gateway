// src/types/guest.types.ts
import { RegistrationSource } from "../schemas/user.schema";

export interface GuestResponse {
    _id: string;
    name: string;
    email: string;
    phone: string;
    isActive: boolean;
    userId: string | null;
    clientIds: string[];
    external_ids: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
    // User-related data that might be populated
    source?: string;
    points?: number;
    totalSpend?: number;
    membershipTier?: string;
    walletBalance?: number;
}

export interface GuestMetrics {
    totalGuests: number;
    activeGuests: number;
    guestGrowth: number;
    trends: {
        guests: { value: number; percentage: number };
        active: { value: number; percentage: number };
    }
}

export interface GuestListResponse {
    items: GuestResponse[];
    total: number;
    pages: number;
    page: number;
    limit: number;
    includedClientIds: string[];
    metrics: GuestMetrics;
}