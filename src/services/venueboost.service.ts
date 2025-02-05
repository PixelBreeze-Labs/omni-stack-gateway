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
        search?: string;
        status?: string;
    }) {
        try {
            const response$ = this.httpService.get(`${this.baseUrl}/members-os`, {
                params: {
                    venue_short_code: this.bbVenueCode,
                    page: params.page || 1,
                    per_page: params.per_page || 15,
                    registration_source: params.registration_source,
                    search: params.search,
                    status: params.status
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

            return response.data;
        } catch (error) {
            this.logger.error('Failed to fetch members:', error);
            throw error;
        }
    }

    async acceptMember(memberId: number) {
        try {
            const response$ = this.httpService.post(`${this.baseUrl}/members-os/${memberId}/approve`, {
                venue_short_code: this.bbVenueCode
            }, {
                headers: {
                    'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey
                }
            });
            const response = await lastValueFrom(response$);
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to approve member ${memberId}:`, error);
            throw error;
        }
    }

    async rejectMember(memberId: number, reason?: string) {
        try {
            const response$ = this.httpService.post(`${this.baseUrl}/members-os/${memberId}/reject`, {
                venue_short_code: this.bbVenueCode,
                rejection_reason: reason
            }, {
                headers: {
                    'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey
                }
            });
            const response = await lastValueFrom(response$);
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to reject member ${memberId}:`, error);
            throw error;
        }
    }

    async exportMembers(registrationSource?: 'from_my_club' | 'landing_page') {
        try {
            const response$ = this.httpService.get(`${this.baseUrl}/members-os/export`, {
                params: {
                    venue_short_code: this.bbVenueCode,
                    registration_source: registrationSource
                },
                headers: {
                    'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey
                },
                responseType: 'blob'
            });
            const response = await lastValueFrom(response$);
            return response.data;
        } catch (error) {
            this.logger.error('Failed to export members:', error);
            throw error;
        }
    }
}