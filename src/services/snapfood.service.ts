import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import {
    CustomerListResponse,
    TotalOrdersResponse,
    OrderFrequencyResponse,
    OrderTimeAnalysisResponse,
    FavoriteDishesResponse,
    CuisinePreferencesResponse,
    OrderCustomizationsResponse,
    ReviewAndFeedbackResponse,
    InteractionWithPromotionsResponse,
    TotalSpendResponse,
    OrderListResponse,
    WalletCreditsResponse,
    WalletCustomersResponse,
    FeatureUsageResponse,
    SocialStatsResponse,
    TopVendorsResponse,
    TopCustomersResponse,
    OrdersBySourceResponse,
    OrdersByHoursResponse,
    RevenueDataResponse,
    OrderReportResponse,
    CustomerReportResponse,
    RecentOrdersResponse,
    CouponStats,
    DiscountStats,
    PromotionStats,
    CashbackStats,
    DateRangeChartData,
    AverageOrderValueResponse,
    CustomerGeneralStatsResponse,
    ExportProductsResponse,
    GeneralInfoResponse,
    BlogSendNotificationResponse,
    BlogNotificationReadResponse,
    BlogResponse,
    BlogCreateResponse,
    BlogToggleStatusResponse,
    BlogsResponse, BlogCategoriesResponse, BlogUpdateResponse, BlogDeleteResponse
} from '../types/snapfood.types';
import * as FormData from 'form-data'; // 👈 import
import {SupabaseService} from "./supabase.service";
import { Model } from 'mongoose';

import {User, RegistrationSource} from "../schemas/user.schema";
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class SnapfoodService {
    private readonly logger = new Logger(SnapfoodService.name);
    private readonly baseUrl: string;
    private readonly apiKey: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
        private readonly supabaseService: SupabaseService,
        @InjectModel(User.name) private userModel: Model<User>,

    ) {
        this.baseUrl = this.configService.get<string>('snapfood.baseUrl');
        this.apiKey = this.configService.get<string>('snapfood.apiKey');
    }

    async forward(endpoint: string, method: string, data?: any) {
        try {
            const response$ = this.httpService.request({
                method,
                url: `${this.baseUrl}/${endpoint}`,
                data,
                headers: {
                    'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey,
                    'Content-Type': 'application/json',
                },
                validateStatus: (status) => status < 500
            });

            const response = await lastValueFrom(response$);

            if (response.status >= 400) {
                this.logger.error(`${method} ${endpoint} failed:`, response.data);
                throw new HttpException(
                    response.data?.message || 'SnapFood Service Error',
                    response.status
                );
            }

            return response.data;
        } catch (error) {
            this.logger.error(`Forward request failed for ${method} ${endpoint}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'SnapFood Service Error',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async listCustomers(params: {
        page?: number;
        per_page?: number;
        search?: string;
        start_date?: string;
        end_date?: string;
    }): Promise<CustomerListResponse> {
        try {
            const response$ = this.httpService.get(`${this.baseUrl}/v3/omni-stack/customers`, {
                params: {
                    page: params.page || 1,
                    per_page: params.per_page || 10,
                    search: params.search,
                    start_date: params.start_date,
                    end_date: params.end_date
                },
                headers: {
                    'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey
                },
                validateStatus: (status) => status < 500
            });

            const response = await lastValueFrom(response$);

            if (response.status === 400) {
                this.logger.error('Bad request:', response.data);
                throw new HttpException(response.data.message || 'Bad request', HttpStatus.BAD_REQUEST);
            }

            if (response.status === 401) {
                this.logger.error('Unauthorized:', response.data);
                throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
            }

            return response.data;
        } catch (error) {
            this.logger.error('Failed to fetch customers:', error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to fetch customers',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    // Order History and Frequency
    async getTotalOrders(customerId: string, params?: { start_date?: string; end_date?: string }): Promise<TotalOrdersResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/customer/${customerId}/total-orders`,
                {
                    params,
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error(`Failed to fetch total orders for customer ${customerId}:`, error);
            throw new HttpException('Failed to fetch total orders', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getOrderFrequency(customerId: string, params?: { start_date?: string; end_date?: string }): Promise<OrderFrequencyResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/customer/${customerId}/order-frequency`,
                {
                    params,
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error(`Failed to fetch order frequency for customer ${customerId}:`, error);
            throw new HttpException('Failed to fetch order frequency', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getOrderTimeAnalysis(customerId: string, params?: { start_date?: string; end_date?: string }): Promise<OrderTimeAnalysisResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/customer/${customerId}/order-time-analysis`,
                {
                    params,
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error(`Failed to fetch order time analysis for customer ${customerId}:`, error);
            throw new HttpException('Failed to fetch order time analysis', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // Order Preferences
    async getFavoriteDishes(customerId: string, params?: { start_date?: string; end_date?: string }): Promise<FavoriteDishesResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/customer/${customerId}/favorite-dishes`,
                {
                    params,
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error(`Failed to fetch favorite dishes for customer ${customerId}:`, error);
            throw new HttpException('Failed to fetch favorite dishes', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getCuisinePreferences(customerId: string, params?: { start_date?: string; end_date?: string }): Promise<CuisinePreferencesResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/customer/${customerId}/cuisine-preferences`,
                {
                    params,
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error(`Failed to fetch cuisine preferences for customer ${customerId}:`, error);
            throw new HttpException('Failed to fetch cuisine preferences', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getOrderCustomizations(customerId: string, params?: { start_date?: string; end_date?: string }): Promise<OrderCustomizationsResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/customer/${customerId}/order-customizations`,
                {
                    params,
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error(`Failed to fetch order customizations for customer ${customerId}:`, error);
            throw new HttpException('Failed to fetch order customizations', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // Spending Behavior
    async getAverageOrderValue(customerId: string, params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<AverageOrderValueResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/customer/${customerId}/average-order-value`,
                {
                    params,
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error(`Failed to fetch average order value for customer ${customerId}:`, error);
            throw new HttpException('Failed to fetch average order value', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getTotalSpend(customerId: string, params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<TotalSpendResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/customer/${customerId}/total-spend`,
                {
                    params,
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error(`Failed to fetch total spend for customer ${customerId}:`, error);
            throw new HttpException('Failed to fetch total spend', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // Engagement Metrics
    async getInteractionWithPromotions(customerId: string, params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<InteractionWithPromotionsResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/customer/${customerId}/interaction-with-promotions`,
                {
                    params,
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error(`Failed to fetch promotion interactions for customer ${customerId}:`, error);
            throw new HttpException('Failed to fetch promotion interactions', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getReviewAndFeedback(customerId: string, params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<ReviewAndFeedbackResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/customer/${customerId}/review-and-feedback`,
                {
                    params,
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error(`Failed to fetch reviews and feedback for customer ${customerId}:`, error);
            throw new HttpException('Failed to fetch reviews and feedback', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getGeneralInfo(customerId: string, params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<GeneralInfoResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/customer/${customerId}/general-info`,
                {
                    params,
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );

            const response = await lastValueFrom(response$);

            if (response.status === 404) {
                throw new HttpException('Customer not found', HttpStatus.NOT_FOUND);
            }

            return response.data;
        } catch (error) {
            this.logger.error(`Failed to fetch general info for customer ${customerId}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to fetch general info',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async exportProducts(vendorId: string): Promise<ExportProductsResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/export-products`,
                {
                    params: { vendor_id: vendorId },
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    responseType: 'blob',
                    validateStatus: (status) => status < 500
                }
            );

            const response = await lastValueFrom(response$);

            if (response.status === 404) {
                throw new HttpException('Vendor not found', HttpStatus.NOT_FOUND);
            }

            return {
                data: response.data,
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': 'attachment; filename="products.csv"'
                }
            };
        } catch (error) {
            this.logger.error(`Failed to export products for vendor ${vendorId}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to export products',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async getCustomerGeneralStats(): Promise<CustomerGeneralStatsResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/customer-insights/general-report`,
                {
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );

            const response = await lastValueFrom(response$);

            return response.data;
        } catch (error) {
            this.logger.error('Failed to fetch customer general stats:', error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to fetch customer general stats',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async listUsersWithDevices(params: {
        page?: number;
        limit?: number;
        search?: string;
    }): Promise<any> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/list-users-with-devices`,
                {
                    params: {
                        page: params.page || 1,
                        limit: params.limit || 50,
                        search: params.search
                    },
                    headers: {
                        'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey
                    },
                    validateStatus: (status) => status < 500
                }
            );

            const response = await lastValueFrom(response$);

            if (response.status === 400) {
                this.logger.error('Bad request:', response.data);
                throw new HttpException(response.data.message || 'Bad request', HttpStatus.BAD_REQUEST);
            }

            if (response.status === 401) {
                this.logger.error('Unauthorized:', response.data);
                throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
            }

            return response.data;
        } catch (error) {
            this.logger.error('Failed to fetch users with devices:', error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to fetch users with devices',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }


    async updateUserExternalId(userId: number, omniStackUserId: string): Promise<any> {
        try {
            const response$ = this.httpService.post(
                `${this.baseUrl}/v3/omni-stack/update-user-external-id`,
                {
                    user_id: userId,
                    omnistack_user_id: omniStackUserId
                },
                {
                    headers: {
                        'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey,
                        'Content-Type': 'application/json'
                    },
                    validateStatus: (status) => status < 500
                }
            );

            const response = await lastValueFrom(response$);

            if (response.status === 400) {
                this.logger.error('Bad request:', response.data);
                throw new HttpException(response.data.message || 'Bad request', HttpStatus.BAD_REQUEST);
            }

            if (response.status === 401) {
                this.logger.error('Unauthorized:', response.data);
                throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
            }

            if (response.status === 404) {
                throw new HttpException('User not found', HttpStatus.NOT_FOUND);
            }

            return response.data;
        } catch (error) {
            this.logger.error(`Failed to update external ID for user ${userId}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to update user external ID',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
    // Orders
    async listOrders(params?: {
        page?: number;
        per_page?: number;
        start_date?: string;
        end_date?: string;
    }): Promise<OrderListResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/orders`,
                {
                    params: {
                        page: params?.page || 1,
                        per_page: params?.per_page || 15,
                        start_date: params?.start_date,
                        end_date: params?.end_date
                    },
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch orders:', error);
            throw new HttpException('Failed to fetch orders', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // Wallet Stats
    async getWalletCredits(params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<WalletCreditsResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/wallet/credits`,
                {
                    params,
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch wallet credits:', error);
            throw new HttpException('Failed to fetch wallet credits', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getWalletCustomers(params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<WalletCustomersResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/wallet/customers`,
                {
                    params,
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch wallet customers:', error);
            throw new HttpException('Failed to fetch wallet customers', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // Feature Usage Stats
    async getFeatureUsageStats(): Promise<FeatureUsageResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/feature-usage/stats`,
                {
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch feature usage stats:', error);
            throw new HttpException('Failed to fetch feature usage stats', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getSocialStats(): Promise<SocialStatsResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/social/general-report`,
                {
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch social stats:', error);
            throw new HttpException('Failed to fetch social stats', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getTopVendors(params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<TopVendorsResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/orders/topvendors`,
                {
                    params: this.getDefaultDateRange(params),
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch top vendors:', error);
            throw new HttpException('Failed to fetch top vendors', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getTopCustomers(params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<TopCustomersResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/orders/topcustomers`,
                {
                    params: this.getDefaultDateRange(params),
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch top customers:', error);
            throw new HttpException('Failed to fetch top customers', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getOrdersBySource(params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<OrdersBySourceResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/orders/get-by-source`,
                {
                    params: this.getDefaultDateRange(params),
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch orders by source:', error);
            throw new HttpException('Failed to fetch orders by source', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getOrdersByHours(params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<OrdersByHoursResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/orders/get-by-hours`,
                {
                    params: this.getDefaultDateRange(params),
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch orders by hours:', error);
            throw new HttpException('Failed to fetch orders by hours', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getRevenueData(params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<RevenueDataResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/orders/get-revenue`,
                {
                    params: this.getDefaultDateRange(params),
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch revenue data:', error);
            throw new HttpException('Failed to fetch revenue data', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getOrderReport(): Promise<OrderReportResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/orders/report`,
                {
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch order report:', error);
            throw new HttpException('Failed to fetch order report', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getCustomerReport(): Promise<CustomerReportResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/orders/customer-report`,
                {
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch customer report:', error);
            throw new HttpException('Failed to fetch customer report', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getRecentOrders(params?: {
        page?: number;
        per_page?: number;
        start_date?: string;
        end_date?: string;
    }): Promise<RecentOrdersResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/orders-recent-ten`,
                {
                    params: {
                        page: params?.page || 1,
                        per_page: params?.per_page || 10,
                        ...this.getDefaultDateRange(params)
                    },
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch recent orders:', error);
            throw new HttpException('Failed to fetch recent orders', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    private getDefaultDateRange(params?: { start_date?: string; end_date?: string }) {
        if (!params?.start_date) {
            const today = new Date();
            const lastMonth = new Date(today.setMonth(today.getMonth() - 1));
            return {
                start_date: lastMonth.toISOString().split('T')[0],
                end_date: new Date().toISOString().split('T')[0]
            };
        }
        return {
            start_date: params.start_date,
            end_date: params.end_date || new Date().toISOString().split('T')[0]
        };
    }

    // Coupon Statistics
    async getTotalCouponsAmount(params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<DateRangeChartData> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/coupons/totalAmount`,
                {
                    params: this.getDefaultDateRange(params),
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch total coupons amount:', error);
            throw new HttpException('Failed to fetch total coupons amount', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getTotalOrdersCoupons(params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<DateRangeChartData> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/coupons/totalOrders`,
                {
                    params: this.getDefaultDateRange(params),
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch total orders with coupons:', error);
            throw new HttpException('Failed to fetch total orders with coupons', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // Discount Statistics
    async getTotalDiscountsAmount(params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<DateRangeChartData> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/discounts/totalAmount`,
                {
                    params: this.getDefaultDateRange(params),
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch total discounts amount:', error);
            throw new HttpException('Failed to fetch total discounts amount', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getTotalOrdersDiscounts(params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<DateRangeChartData> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/discounts/totalOrders`,
                {
                    params: this.getDefaultDateRange(params),
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch total orders with discounts:', error);
            throw new HttpException('Failed to fetch total orders with discounts', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // Promotion Statistics
    async getTotalPromotionsAmount(params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<DateRangeChartData> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/promotions/totalAmount`,
                {
                    params: this.getDefaultDateRange(params),
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch total promotions amount:', error);
            throw new HttpException('Failed to fetch total promotions amount', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getTotalOrdersPromotions(params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<DateRangeChartData> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/promotions/totalOrders`,
                {
                    params: this.getDefaultDateRange(params),
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch total orders with promotions:', error);
            throw new HttpException('Failed to fetch total orders with promotions', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getActivePromotions(params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<PromotionStats['active_promotions']> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/promotions`,
                {
                    params: this.getDefaultDateRange(params),
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch active promotions:', error);
            throw new HttpException('Failed to fetch active promotions', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // Cashback Statistics
    async getTotalCashbackEarned(params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<DateRangeChartData> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/cashback/totalAmountEarned`,
                {
                    params: this.getDefaultDateRange(params),
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch total cashback earned:', error);
            throw new HttpException('Failed to fetch total cashback earned', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getTotalCashbackUsed(params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<DateRangeChartData> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/cashback/totalAmountUsed`,
                {
                    params: this.getDefaultDateRange(params),
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch total cashback used:', error);
            throw new HttpException('Failed to fetch total cashback used', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getMostUsedCashbackValues(params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<CashbackStats['most_used_values']> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/statistics/cashback/mostUsedValues`,
                {
                    params: this.getDefaultDateRange(params),
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch most used cashback values:', error);
            throw new HttpException('Failed to fetch most used cashback values', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // Add this to your SnapfoodService class
    async listVendors(params: {
        page?: number;
        per_page?: number;
        limit?: number;
    }): Promise<any> {
        try {
            const response$ = this.httpService.get(`${this.baseUrl}/v3/omni-stack/os-vendors`, {
                params: {
                    page: params.page || 1,
                    limit: params.limit || params.per_page || 100
                },
                headers: {
                    'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey
                },
                validateStatus: (status) => status < 500
            });

            const response = await lastValueFrom(response$);

            if (response.status === 400) {
                this.logger.error('Bad request:', response.data);
                throw new HttpException(response.data.message || 'Bad request', HttpStatus.BAD_REQUEST);
            }

            if (response.status === 401) {
                this.logger.error('Unauthorized:', response.data);
                throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
            }

            return response.data;
        } catch (error) {
            this.logger.error('Failed to fetch vendors:', error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to fetch vendors',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async listBlogCategories(): Promise<BlogCategoriesResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/os-blogs/categories`,
                {
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch blog categories:', error);
            throw new HttpException(
                'Failed to fetch blog categories',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async listBlogs(params?: {
        page?: number;
        per_page?: number;
        category_id?: number;
        title?: string;
        active?: boolean;
    }): Promise<BlogsResponse> {
        try {
            // Create a new params object to manipulate
            const queryParams: any = {
                page: params?.page || 1,
                per_page: params?.per_page || 10,
                title: params?.title
            };

            // Only add active if it's explicitly set (omit it to get all blogs)
            if (params?.active !== undefined) {
                // Convert to string because the API expects a string value
                queryParams.active = params.active ? 1 : 0;
            }

            // Only add category_id if it's a valid integer
            if (params?.category_id !== undefined && Number.isInteger(params.category_id)) {
                queryParams.category_id = params.category_id;
            }

            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/os-blogs`,
                {
                    params: queryParams,
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch blogs:', error);
            throw new HttpException(
                'Failed to fetch blogs',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async getBlog(id: string): Promise<BlogResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/v3/omni-stack/os-blogs/${id}`,
                {
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );

            const response = await lastValueFrom(response$);

            if (response.status === 404) {
                throw new HttpException('Blog not found', HttpStatus.NOT_FOUND);
            }

            return response.data;
        } catch (error) {
            this.logger.error(`Failed to fetch blog with ID ${id}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to fetch blog',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async createBlog(data: any): Promise<BlogCreateResponse> {
        try {
            const form = new FormData();

            // Append all text fields
            for (const key in data) {
                if (key === 'image_cover') continue; // handle separately
                if (Array.isArray(data[key])) {
                    // Laravel expects multiple values with same key for arrays
                    data[key].forEach((val: any) => form.append(`${key}[]`, val));
                } else {
                    form.append(key, data[key]);
                }
            }

            // Append image file
            if (data.image_cover?.buffer && data.image_cover?.originalname) {
                form.append('image_cover', data.image_cover.buffer, {
                    filename: data.image_cover.originalname,
                    contentType: data.image_cover.mimetype
                });
            }

            const headers = {
                ...form.getHeaders(),
                'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey,
            };

            const response$ = this.httpService.post(
                `${this.baseUrl}/v3/omni-stack/os-blogs`,
                form,
                { headers, validateStatus: (status) => status < 500 }
            );

            const response = await lastValueFrom(response$);

            if (response.status === 422) {
                throw new HttpException(
                    { message: 'Validation error', errors: response.data.errors },
                    HttpStatus.UNPROCESSABLE_ENTITY
                );
            }

            return response.data;
        } catch (error) {
            this.logger.error('Failed to create blog:', error);
            if (error instanceof HttpException) throw error;
            throw new HttpException('Failed to create blog', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async updateBlog(id: string, data: FormData): Promise<BlogUpdateResponse> {
        try {
            const headers = {
                ...data.getHeaders(),
                'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey,
            };

            const response$ = this.httpService.post(
                `${this.baseUrl}/v3/omni-stack/os-blogs/${id}`,
                data,
                { headers, validateStatus: (status) => status < 500 }
            );

            const response = await lastValueFrom(response$);

            if (response.status === 404) {
                throw new HttpException('Blog not found', HttpStatus.NOT_FOUND);
            }

            if (response.status === 422) {
                throw new HttpException(
                    { message: 'Validation error', errors: response.data.errors },
                    HttpStatus.UNPROCESSABLE_ENTITY
                );
            }

            return response.data;
        } catch (error) {
            this.logger.error(`Failed to update blog with ID ${id}:`, error);
            throw error instanceof HttpException
                ? error
                : new HttpException('Failed to update blog', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }


    async deleteBlog(id: string): Promise<BlogDeleteResponse> {
        try {
            const response$ = this.httpService.delete(
                `${this.baseUrl}/v3/omni-stack/os-blogs/${id}`,
                {
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );

            const response = await lastValueFrom(response$);

            if (response.status === 404) {
                throw new HttpException('Blog not found', HttpStatus.NOT_FOUND);
            }

            return response.data;
        } catch (error) {
            this.logger.error(`Failed to delete blog with ID ${id}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to delete blog',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async toggleBlogStatus(id: string): Promise<BlogToggleStatusResponse> {
        try {
            const response$ = this.httpService.put(
                `${this.baseUrl}/v3/omni-stack/os-blogs/${id}/toggle-status`,
                {},
                {
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );

            const response = await lastValueFrom(response$);

            if (response.status === 404) {
                throw new HttpException('Blog not found', HttpStatus.NOT_FOUND);
            }

            return response.data;
        } catch (error) {
            this.logger.error(`Failed to toggle status for blog with ID ${id}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to toggle blog status',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async incrementNotificationReadCount(id: string): Promise<BlogNotificationReadResponse> {
        try {
            const response$ = this.httpService.put(
                `${this.baseUrl}/v3/omni-stack/os-blogs/${id}/notification-read`,
                {},
                {
                    headers: { 'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey },
                    validateStatus: (status) => status < 500
                }
            );

            const response = await lastValueFrom(response$);

            if (response.status === 404) {
                throw new HttpException('Blog not found', HttpStatus.NOT_FOUND);
            }

            return response.data;
        } catch (error) {
            this.logger.error(`Failed to increment notification read count for blog with ID ${id}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to increment notification read count',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async sendBlogNotification(
        id: string,
        data: {
            notification_title: string;
            notification_title_en: string;
            target_user_id?: number;
        }
    ): Promise<BlogSendNotificationResponse> {
        try {
            const response$ = this.httpService.post(
                `${this.baseUrl}/v3/omni-stack/os-blogs/${id}/send-notification`,
                data,
                {
                    headers: {
                        'SF-API-OMNI-STACK-GATEWAY-API-KEY': this.apiKey,
                        'Content-Type': 'application/json'
                    },
                    validateStatus: (status) => status < 500
                }
            );

            const response = await lastValueFrom(response$);

            if (response.status === 404) {
                throw new HttpException('Blog not found or no devices available', HttpStatus.NOT_FOUND);
            }

            if (response.status === 422) {
                throw new HttpException(
                    { message: 'Validation error', errors: response.data.errors },
                    HttpStatus.UNPROCESSABLE_ENTITY
                );
            }

            return response.data;
        } catch (error) {
            this.logger.error(`Failed to send notification for blog with ID ${id}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to send blog notification',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }


    /**
     * Upload a blog image to Supabase storage and return the URL
     * @param file Image file buffer
     * @param filename Original filename
     * @returns Object containing the public URL of the uploaded image
     */
    async uploadBlogImage(file: Buffer, filename: string): Promise<{ success: boolean; url: string }> {
        try {
            this.logger.log(`Uploading blog image: ${filename}`);

            // Use the supabase service to upload the image
            const publicUrl = await this.supabaseService.uploadBlogImage(file, filename);

            this.logger.log(`Successfully uploaded blog image: ${publicUrl}`);

            return {
                success: true,
                url: publicUrl
            };
        } catch (error) {
            this.logger.error(`Failed to upload blog image ${filename}:`, error);
            throw new HttpException(
                'Failed to upload blog image',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Create or update a user from Snapfood
     * @param data User data from Snapfood
     * @returns The created/updated user
     */
    async syncSnapfoodUser(data: {
        snapfoodUserId: number;
        email: string;
        fullName: string;
        phone?: string;
        verified: boolean;
        providerId?: number; // 2=Facebook, 4=Google, 5=Apple
    }): Promise<User> {
        try {
            this.logger.log(`Syncing Snapfood user with ID: ${data.snapfoodUserId}`);

            // Check if user already exists by snapfoodUserId
            let user = await this.userModel.findOne({
                'external_ids.snapFoodId': data.snapfoodUserId
            });

            // Parse fullName into first and last name
            const nameParts = data.fullName.split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';

            // Determine registration provider based on providerId
            let providerName = '';
            switch (data.providerId) {
                case 2:
                    providerName = 'Facebook';
                    break;
                case 4:
                    providerName = 'Google';
                    break;
                case 5:
                    providerName = 'Apple';
                    break;
                default:
                    providerName = 'Email/Password';
            }

            if (user) {
                // Update existing user
                this.logger.log(`Updating existing user with Snapfood ID: ${data.snapfoodUserId}`);

                user.name = firstName;
                user.surname = lastName;
                user.email = data.email;

                // Only update phone if provided and user doesn't already have a phone
                if (data.phone && (!user.metadata.get('phone') || !user.metadata.get('verified'))) {
                    user.metadata.set('phone', data.phone);
                    user.metadata.set('verified', data.verified.toString());
                }

                // Update metadata with provider info if not already set
                if (!user.metadata.get('registrationProvider')) {
                    user.metadata.set('registrationProvider', providerName);
                }

                await user.save();
                return user;
            } else {
                // Create new user
                this.logger.log(`Creating new user for Snapfood ID: ${data.snapfoodUserId}`);

                const newUser = new this.userModel({
                    name: firstName,
                    surname: lastName,
                    email: data.email,
                    registrationSource: RegistrationSource.SNAPFOOD,
                    external_ids: {
                        snapFoodId: data.snapfoodUserId
                    },
                    metadata: new Map([
                        ['registrationProvider', providerName],
                        ['verified', data.verified.toString()]
                    ]),
                    isActive: true
                });

                // Add phone if provided
                if (data.phone) {
                    newUser.metadata.set('phone', data.phone);
                }

                await newUser.save();
                return newUser;
            }
        } catch (error) {
            this.logger.error(`Failed to sync Snapfood user: ${error.message}`, error.stack);
            throw error;
        }
    }
}