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