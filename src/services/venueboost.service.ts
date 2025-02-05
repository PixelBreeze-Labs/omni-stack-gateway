// src/services/venueboost.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class VenueBoostService {
    private readonly logger = new Logger(VenueBoostService.name);
    private readonly baseUrl: string;
    private readonly bbVenueCode: string;
    private readonly apiKey: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.baseUrl = this.configService.get<string>('venueboost.baseUrl');
        this.bbVenueCode = this.configService.get<string>('venueboost.bbVenueCode');
        this.apiKey = this.configService.get<string>('venueboost.apiKey');
    }

    async listMembers(params: {
        page?: number;
        per_page?: number;
        registration_source?: 'from_my_club' | 'landing_page';
    }) {
        try {
            const response$ = this.httpService.get(`${this.baseUrl}/members-os`, {
                params: {
                    venue_short_code: this.bbVenueCode,
                    page: params.page || 1,
                    per_page: params.per_page || 15,
                    registration_source: params.registration_source
                },
                headers: {
                    'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey
                },
                validateStatus: (status) => status < 500
            });

            const response = await lastValueFrom(response$);


            if (response.status === 400) {
                this.logger.error('Bad request:', response.data);
                throw new Error(response.data.message || 'Bad request');
            }

            if (!response.data) {
                throw new Error('No data received from API');
            }

            return {
                data: response.data.data,
                current_page: response.data.current_page,
                last_page: response.data.last_page,
                per_page: response.data.per_page,
                total: response.data.total
            };

        } catch (error) {
            this.logger.error('Failed to fetch members from VenueBoost', error);
            throw error;
        }
    }
}