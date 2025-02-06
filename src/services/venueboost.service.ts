// src/services/venueboost.service.ts
import {BadRequestException, Injectable, Logger, NotFoundException} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {Client} from "../schemas/client.schema";
import {Store} from "../schemas/store.schema";

@Injectable()
export class VenueBoostService {
    private readonly logger = new Logger(VenueBoostService.name);
    private readonly baseUrl: string;
    private readonly bbVenueCode: string;
    private readonly apiKey: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        @InjectModel(Store.name) private storeModel: Model<Store>
    ) {
        this.baseUrl = this.configService.get<string>('venueboost.baseUrl');
        this.bbVenueCode = this.configService.get<string>('venueboost.bbVenueCode');
        this.apiKey = this.configService.get<string>('venueboost.apiKey');
    }

    private async getVenueShortCode(clientId: string): Promise<string> {
        const client = await this.clientModel.findById(clientId);
        if (!client?.venueBoostConnection?.venueShortCode) {
            throw new BadRequestException('Client not connected to VenueBoost');
        }
        return client.venueBoostConnection.venueShortCode;
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
        console.log(1,memberId);
        try {
            const response$ = this.httpService.post(`${this.baseUrl}/members-os/accept`, {
                member_id: memberId
            }, {
                params: {
                    venue_short_code: this.bbVenueCode
                },
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
            const response$ = this.httpService.post(`${this.baseUrl}/members-os/reject`, {
                member_id: memberId,
                rejection_reason: 'rejected from trackmastre'
            }, {
                params: {
                    venue_short_code: this.bbVenueCode
                },
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

    // --- Feedback functions ---

    async listFeedback(params?: { page?: number; per_page?: number; search?: string }) {
        try {
            const response$ = this.httpService.get(`${this.baseUrl}/feedback-os`, {
                params: {
                    venue_short_code: this.bbVenueCode,
                    page: params?.page || 1,
                    per_page: params?.per_page || 15,
                    search: params?.search,
                },
                headers: {
                    'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey,
                },
                validateStatus: (status) => status < 500,
            });
            const response = await lastValueFrom(response$);
            if (response.status === 400) {
                this.logger.error('Bad request:', response.data);
                throw new Error(response.data.message || 'Bad request');
            }
            return response.data;
        } catch (error) {
            this.logger.error('Failed to fetch feedback:', error);
            throw error;
        }
    }

    async getFeedbackById(id: number) {
        try {
            const response$ = this.httpService.get(`${this.baseUrl}/feedback-os/${id}`, {
                params: {
                    venue_short_code: this.bbVenueCode,
                },
                headers: {
                    'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey,
                },
                validateStatus: (status) => status < 500,
            });
            const response = await lastValueFrom(response$);
            if (response.status === 400) {
                this.logger.error('Bad request:', response.data);
                throw new Error(response.data.message || 'Bad request');
            }
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to fetch feedback with id ${id}:`, error);
            throw error;
        }
    }

    async getFeedbackStats() {
        try {
            const response$ = this.httpService.get(`${this.baseUrl}/feedback-os/stats`, {
                params: {
                    venue_short_code: this.bbVenueCode,
                },
                headers: {
                    'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey,
                },
                validateStatus: (status) => status < 500,
            });

            const response = await lastValueFrom(response$);

            if (response.status === 400) {
                this.logger.error('Bad request:', response.data);
                throw new Error(response.data.message || 'Bad request');
            }

            return response.data;
        } catch (error) {
            this.logger.error('Failed to fetch feedback stats:', error);
            throw error;
        }
    }


    async listStores(clientId: string) {
        try {
            const venueShortCode = await this.getVenueShortCode(clientId);
            const response$ = this.httpService.get(`${this.baseUrl}/stores-os`, {
                params: { venue_short_code: venueShortCode },
                headers: { 'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey }
            });
            return (await lastValueFrom(response$)).data;
        } catch (error) {
            this.logger.error('Failed to fetch stores:', error);
            throw error;
        }
    }

    async connectDisconnectStore(params: {
        clientId: string;
        vbId: number;
        osId: string;
        type: 'connect' | 'disconnect';
    }) {
        try {
            const venueShortCode = await this.getVenueShortCode(params.clientId);

            // First update PHP backend
            const response$ = this.httpService.post(`${this.baseUrl}/stores-os/connect-disconnect`, {
                venue_short_code: venueShortCode,
                vb_id: params.vbId,
                os_id: params.osId,
                type: params.type
            }, {
                headers: { 'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey }
            });
            await lastValueFrom(response$);

            // Then update our store
            const updateData = params.type === 'connect'
                ? { $set: { 'externalIds.venueboostId': params.vbId.toString() } }
                : { $unset: { 'externalIds.venueboostId': "" } };

            const store = await this.storeModel.findByIdAndUpdate(
                params.osId,
                updateData,
                { new: true }
            );

            if (!store) throw new NotFoundException('Store not found');
            return store;
        } catch (error) {
            this.logger.error('Failed to connect/disconnect store:', error);
            throw error;
        }
    }

    async connectVenueBoost(clientId: string, venueShortCode: string) {
        const client = await this.clientModel.findByIdAndUpdate(
            clientId,
            {
                $set: {
                    venueBoostConnection: {
                        venueShortCode,
                        connectedAt: new Date(),
                        status: 'connected'
                    }
                }
            },
            { new: true }
        );

        if (!client) throw new NotFoundException('Client not found');
        return client;
    }



}