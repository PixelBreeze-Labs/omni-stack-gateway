// src/services/staffluent-onesignal.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';

interface StaffluentNotificationOptions {
    headings: { [language: string]: string };
    contents: { [language: string]: string };
    data?: any;
    include_player_ids?: string[];
    include_external_user_ids?: string[];
    included_segments?: string[];
    filters?: Array<{
        field: string;
        key: string;
        relation: string;
        value: string;
    }>;
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
    url?: string;
    web_url?: string;
    chrome_web_icon?: string;
    chrome_web_image?: string;
}

interface StaffluentDeviceRegistration {
    userId: string;
    businessId: string;
    deviceToken?: string;
    playerId?: string;
    platform: 'ios' | 'android' | 'web';
    userRole?: string;
    department?: string;
    teams?: string[];
    isActive?: boolean;
}

@Injectable()
export class StaffluentOneSignalService {
    private readonly logger = new Logger(StaffluentOneSignalService.name);
    private readonly apiUrl = 'https://onesignal.com/api/v1/notifications';
    private readonly playersUrl = 'https://onesignal.com/api/v1/players';
    private readonly appId: string;
    private readonly apiKey: string;

    constructor(
        private httpService: HttpService,
        private configService: ConfigService,
    ) {
        this.appId = this.configService.get<string>('ONESIGNAL_STAFFLUENT_APP_ID');
        this.apiKey = this.configService.get<string>('ONESIGNAL_STAFFLUENT_API_KEY');

        if (!this.appId || !this.apiKey) {
            this.logger.warn('OneSignal configuration missing. Notifications will not work.');
        }
    }

    /**
     * Send notification using OneSignal API
     */
    async sendNotification(options: StaffluentNotificationOptions): Promise<any> {
        try {
            if (!this.appId || !this.apiKey) {
                throw new Error('OneSignal not configured');
            }

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

            if (!response) {
                throw new Error('No response received from OneSignal');
            }

            this.logger.log(`Notification sent successfully: ${response.data?.id}`);
            return response.data;
        } catch (error) {
            if (error.response) {
                this.logger.error(
                    `OneSignal notification error: ${error.response.status} - ${JSON.stringify(error.response.data)}`,
                );
            } else if (error.request) {
                this.logger.error(
                    `OneSignal notification error: No response received`,
                    error.request,
                );
            } else {
                this.logger.error(
                    `OneSignal notification error: ${error.message}`,
                    error.stack,
                );
            }
            throw error;
        }
    }

    /**
     * Register/Update a device for a Staffluent user
     */
    async registerStaffluentDevice(deviceData: StaffluentDeviceRegistration): Promise<any> {
        try {
            if (!this.appId || !this.apiKey) {
                throw new Error('OneSignal not configured');
            }

            const tags = {
                userId: deviceData.userId,
                businessId: deviceData.businessId,
                platform: deviceData.platform,
                ...(deviceData.userRole && { userRole: deviceData.userRole }),
                ...(deviceData.department && { department: deviceData.department }),
                ...(deviceData.teams && { teams: deviceData.teams.join(',') }),
                isActive: deviceData.isActive !== false,
                lastRegistered: new Date().toISOString(),
            };

            let payload: any = {
                app_id: this.appId,
                tags,
                external_user_id: `${deviceData.businessId}_${deviceData.userId}`,
            };

            // Handle different registration scenarios
            if (deviceData.playerId) {
                // Update existing player
                const response = await lastValueFrom(
                    this.httpService.put(`${this.playersUrl}/${deviceData.playerId}`, payload, {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Basic ${this.apiKey}`,
                        },
                    }),
                );
                return response.data;
            } else {
                // Create new player
                payload = {
                    ...payload,
                    device_type: this.getDeviceType(deviceData.platform),
                    ...(deviceData.deviceToken && { identifier: deviceData.deviceToken }),
                };

                const response = await lastValueFrom(
                    this.httpService.post(this.playersUrl, payload, {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Basic ${this.apiKey}`,
                        },
                    }),
                );
                return response.data;
            }
        } catch (error) {
            this.logger.error(
                `Staffluent device registration error: ${error.message}`,
                error.stack,
            );
            throw error;
        }
    }

    /**
     * Send notification to specific business users
     */
    async sendToBusinessUsers(
        businessId: string,
        title: string,
        message: string,
        options?: {
            userRoles?: string[];
            departments?: string[];
            teams?: string[];
            userIds?: string[];
            data?: any;
            url?: string;
            priority?: number;
            buttons?: Array<{ id: string; text: string; icon?: string }>;
        }
    ): Promise<any> {
        const filters = [
            { field: 'tag', key: 'businessId', relation: '=', value: businessId },
            { field: 'tag', key: 'isActive', relation: '=', value: 'true' },
        ];

        // Add role filters
        if (options?.userRoles?.length) {
            filters.push({
                field: 'tag',
                key: 'userRole',
                relation: '=',
                value: options.userRoles.join(',')
            });
        }

        // Add department filters
        if (options?.departments?.length) {
            filters.push({
                field: 'tag',
                key: 'department',
                relation: '=',
                value: options.departments.join(',')
            });
        }

        // Add specific user IDs if provided
        const include_external_user_ids = options?.userIds?.map(userId => `${businessId}_${userId}`);

        const notificationOptions: StaffluentNotificationOptions = {
            headings: { en: title },
            contents: { en: message },
            filters: !include_external_user_ids ? filters : undefined,
            include_external_user_ids,
            data: {
                businessId,
                type: 'business_notification',
                ...(options?.data || {}),
            },
            url: options?.url,
            web_url: options?.url,
            priority: options?.priority || 5,
            buttons: options?.buttons,
        };

        return this.sendNotification(notificationOptions);
    }

    /**
     * Send task assignment notification
     */
    async sendTaskAssignmentNotification(
        assigneeUserId: string,
        businessId: string,
        taskName: string,
        projectName: string,
        assignedBy: string,
        dueDate?: Date
    ): Promise<any> {
        return this.sendToBusinessUsers(
            businessId,
            '📋 New Task Assigned',
            `You've been assigned "${taskName}" in ${projectName}`,
            {
                userIds: [assigneeUserId],
                data: {
                    type: 'task_assigned',
                    taskName,
                    projectName,
                    assignedBy,
                    dueDate: dueDate?.toISOString(),
                },
                buttons: [
                    { id: 'view_task', text: 'View Task' },
                    { id: 'accept', text: 'Accept' }
                ],
                priority: 7,
            }
        );
    }

    /**
     * Send quality inspection notification
     */
    async sendQualityInspectionNotification(
        inspectorIds: string[],
        businessId: string,
        projectName: string,
        location: string,
        priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium'
    ): Promise<any> {
        const priorityMap = { low: 3, medium: 5, high: 7, urgent: 10 };
        
        return this.sendToBusinessUsers(
            businessId,
            '🔍 Quality Inspection Required',
            `Inspection needed for ${projectName} at ${location}`,
            {
                userIds: inspectorIds,
                data: {
                    type: 'quality_inspection',
                    projectName,
                    location,
                    priority,
                },
                buttons: [
                    { id: 'start_inspection', text: 'Start Inspection' },
                    { id: 'schedule', text: 'Schedule Later' }
                ],
                priority: priorityMap[priority],
            }
        );
    }

    /**
     * Send emergency notification to all business users
     */
    async sendEmergencyNotification(
        businessId: string,
        title: string,
        message: string,
        location?: string
    ): Promise<any> {
        return this.sendToBusinessUsers(
            businessId,
            `🚨 EMERGENCY: ${title}`,
            message,
            {
                data: {
                    type: 'emergency',
                    location,
                    timestamp: new Date().toISOString(),
                },
                priority: 10,
                buttons: [
                    { id: 'acknowledge', text: 'Acknowledge' },
                    { id: 'call_support', text: 'Call Support' }
                ],
            }
        );
    }

    /**
     * Send client feedback notification to managers
     */
    async sendClientFeedbackNotification(
        businessId: string,
        clientName: string,
        feedbackType: string,
        rating: number,
        projectName?: string
    ): Promise<any> {
        const emoji = rating >= 4 ? '😊' : rating >= 3 ? '😐' : '😞';
        const priority = rating <= 2 ? 8 : 5;

        return this.sendToBusinessUsers(
            businessId,
            `${emoji} New Client Feedback`,
            `${clientName} left ${feedbackType} feedback (${rating}/5 stars)${projectName ? ` for ${projectName}` : ''}`,
            {
                userRoles: ['business_admin', 'project_manager', 'operations_manager'],
                data: {
                    type: 'client_feedback',
                    clientName,
                    feedbackType,
                    rating,
                    projectName,
                },
                buttons: [
                    { id: 'view_feedback', text: 'View Feedback' },
                    { id: 'respond', text: 'Respond' }
                ],
                priority,
            }
        );
    }

    /**
     * Send overtime alert notification
     */
    async sendOvertimeAlert(
        userId: string,
        businessId: string,
        currentHours: number,
        thresholdHours: number = 8
    ): Promise<any> {
        return this.sendToBusinessUsers(
            businessId,
            '⏰ Overtime Alert',
            `You've worked ${currentHours} hours today. Consider taking a break.`,
            {
                userIds: [userId],
                data: {
                    type: 'overtime_alert',
                    currentHours,
                    thresholdHours,
                },
                buttons: [
                    { id: 'clock_out', text: 'Clock Out' },
                    { id: 'continue', text: 'Continue Working' }
                ],
                priority: 6,
            }
        );
    }

    /**
     * Test notification function
     */
    async sendTestNotification(
        target: string[] | { segment: string; title?: string; message?: string } | { businessId: string; userIds?: string[] },
        title: string = 'Test Notification',
        message: string = 'This is a test notification from Staffluent'
    ): Promise<any> {
        try {
            // Business-specific test
            if (typeof target === 'object' && !Array.isArray(target) && 'businessId' in target) {
                const businessTarget = target as { businessId: string; userIds?: string[] };
                return this.sendToBusinessUsers(
                    businessTarget.businessId,
                    title,
                    message,
                    {
                        userIds: businessTarget.userIds,
                        data: {
                            type: 'test',
                            timestamp: new Date().toISOString(),
                        },
                    }
                );
            }

            // Segment test
            if (typeof target === 'object' && !Array.isArray(target) && 'segment' in target) {
                const segmentData = target as { segment: string; title?: string; message?: string };
                return await this.sendNotification({
                    headings: { en: segmentData.title || title },
                    contents: { en: segmentData.message || message },
                    included_segments: [segmentData.segment],
                    data: {
                        type: 'test',
                        timestamp: new Date().toISOString(),
                    },
                });
            }

            // Player IDs test
            return await this.sendNotification({
                headings: { en: title },
                contents: { en: message },
                include_player_ids: target as string[],
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

    /**
     * Get device type number for OneSignal
     */
    private getDeviceType(platform: string): number {
        switch (platform) {
            case 'ios': return 0;
            case 'android': return 1;
            case 'web': return 5;
            default: return 1;
        }
    }

    /**
     * Check if OneSignal is properly configured
     */
    isConfigured(): boolean {
        return !!(this.appId && this.apiKey);
    }

    /**
     * Get service configuration status
     */
    getStatus(): { configured: boolean; appId?: string } {
        return {
            configured: this.isConfigured(),
            appId: this.appId ? `${this.appId.substring(0, 8)}...` : undefined,
        };
    }
}