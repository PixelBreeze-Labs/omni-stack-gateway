// src/services/venueboost.service.ts
import {BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {Client} from "../schemas/client.schema";
import {Store} from "../schemas/store.schema";
import {User} from "../schemas/user.schema";

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

    async connectVenueBoost(clientId: string, venueShortCode: string, webhookApiKey: string) {
        const client = await this.clientModel.findByIdAndUpdate(
            clientId,
            {
                $set: {
                    venueBoostConnection: {
                        venueShortCode,
                        webhookApiKey,
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


    /**
     * Create venue and user in VenueBoost for Staffluent
     *
     * @param data Object containing user and business details
     * @returns Created user and venue IDs
     */
    async createVenueUserForStaffluent(data: {
        first_name: string;
        last_name: string;
        email: string;
        password: string;
        business_name: string;
        supabase_id: string;
        omnistack_user_id: string;
        phone_number?: string;
    }) {
        try {
            this.logger.log('Creating venue and user in VenueBoost for Staffluent');

            const response$ = this.httpService.post(
                `${this.baseUrl}/auth-os/create-venue-user-for-staffluent`,
                data,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey
                    }
                }
            );

            const response = await lastValueFrom(response$);

            if (response.status !== 201 || !response.data.success) {
                this.logger.error('Failed to create venue and user in VenueBoost', response.data);
                throw new Error(response.data.message || 'Failed to create venue and user');
            }

            return {
                userId: response.data.user_id,
                venueId: response.data.venue_id
            };
        } catch (error) {
            this.logger.error('Error creating venue and user in VenueBoost:', error);
            throw error;
        }
    }


    /**
     * Notify VenueBoost that a user's email has been verified
     *
     * @param user User object with all necessary information
     * @returns Success status and message
     */
    async notifyEmailVerified(user: User): Promise<{success: boolean; message: string}> {
        try {
            // Make sure we have the VenueBoost user ID
            if (!user.external_ids || !user.external_ids.venueBoostId) {
                return {
                    success: false,
                    message: 'No VenueBoost user ID found for user. Skipping notification.'
                };
            }

            const response$ = this.httpService.post(
                `${this.baseUrl}/auth-os/verify-user-email`,
                {
                    email: user.email,
                    venueboost_user_id: user.external_ids.venueBoostId
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey
                    }
                }
            );

            const response = await lastValueFrom(response$);

            if (!response.data.success) {
                this.logger.error('Failed to notify VenueBoost about email verification', response.data);
                return {
                    success: false,
                    message: response.data.message || 'Failed to notify VenueBoost about email verification'
                };
            }

            return {
                success: true,
                message: 'Successfully notified VenueBoost about email verification',
            };
        } catch (error) {
            this.logger.error(`Error notifying VenueBoost about email verification: ${error.message}`, error.stack);
            return {
                success: false,
                message: `Error notifying VenueBoost: ${error.message}`
            };
        }
    }

    /**
     * Get VenueBoost connection data for a user
     *
     * @param email User's email address
     * @param supabaseId Supabase ID
     * @returns Connection data including user, venue, and auth tokens
     */
    async getConnection(email: string, supabaseId: string): Promise<{
        user: {
            id: number;
            name: string;
            email: string;
        };
        venue: {
            id: number;
            name: string;
            short_code: string
        },
        token: string;
        account_type: string;
        refresh_token: string;
        success?: boolean;
        message?: string;
    }> {
        try {
            this.logger.log(`Getting VenueBoost connection for email: ${email}, supabaseId: ${supabaseId}`);

            const response$ = this.httpService.post(
                `${this.baseUrl}/auth-os/get-connection`,
                {
                    email,
                    supabase_id: supabaseId
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey
                    }
                }
            );

            const response = await lastValueFrom(response$);

            if (response.status >= 400) {
                this.logger.error('Failed to get VenueBoost connection', response.data);
                throw new Error(response.data.message || 'Failed to get VenueBoost connection');
            }

            // Extract only the fields we need
            const { user, venue, token, account_type, refresh_token } = response.data;

            return {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email
                },
                venue: {
                    id: venue.id,
                    name: venue.name,
                    short_code: venue.short_code
                },
                token,
                account_type,
                refresh_token
            };
        } catch (error) {
            this.logger.error(`Error getting VenueBoost connection: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Change a user's password in VenueBoost
     *
     * @param user User object containing necessary identification
     * @param password New password to set
     * @returns Success status and message
     */
    async changePassword(user: User, password: string): Promise<{success: boolean; message: string}> {
        try {
            // Make sure we have the VenueBoost user ID
            if (!user.external_ids || !user.external_ids.venueBoostId) {
                return {
                    success: false,
                    message: 'No VenueBoost user ID found for user. Skipping password change.'
                };
            }

            const response$ = this.httpService.post(
                `${this.baseUrl}/auth-os/change-password`,
                {
                    email: user.email,
                    venueboost_user_id: user.external_ids.venueBoostId,
                    new_password: password
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey
                    }
                }
            );

            const response = await lastValueFrom(response$);

            if (!response.data.success) {
                this.logger.error('Failed to change password in VenueBoost', response.data);
                return {
                    success: false,
                    message: response.data.message || 'Failed to change password in VenueBoost'
                };
            }

            return {
                success: true,
                message: 'Successfully changed password in VenueBoost',
            };
        } catch (error) {
            this.logger.error(`Error changing password in VenueBoost: ${error.message}`, error.stack);
            return {
                success: false,
                message: `Error changing password in VenueBoost: ${error.message}`
            };
        }
    }

    /**
     * Get staff connection data for authentication
     *
     * @param email Staff email address
     * @returns Connection data including user, token and account type
     */
    async getStaffConnection(email: string): Promise<any> {
        try {
            this.logger.log(`Getting staff connection for email: ${email}`);

            const response$ = this.httpService.post(
                `${this.baseUrl}/auth-os/get-staff-connection`,
                {
                    email
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey
                    }
                }
            );

            const response = await lastValueFrom(response$);

            if (response.status >= 400) {
                this.logger.error('Failed to get staff connection', response.data);
                throw new Error(response.data.message || 'Failed to get staff connection');
            }

            // Return the entire response data
            return response.data;
        } catch (error) {
            this.logger.error(`Error getting staff connection: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Get mobile staff connection via PHP backend with complete authentication data
     *
     * @param authData Complete authentication data
     * @returns PHP authentication response with user and token data
     */
    async getMobileStaffConnection(authData: {
        email: string;
        password: string;
        source_app?: string;
        firebase_token?: string;
        device_id?: string;
        device_type?: string;
        device_model?: string;
        os_version?: string;
        app_version?: string;
    }): Promise<any> {
        try {
            this.logger.log(`Getting mobile staff connection for email: ${authData.email}`);

            // Set default values for any missing fields
            const requestData = {
                email: authData.email,
                password: authData.password,
                source_app: authData.source_app || 'staff',
                firebase_token: authData.firebase_token || '',
                device_id: authData.device_id || '',
                device_type: authData.device_type || 'mobile',
                device_model: authData.device_model || '',
                os_version: authData.os_version || '',
                app_version: authData.app_version || ''
            };

            // Make request to PHP backend with the exact data structure PHP expects
            const response$ = this.httpService.post(
                `${this.baseUrl}/auth-os/get-mobile-staff-connection`,
                requestData,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey
                    }
                }
            );

            const response = await lastValueFrom(response$);

            if (response.status >= 400) {
                this.logger.error('Failed to get mobile staff connection', response.data);
                throw new Error(response.data.error || 'Failed to get mobile staff connection');
            }

            this.logger.log(`Successfully authenticated mobile staff: ${authData.email}`);

            // Return the exact same response PHP would return
            return response.data;
        } catch (error) {
            this.logger.error(`Error getting mobile staff connection: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * List rental units from VenueBoost for a client
     *
     * @param clientId The MongoDB ID of the client
     * @returns List of rental units
     */
    async listRentalUnits(clientId: string) {
        try {
            const client = await this.clientModel.findById(clientId).select('+apiKey');

            if (!client || !client.apiKey) {
                throw new BadRequestException('Client API key not found');
            }
            // Call the VenueBoost API
            const response$ = this.httpService.get(`${this.baseUrl}/accommodation-os`, {
                params: {
                    omnigateway_api_key: client.apiKey
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

            if (response.status === 401) {
                this.logger.error('Unauthorized:', response.data);
                throw new UnauthorizedException(response.data.error || 'Invalid API key');
            }

            return response.data;
        } catch (error) {
            this.logger.error('Failed to fetch rental units:', error);
            throw error;
        }
    }

    /**
     * List bookings from VenueBoost for a client
     *
     * @param clientId The MongoDB ID of the client
     * @returns List of bookings
     */
    async listBookings(clientId: string) {
        try {
            const client = await this.clientModel.findById(clientId).select('+apiKey');

            if (!client || !client.apiKey) {
                throw new BadRequestException('Client API key not found');
            }

            // Call the VenueBoost API with the client's API key
            const response$ = this.httpService.get(`${this.baseUrl}/accomodation-os/bookings`, {
                params: {
                    omnigateway_api_key: client.apiKey
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

            if (response.status === 401) {
                this.logger.error('Unauthorized:', response.data);
                throw new UnauthorizedException(response.data.error || 'Invalid API key');
            }

            return response.data;
        } catch (error) {
            this.logger.error('Failed to fetch bookings:', error);
            throw error;
        }
    }

    /**
     * Update a booking in VenueBoost with our OmniStack ID
     *
     * @param clientId The MongoDB ID of the client
     * @param vbBookingId The VenueBoost booking ID
     * @param omnistackId The OmniStack (MongoDB) booking ID
     * @returns Result of the update operation
     */
    async updateBookingExternalId(clientId: string, vbBookingId: string, omnistackId: string): Promise<boolean> {
        try {
            const client = await this.clientModel.findById(clientId).select('+apiKey');

            if (!client || !client.apiKey) {
                throw new BadRequestException('Client API key not found');
            }

            // Call the VenueBoost API to update the booking's external ID
            const response$ = this.httpService.post(
                `${this.baseUrl}/accommodation-os/bookings/${vbBookingId}/external-id`,
                {
                    omnistack_id: omnistackId
                },
                {
                    params: {
                        omnigateway_api_key: client.apiKey
                    },
                    headers: {
                        'Content-Type': 'application/json',
                        'SN-BOOST-CORE-OMNI-STACK-GATEWAY-API-KEY': this.apiKey
                    }
                }
            );

            const response = await lastValueFrom(response$);

            if (response.status >= 400) {
                this.logger.error(`Failed to update booking ${vbBookingId} with external ID: ${response.data.error || 'Unknown error'}`);
                return false;
            }

            return true;
        } catch (error) {
            this.logger.error(`Error updating booking external ID: ${error.message}`, error.stack);
            return false;
        }
    }

}