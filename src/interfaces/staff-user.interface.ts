// src/interfaces/staff-user.interface.ts

import { User } from '../schemas/user.schema';
import { Business } from '../schemas/business.schema';

export interface StaffUserParams {
    page?: number;
    limit?: number;
    search?: string;
    sort?: string;
    type?: string;
}

export interface StaffUserResponse {
    items: Array<{
        user: User;
        businesses: Business[];
    }>;
    total: number;
    pages: number;
}