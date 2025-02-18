// src/types/snapfood.types.ts

export interface CustomerListResponse {
    customers: {
        current_page: number;
        data: any[];
        first_page_url: string;
        from: number | null;
        last_page: number;
        last_page_url: string;
        next_page_url: string | null;
        path: string;
        per_page: number;
        prev_page_url: string | null;
        to: number | null;
        total: number;
    };
    new_today: number;
    deleted_today: number;
}

export interface TotalOrdersResponse {
    total_orders: number;
}

export interface OrderFrequencyResponse {
    [date: string]: number;
}

export interface OrderTimeAnalysisResponse {
    hours_frequency: { [hour: string]: number };
    days_frequency: { [day: string]: number };
}

export interface FavoriteDishesResponse {
    [dish: string]: number;
}

export interface CuisinePreferencesResponse {
    [cuisine: string]: number;
}

export interface OrderCustomizationsResponse {
    product_options: { [option: string]: number };
    item_instructions: { [instruction: string]: number };
    order_notes: { [note: string]: number };
}

export interface AverageOrderValueResponse {
    average_order_value: string; // Format: "1.234,56 Lek"
}

export interface TotalSpendResponse {
    total_spend: string; // Format: "1.234,56 Lek"
}

export interface InteractionWithPromotionsResponse {
    coupons: Array<{
        code: string;
        used: number;
    }>;
    discounts: Array<{
        name: string;
        used: number;
    }>;
}

export interface ReviewAndFeedbackResponse {
    product_review_avg: number;
    vendor_review_avg: number;
    rider_review_avg: number;
}

export interface GeneralInfoResponse {
    order_history_frequency: {
        total_orders_score: number;
        order_frequency_score: number;
        order_time_analysis_score: number;
    };
    order_preferences: {
        favorite_dishes_score: number;
        cuisine_preferences_score: number;
        order_customizations_score: number;
    };
    spending_behavior: {
        average_order_value_score: number;
        total_spend_score: number;
    };
    engagement_metrics: {
        interaction_with_promotions_score: number;
        review_and_feedback_score: number;
    };
    customer_info: {
        full_name: string;
        birthdate: string | null;
        sex: string | null;
        first_order: string | null;
        last_order: string | null;
        registered_at: string;
        phone: string;
        email: string;
        source: string;
        cashback_amount: number;
        cashback_level: {
            name: string;
        } | null;
    };
    recent_orders: Array<{
        'Order No.': string;
        'Name': string;
        'Total Price': number;
        'Date & Time': string;
        'Total Tax': number;
        'Tax %': number;
        'Payment': string | null;
        'Status': string;
        'Currency': string;
    }>;
}

export interface CustomerGeneralStatsResponse {
    customers: {
        new: number;
        lost: number;
        ordered: number;
        not_ordered: number;
    };
    customers_by_source: {
        web: number;
        ios: number;
        android: number;
    };
    installs: {
        installs: number;
        uninstalls: number;
    };
    registrations: {
        registrations: number;
        deleted: number;
    };
}

export interface ExportProductsResponse {
    data: Blob;
    headers: {
        'Content-Type': string;
        'Content-Disposition': string;
    };
}


export interface OrderListResponse {
    data: Array<{
        ID: number;
        'Order Nr': string;
        'Ordered Date': string;
        'Total Price': number;
        'Total Tax': number;
        Vendor: string | null;
        Customer: string | null;
        Status: string;
        Source: string;
    }>;
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    statistics: {
        total_orders: number;
        total_revenue: number;
        total_tax: number;
        total_customers: number;
        average_order_value: number;
        total_delivered_orders: number;
        total_declined_orders: number;
        currency: string;
    };
}

export interface WalletCreditsResponse {
    total_transfers: number;
    total_deposit: number;
    total_referral: number;
    total_earnorder: number;
    total_bonus: number;
    total_from_cashback: number;
    outgoing_credits: {
        total: number;
        order_payments: {
            amount: number;
            percentage: number;
        };
        transfers: {
            amount: number;
            percentage: number;
        };
    };
}

export interface WalletCustomersResponse {
    total_customers_has_wallet: number;
    total_customers_has_wallet_never_used: number;
    total_customer_has_wallet_used: number;
    total_customer_recent_wallet_used: number;
}

export interface FeatureUsageResponse {
    name: string;
    click: number;
    usage: number;
}[]

export interface SocialStatsResponse {
    mapInteractions: number;
    friendRequests: {
        profile_visits: number;
        sent: number;
        rejected: number;
        friendship_form: number;
    };
    newChats: {
        singleChat: number;
        groupChat: number;
    };
    messageVolumes: {
        'Single Chat Messages': number;
        'Group Chat Messages': number;
    };
    snapStories: {
        created: number;
        total_view: number;
        total_replies: number;
        notifications_sent: number;
    };
    snapStoriesList: any[];
}

export interface TopVendorsResponse {
    [key: string]: {
        vendor_name: string;
        order_count: number;
        total_revenue: number;
    };
}

export interface TopCustomersResponse {
    [key: string]: {
        customer_name: string;
        order_count: number;
        total_spent: number;
    };
}

export interface OrdersBySourceResponse {
    web: number;
    ios: number;
    android: number;
}

export interface OrdersByHoursResponse {
    [hour: string]: {
        count: number;
        revenue: number;
    };
}

export interface RevenueDataResponse {
    [date: string]: {
        revenue: number;
        orders: number;
    };
}

export interface OrderReportResponse {
    delivered_orders: number;
    declined_orders: number;
}

export interface CustomerReportResponse {
    new_customers: number;
    repeat_customers: number;
}

export interface RecentOrdersResponse {
    data: Array<{
        ID: number;
        'Order Nr': string;
        'Ordered Date': string;
        'Total Price': number;
        'Total Tax': number;
        Vendor: string | null;
        Customer: string | null;
        Status: string;
        Source: string;
    }>;
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    statistics: {
        total_orders: number;
        total_revenue: number;
        total_tax: number;
        total_customers: number;
        average_order_value: number;
        total_delivered_orders: number;
        total_declined_orders: number;
        currency: string;
    };
}

export interface CouponStats {
    total_amount: number;
    total_orders: number;
}

export interface DiscountStats {
    total_amount: number;
    total_orders: number;
}

export interface PromotionStats {
    total_amount: number;
    total_orders: number;
    active_promotions: Array<{
        name: string;
        usage_count: number;
        total_amount: number;
    }>;
}

export interface CashbackStats {
    total_amount_earned: number;
    total_amount_used: number;
    most_used_values: Array<{
        value: number;
        count: number;
        percentage: number;
    }>;
}

export interface DateRangeChartData {
    labels: string[];
    data: number[];
    total: number;
}