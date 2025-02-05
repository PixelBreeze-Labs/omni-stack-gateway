export interface FeedbackStats {
    averageRating: number;
    totalFeedback: number;
    satisfactionScore: number;
    trending: number;
}

export interface FeedbackStatsResponse {
    message: string;
    data: FeedbackStats;
}