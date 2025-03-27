// src/services/onesignal.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';

interface NotificationOptions {
    headings: { [language: string]: string };
    contents: { [language: string]: string };
    data?: any;
    include_player_ids?: string[];
    include_external_user_ids?: string[];
    included_segments?: string[];  // Add this line for segments
    android_channel_id?: string;
    ios_category?: string;
    ios_badgeType?: string;
    ios_badgeCount?: number;
    collapse_id?: string;
    priority?: number;
    ttl?: number;
    buttons?: Array<{ id: string; text: string; icon?: string }>;
    big_picture?: string;
    ios_attachments?: { [id: string]: string };
}

@Injectable()
export class OneSignalService {
    private readonly logger = new Logger(OneSignalService.name);
    private readonly apiUrl = 'https://onesignal.com/api/v1/notifications';
    private readonly appId: string;
    private readonly apiKey: string;

    constructor(
        private httpService: HttpService,
        private configService: ConfigService,
    ) {
        this.appId = this.configService.get<string>('ONESIGNAL_APP_ID');
        this.apiKey = this.configService.get<string>('ONESIGNAL_API_KEY');
    }

    async sendNotification(options: NotificationOptions): Promise<any> {
        try {
            const payload = {
                app_id: this.appId,
                ...options,
            };

            const response = await lastValueFrom(
                this.httpService.post(this.apiUrl, payload, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${this.apiKey}`,
                    },
                }),
            );

            // Make sure we have a response before accessing its data
            if (!response) {
                throw new Error('No response received from OneSignal');
            }

            return response.data;
        } catch (error) {
            // Improved error logging
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                this.logger.error(
                    `OneSignal notification error: ${error.response.status} - ${JSON.stringify(error.response.data)}`,
                );
            } else if (error.request) {
                // The request was made but no response was received
                this.logger.error(
                    `OneSignal notification error: No response received`,
                    error.request,
                );
            } else {
                // Something happened in setting up the request that triggered an Error
                this.logger.error(
                    `OneSignal notification error: ${error.message}`,
                    error.stack,
                );
            }
            throw error;
        }
    }

    /**
     * Register a device token for a user
     */
    async registerDevice(
        userId: string,
        deviceToken: string,
        platform: 'ios' | 'android',
    ): Promise<any> {
        try {
            const payload = {
                app_id: this.appId,
                identifier: deviceToken,
                device_type: platform === 'ios' ? 0 : 1,
                external_user_id: userId,
            };

            const response = await lastValueFrom(
                this.httpService.post('https://onesignal.com/api/v1/players', payload, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${this.apiKey}`,
                    },
                }),
            );

            return response.data;
        } catch (error) {
            this.logger.error(
                `OneSignal device registration error: ${error.message}`,
                error.stack,
            );
            throw error;
        }
    }

    /**
     * Test function to verify OneSignal configuration
     */
    /**
     * Test function to verify OneSignal configuration
     */
    async sendTestNotification(
        playerIds: string[] | { segment: string; title?: string; message?: string },
        title: string = 'Test Notification',
        message: string = 'This is a test notification from your app',
    ): Promise<any> {
        try {
            // Check if the first parameter is an object with segment property
            if (typeof playerIds === 'object' && !Array.isArray(playerIds) && 'segment' in playerIds) {
                const segmentData = playerIds as { segment: string; title?: string; message?: string };

                return await this.sendNotification({
                    headings: { en: segmentData.title || title },
                    contents: { en: segmentData.message || message },
                    included_segments: [segmentData.segment],
                    data: {
                        type: 'test',
                        timestamp: new Date().toISOString(),
                    },
                });
            } else {
                // Original behavior with player IDs array
                return await this.sendNotification({
                    headings: { en: title },
                    contents: { en: message },
                    include_player_ids: playerIds as string[],
                    data: {
                        type: 'test',
                        timestamp: new Date().toISOString(),
                    },
                });
            }
        } catch (error) {
            this.logger.error(
                `Error sending test notification: ${error.message}`,
                error.stack,
            );
            throw error;
        }
    }
}