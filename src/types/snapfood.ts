// src/types/snapfood.ts
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