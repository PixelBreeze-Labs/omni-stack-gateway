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

    /**
     * Send a notification through OneSignal
     */
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

            return response.data;
        } catch (error) {
            this.logger.error(
                `OneSignal notification error: ${error.message}`,
                error.stack,
            );
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
    async sendTestNotification(
        playerIds: string[],
        title: string = 'Test Notification',
        message: string = 'This is a test notification from your app',
    ): Promise<any> {
        try {
            return await this.sendNotification({
                headings: { en: title },
                contents: { en: message },
                include_player_ids: playerIds,
                data: {
                    type: 'test',
                    timestamp: new Date().toISOString(),
                },
            });
        } catch (error) {
            this.logger.error(
                `Error sending test notification: ${error.message}`,
                error.stack,
            );
            throw error;
        }
    }
}