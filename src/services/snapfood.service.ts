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
    AverageOrderValueResponse
} from '../types/snapfood';
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
}