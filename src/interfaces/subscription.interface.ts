// src/interfaces/subscription.interface.ts
import { Business, SubscriptionStatus } from '../schemas/business.schema';
import { StripeProduct } from '../schemas/stripe-product.schema';
import { StripePrice } from '../schemas/stripe-price.schema';

export interface Subscription {
    _id: string;
    clientId: string;
    businessId: string;
    stripeSubscriptionId: string;
    status: SubscriptionStatus;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    canceledAt?: string;
    cancelReason?: string;
    productId: string;
    priceId: string;
    quantity: number;
    amount: number;
    currency: string;
    interval: 'month' | 'year';
    trialStart?: string;
    trialEnd?: string;
    metadata?: Record<string, any>;
    createdAt: string;
    updatedAt: string;

    // Populated fields (optional)
    business?: Business;
    product?: StripeProduct;
    price?: StripePrice;
}

export interface SubscriptionMetrics {
    totalSubscriptions: number;
    activeSubscriptions: number;
    pastDueSubscriptions: number;
    canceledSubscriptions: number;
    trialingSubscriptions: number;
    averageMRR: number;
    totalMRR: number;
    trends: {
        subscriptions: { value: number; percentage: number; };
        mrr: { value: number; percentage: number; };
        churnRate: { value: number; percentage: number; };
    };
}

export interface SubscriptionParams {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    businessId?: string;
}

export interface SubscriptionsResponse {
    items: Subscription[];
    total: number;
    pages: number;
    page: number;
    limit: number;
    metrics: SubscriptionMetrics;
}

export interface SubscriptionUpdateRequest {
    priceId?: string;
    quantity?: number;
    metadata?: Record<string, any>;
}

export interface SubscriptionCancelRequest {
    cancelAtPeriodEnd?: boolean;
    reason?: string;
}

export interface SubscriptionCancelResponse {
    success: boolean;
    message: string;
    subscription: Subscription;
}
