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
     * FIXED: Update OneSignal player with detailed debugging response
     */
 async registerStaffluentDevice(deviceData: StaffluentDeviceRegistration): Promise<any> {
    const debugInfo = {
        timestamp: new Date().toISOString(),
        step: '',
        external_user_id: '',
        oneSignalPlayerId: '',
        platform: '',
        tags: {},
        updatePayload: {},
        apiResponse: null,
        error: null,
        success: false,
        message: '',
        logs: []
    };

    try {
        // Step 1: Configuration check
        debugInfo.step = 'Configuration Check';
        debugInfo.logs.push('Checking OneSignal configuration...');
        
        if (!this.appId || !this.apiKey) {
            debugInfo.error = 'OneSignal not configured';
            debugInfo.message = 'Missing OneSignal app ID or API key';
            debugInfo.logs.push('❌ OneSignal configuration missing');
            throw new Error('OneSignal not configured');
        }
        debugInfo.logs.push('✅ OneSignal configuration found');

        // Step 2: Prepare data
        debugInfo.step = 'Data Preparation';
        const external_user_id = `${deviceData.businessId}_${deviceData.userId}`;
        debugInfo.external_user_id = external_user_id;
        debugInfo.oneSignalPlayerId = deviceData.playerId || 'none';
        debugInfo.platform = deviceData.platform;

        const tags = {
            businessId: deviceData.businessId,
            userRole: deviceData.userRole || 'business_staff',
            isActive: deviceData.isActive !== false ? 'true' : 'false',
        };
        debugInfo.tags = tags;

        debugInfo.logs.push(`External User ID: ${external_user_id}`);
        debugInfo.logs.push(`OneSignal Player ID: ${deviceData.playerId}`);
        debugInfo.logs.push(`Platform: ${deviceData.platform}`);
        debugInfo.logs.push(`Tags: ${JSON.stringify(tags)}`);

        // Step 3: Update player
        debugInfo.step = 'Player Update';
        
        if (deviceData.playerId) {
            debugInfo.logs.push(`Attempting to update player: ${deviceData.playerId}`);
            
            try {
                const updatePayload = {
                    app_id: this.appId,
                    tags,
                    external_user_id,
                };
                debugInfo.updatePayload = updatePayload;
                debugInfo.logs.push(`Update payload: ${JSON.stringify(updatePayload, null, 2)}`);
                
                const response = await lastValueFrom(
                    this.httpService.put(`${this.playersUrl}/${deviceData.playerId}`, updatePayload, {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Basic ${this.apiKey}`,
                        },
                    }),
                );

                debugInfo.apiResponse = response.data;
                debugInfo.success = true;
                debugInfo.message = 'OneSignal player updated successfully';
                debugInfo.logs.push('✅ OneSignal update successful');
                debugInfo.logs.push(`Response: ${JSON.stringify(response.data)}`);
                
                this.logger.log(`OneSignal player updated successfully: ${deviceData.playerId}`);
                
                return {
                    success: true,
                    message: 'OneSignal player updated successfully',
                    playerId: deviceData.playerId,
                    debugInfo,
                    oneSignalResponse: response.data
                };

            } catch (updateError) {
                debugInfo.step = 'Player Update Error';
                debugInfo.success = false;
                
                const errorData = updateError.response?.data;
                const errorStatus = updateError.response?.status;
                const errorMessage = errorData?.errors?.[0] || updateError.message;
                
                debugInfo.error = {
                    status: errorStatus,
                    message: errorMessage,
                    fullError: errorData
                };
                
                debugInfo.logs.push(`❌ OneSignal update failed with status: ${errorStatus}`);
                debugInfo.logs.push(`Error message: ${errorMessage}`);
                debugInfo.logs.push(`Full error: ${JSON.stringify(errorData)}`);
                
                this.logger.error(`Failed to update OneSignal player ${deviceData.playerId}: ${errorMessage}`);
                
                return {
                    success: false,
                    message: `Failed to update OneSignal player: ${errorMessage}`,
                    error: errorMessage,
                    playerId: deviceData.playerId,
                    debugInfo,
                    note: 'Player exists but update failed - check OneSignal dashboard'
                };
            }
        }

        // Step 4: No player ID provided
        debugInfo.step = 'No Player ID';
        debugInfo.success = false;
        debugInfo.error = 'No OneSignal player ID provided';
        debugInfo.message = 'OneSignal player ID is required for registration';
        debugInfo.logs.push('❌ No OneSignal player ID provided');
        
        return {
            success: false,
            message: 'OneSignal player ID is required',
            error: 'No player ID provided',
            debugInfo
        };

    } catch (error) {
        debugInfo.step = 'General Error';
        debugInfo.success = false;
        debugInfo.error = error.message;
        debugInfo.logs.push(`❌ General error: ${error.message}`);

        // Enhanced error logging
        if (error.response) {
            debugInfo.logs.push(`HTTP Status: ${error.response.status}`);
            debugInfo.logs.push(`Response Data: ${JSON.stringify(error.response.data)}`);
            
            this.logger.error(`OneSignal API Error: ${error.response.status}`, {
                status: error.response.status,
                data: error.response.data,
                external_user_id: debugInfo.external_user_id,
            });

            // Handle specific known errors gracefully
            const errorMessages = error.response.data?.errors || [];
            const isDuplicate = errorMessages.some(err => 
                err.includes('already exists') || 
                err.includes('duplicate')
            );

            if (isDuplicate) {
                debugInfo.logs.push('ℹ️ User already registered in OneSignal - this is expected');
                debugInfo.success = true;
                debugInfo.message = 'User already registered';
                
                return { 
                    success: true, 
                    message: 'User already registered in OneSignal',
                    playerId: deviceData.playerId,
                    debugInfo,
                    note: 'Duplicate registration - this is expected behavior'
                };
            }
        }

        this.logger.error(`OneSignal registration failed: ${error.message}`);
        
        return { 
            success: false, 
            message: 'OneSignal registration failed',
            error: error.message,
            debugInfo
        };
    }
}


    /**
     * Send notification to specific business users
     */
    async sendToBusinessUsersWeb(
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
        return this.sendToBusinessUsersWeb(
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
        
        return this.sendToBusinessUsersWeb(
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
        return this.sendToBusinessUsersWeb(
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

        return this.sendToBusinessUsersWeb(
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
        return this.sendToBusinessUsersWeb(
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
                return this.sendToBusinessUsersWeb(
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