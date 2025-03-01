// src/interfaces/staff-user.interface.ts

import { User } from '../schemas/user.schema';
import { Business } from '../schemas/business.schema';
import {AppClient} from "../schemas/app-client.schema";

// In src/interfaces/staff-user.interface.ts
export interface StaffUserParams {
    page?: number;
    limit?: number;
    search?: string;
    sort?: string;
}

export interface StaffUserResponse {
    items: {
        user: User;
        businesses: Business[];
        appClients?: AppClient[]; // Add this line
    }[];
    total: number;
    pages: number;
}