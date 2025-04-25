// src/types/ai-assistant.types.ts

export enum AIAssistantType {
    CUSTOMER = 'customer',
    SOCIAL = 'social',
    FOOD = 'food',
    SALES = 'sales',
    ANALYTICS = 'analytics',
    ADMIN = 'admin',
    PRODUCT = 'product',
    MARKETING = 'marketing'
}

export interface AIQueryContext {
    assistantType: AIAssistantType;
    startDate?: string;
    endDate?: string;
    customerId?: string;
    vendorId?: string;
    searchTerm?: string;
    productId?: string;
    categoryId?: string;
}

export interface AIQueryResponse {
    answer: string;
    data: any;
    suggestions?: string[];
    relatedQueries?: string[];
}