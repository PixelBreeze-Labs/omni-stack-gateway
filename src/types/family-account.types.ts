// types/family-account.types.ts
import { Document, Types } from 'mongoose';
import {BenefitUsageResponse} from "./benefit.interface";

export type FamilyAccountStatus = 'ACTIVE' | 'INACTIVE';
export type MemberStatus = 'ACTIVE' | 'INACTIVE';
export type ActivityType = 'ORDER' | 'BENEFIT_USED' | 'MEMBER_ADDED' | 'MEMBER_REMOVED';

export interface ActivityResponse {
    type: ActivityType;
    description: string;
    date: Date;
    amount?: number;
}

export interface PopulatedCustomer {
    _id: Types.ObjectId;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string;
    status: string;
}

export interface FamilyMemberPopulated {
    customerId: PopulatedCustomer;
    relationship: string;
    status: MemberStatus;
    joinDate: Date;
    _id?: Types.ObjectId;
}

export interface BenefitUsage {
    name: string;
    usageCount: number;
    savings: number;
}

interface PopulatedMember {
    _id: Types.ObjectId;
    customerId: PopulatedCustomer;
    relationship: string;
    status: string;
    joinDate: Date;
}


interface PopulatedFamilyAccount {
    _id: Types.ObjectId;
    mainCustomerId: PopulatedCustomer;
    members: PopulatedMember[];
    status: string;
    lastActivity: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface Activity {
    type: ActivityType;
    description: string;
    date: Date;
    amount?: number;
}

export interface FamilyStats {
    totalSpent: number;
    memberCount: number;
    joinedDate: Date;
    benefitsUsage: BenefitUsageResponse[];
    recentActivities: ActivityResponse[];
    lastActivity?: Date;
}

export interface FamilyAccountPopulated extends Document {
    clientId: Types.ObjectId;
    mainCustomerId: PopulatedCustomer;
    members: FamilyMemberPopulated[];
    sharedBenefits: Types.ObjectId[];
    status: FamilyAccountStatus;
    lastActivity: Date;
    totalSpent: number;
    createdAt: Date;
    updatedAt: Date;
}