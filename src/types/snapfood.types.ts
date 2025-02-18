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