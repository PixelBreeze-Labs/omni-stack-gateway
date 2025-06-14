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

    async registerStaffluentDevice(deviceData: StaffluentDeviceRegistration): Promise<any> {
        const debugInfo = {
            timestamp: new Date().toISOString(),
            step: '',
            external_user_id: '',
            oneSignalId: '',
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
            debugInfo.oneSignalId = deviceData.playerId;
            debugInfo.platform = deviceData.platform;
    
            const tags = {
                businessId: deviceData.businessId,
                userId: deviceData.userId,
                userRole: deviceData.userRole || 'business_staff',
                isActive: deviceData.isActive !== false ? 'true' : 'false',
                platform: deviceData.platform,
            };
            debugInfo.tags = tags;
    
            debugInfo.logs.push(`External User ID: ${external_user_id}`);
            debugInfo.logs.push(`OneSignal ID: ${deviceData.playerId}`);
            debugInfo.logs.push(`Platform: ${deviceData.platform}`);
            debugInfo.logs.push(`Tags: ${JSON.stringify(tags)}`);
    
            if (deviceData.playerId) {
                // Step 3: Set External ID using Create Alias API (CORRECT METHOD)
                debugInfo.step = 'Set External ID (Create Alias API)';
                debugInfo.logs.push(`Setting external ID using Create Alias API for: ${deviceData.playerId}`);
                
                try {
                    const aliasPayload = {
                        identity: {
                            external_id: external_user_id
                        }
                    };
                    debugInfo.updatePayload = aliasPayload;
                    debugInfo.logs.push(`Alias payload: ${JSON.stringify(aliasPayload, null, 2)}`);
                    
                    // FIXED: Use PATCH method with correct Create Alias endpoint
                    const aliasResponse = await lastValueFrom(
                        this.httpService.patch(
                            `https://api.onesignal.com/apps/${this.appId}/users/by/onesignal_id/${deviceData.playerId}/identity`,
                            aliasPayload,
                            {
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Key ${this.apiKey}`, // FIXED: Use "Key" prefix
                                },
                                timeout: 10000,
                            }
                        )
                    );
    
                    debugInfo.apiResponse = aliasResponse.data;
                    debugInfo.logs.push('✅ External ID set successfully');
                    debugInfo.logs.push(`Alias Response: ${JSON.stringify(aliasResponse.data)}`);
                    
                    // Step 4: Update user tags using Update User API
                    debugInfo.step = 'Update User Tags';
                    try {
                        const updatePayload = {
                            properties: {
                                tags: tags
                            }
                        };
                        
                        const updateResponse = await lastValueFrom(
                            this.httpService.patch(
                                `https://api.onesignal.com/apps/${this.appId}/users/by/external_id/${encodeURIComponent(external_user_id)}`,
                                updatePayload,
                                {
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Key ${this.apiKey}`, // FIXED: Use "Key" prefix
                                    },
                                    timeout: 10000,
                                }
                            )
                        );
                        
                        debugInfo.logs.push('✅ User tags updated successfully');
                        debugInfo.logs.push(`Update Response: ${JSON.stringify(updateResponse.data)}`);
                        
                    } catch (tagError) {
                        debugInfo.logs.push(`⚠️ Tag update failed: ${tagError.message}`);
                        // Don't fail the whole process if tags fail
                    }
                    
                    // Step 5: Verify external ID was set
                    debugInfo.step = 'Verification - Get User Data';
                    try {
                        const verifyResponse = await lastValueFrom(
                            this.httpService.get(
                                `https://api.onesignal.com/apps/${this.appId}/users/by/onesignal_id/${deviceData.playerId}`,
                                {
                                    headers: {
                                        'Authorization': `Key ${this.apiKey}`, // FIXED: Use "Key" prefix
                                    },
                                    timeout: 5000,
                                }
                            )
                        );
                        
                        const userData = verifyResponse.data;
                        debugInfo.logs.push(`User verification data: ${JSON.stringify(userData)}`);
                        
                        // Check if external ID was set correctly
                        const userExternalId = userData.identity?.external_id;
                        if (userExternalId === external_user_id) {
                            debugInfo.logs.push('✅ External ID successfully set and verified!');
                            debugInfo.success = true;
                            debugInfo.message = 'OneSignal user updated and external ID verified';
                        } else {
                            debugInfo.logs.push(`⚠️ External ID mismatch. Expected: ${external_user_id}, Got: ${userExternalId}`);
                            debugInfo.success = true; // Still consider success since alias creation worked
                            debugInfo.message = 'OneSignal user updated but external ID verification unclear';
                        }
                    } catch (verifyError) {
                        debugInfo.logs.push(`⚠️ Could not verify external ID: ${verifyError.message}`);
                        debugInfo.success = true; // Still success since main update worked
                        debugInfo.message = 'OneSignal external ID set (verification failed)';
                    }
                    
                    this.logger.log(`OneSignal external ID set successfully: ${deviceData.playerId} with external_user_id: ${external_user_id}`);
                    
                    return {
                        success: true,
                        message: debugInfo.message,
                        oneSignalId: deviceData.playerId,
                        external_user_id: external_user_id,
                        debugInfo,
                        oneSignalResponse: aliasResponse.data,
                        note: `Check OneSignal dashboard for user ${deviceData.playerId} with external ID: ${external_user_id}`
                    };
    
                } catch (updateError) {
                    debugInfo.step = 'Alias Creation Error';
                    debugInfo.success = false;
                    
                    const errorData = updateError.response?.data;
                    const errorStatus = updateError.response?.status;
                    const errorMessage = errorData?.errors?.[0] || updateError.message;
                    
                    debugInfo.error = {
                        status: errorStatus,
                        message: errorMessage,
                        fullError: errorData
                    };
                    
                    debugInfo.logs.push(`❌ OneSignal Create Alias failed with status: ${errorStatus}`);
                    debugInfo.logs.push(`Error message: ${errorMessage}`);
                    debugInfo.logs.push(`Full error: ${JSON.stringify(errorData)}`);
                    
                    if (errorStatus === 404) {
                        debugInfo.logs.push('🚨 404 Error: OneSignal User ID not found');
                        debugInfo.message = 'OneSignal User ID not found - verify the OneSignal ID is correct';
                    } else if (errorStatus === 400) {
                        debugInfo.logs.push('🚨 400 Error: Bad request - check API key and payload');
                        debugInfo.message = 'OneSignal API rejected request - check API key and data format';
                    } else if (errorStatus === 405) {
                        debugInfo.logs.push('🚨 405 Error: Method not allowed - endpoint or method incorrect');
                        debugInfo.message = 'OneSignal API method not allowed - check endpoint and HTTP method';
                    } else {
                        debugInfo.message = `OneSignal external ID setup failed: ${errorMessage}`;
                    }
                    
                    this.logger.error(`Failed to set OneSignal external ID for ${deviceData.playerId}: ${errorMessage}`, {
                        oneSignalId: deviceData.playerId,
                        external_user_id,
                        errorStatus,
                        errorData
                    });
                    
                    return {
                        success: false,
                        message: debugInfo.message,
                        error: errorMessage,
                        oneSignalId: deviceData.playerId,
                        external_user_id: external_user_id,
                        debugInfo
                    };
                }
            }
    
            // No OneSignal ID provided
            debugInfo.step = 'No OneSignal ID';
            debugInfo.success = false;
            debugInfo.error = 'No OneSignal ID provided';
            debugInfo.message = 'OneSignal ID is required for registration';
            debugInfo.logs.push('❌ No OneSignal ID provided');
            
            return {
                success: false,
                message: 'OneSignal ID is required',
                error: 'No OneSignal ID provided',
                debugInfo
            };
    
        } catch (error) {
            debugInfo.step = 'General Error';
            debugInfo.success = false;
            debugInfo.error = error.message;
            debugInfo.logs.push(`❌ General error: ${error.message}`);
    
            this.logger.error(`OneSignal registration failed: ${error.message}`, {
                external_user_id: debugInfo.external_user_id,
                oneSignalId: deviceData.playerId,
                error: error.stack
            });
            
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