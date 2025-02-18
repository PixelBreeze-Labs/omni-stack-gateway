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
    AverageOrderValueResponse, CustomerGeneralStatsResponse, ExportProductsResponse, GeneralInfoResponse
} from '../types/snapfood.types';
@Injectable()
export class SnapfoodService {
    private readonly logger = new Logger(SnapfoodService.name);
    private readonly baseUrl: string;
    private readonly apiKey: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
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

    // Orders
    async listOrders(params?: {
        page?: number;
        per_page?: number;
        start_date?: string;
        end_date?: string;
    }): Promise<OrderListResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/api/v3/omni-stack/orders`,
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
                `${this.baseUrl}/api/v3/omni-stack/statistics/wallet/credits`,
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
                `${this.baseUrl}/api/v3/omni-stack/statistics/wallet/customers`,
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
                `${this.baseUrl}/api/v3/omni-stack/statistics/feature-usage/stats`,
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

    // Social Dashboard Stats
    async getSocialStats(): Promise<SocialStatsResponse> {
        try {
            const response$ = this.httpService.get(
                `${this.baseUrl}/api/v3/omni-stack/statistics/social/general-report`,
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
}