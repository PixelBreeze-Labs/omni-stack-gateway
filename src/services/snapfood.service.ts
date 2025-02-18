import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { CustomerListResponse } from '../types/snapfood';

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
}