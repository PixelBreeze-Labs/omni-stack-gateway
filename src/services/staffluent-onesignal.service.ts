// src/services/staffluent-onesignal.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { AppClient } from '../schemas/app-client.schema';

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
    fallbackUsed?: boolean;
    externalUserId?: string;
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
        @InjectModel(AppClient.name) private appClientModel: Model<AppClient>,
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

    // CORRECTED: Handle external ID to OneSignal ID lookup properly

    async registerStaffluentDeviceFixed(deviceData: StaffluentDeviceRegistration & { fallbackUsed?: boolean; externalUserId?: string }): Promise<any> {
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
            logs: [],
            duplicatesRemoved: 0,
            fallbackUsed: deviceData.fallbackUsed || false
        };
    
        try {
            let finalBusinessId = deviceData.businessId;
         
            // Handle business ID lookup for clients
            if (!deviceData.businessId && (deviceData.userRole === 'client' || deviceData.userRole === 'app_client')) {
                try {
                    const appClient = await this.appClientModel.findOne({
                        user_id: deviceData.userId,
                        is_active: true
                    }).lean();
    
                    if (appClient && appClient.businessId) {
                        finalBusinessId = appClient.businessId.toString();
                        console.log(`✅ Found businessId from AppClient: ${finalBusinessId}`);
                    } else {
                        console.log('❌ AppClient not found or missing businessId');
                    }
                } catch (lookupError) {
                    console.error('Error looking up businessId:', lookupError.message);
                }
            }
    
            // Configuration check
            debugInfo.step = 'Configuration Check';
            debugInfo.logs.push('Checking OneSignal configuration...');
            
            if (!this.appId || !this.apiKey) {
                debugInfo.error = 'OneSignal not configured';
                debugInfo.message = 'Missing OneSignal app ID or API key';
                debugInfo.logs.push('❌ OneSignal configuration missing');
                throw new Error('OneSignal not configured');
            }
            debugInfo.logs.push('✅ OneSignal configuration found');
    
            // Prepare data
            debugInfo.step = 'Data Preparation';
            const external_user_id = `${finalBusinessId}_${deviceData.userId}`;
            debugInfo.external_user_id = external_user_id;
            debugInfo.platform = deviceData.platform;
    
            const tags = {
                businessId: finalBusinessId,
                userId: deviceData.userId,
                userRole: deviceData.userRole || 'business_staff',
            };
            debugInfo.tags = tags;
    
            debugInfo.logs.push(`External User ID: ${external_user_id}`);
            debugInfo.logs.push(`Received Player ID: ${deviceData.playerId}`);
            debugInfo.logs.push(`Platform: ${deviceData.platform}`);
            debugInfo.logs.push(`Fallback Used: ${deviceData.fallbackUsed}`);
    
            if (deviceData.playerId) {
                // STEP 1: Clean up existing duplicates first
                debugInfo.step = 'Duplicate Cleanup';
                debugInfo.logs.push('🧹 Cleaning up potential duplicate subscriptions...');
                
                try {
                    const duplicatesRemoved = await this.cleanupDuplicateSubscriptions(external_user_id);
                    debugInfo.duplicatesRemoved = duplicatesRemoved;
                    debugInfo.logs.push(`🗑️ Removed ${duplicatesRemoved} duplicate subscriptions`);
                } catch (cleanupError) {
                    debugInfo.logs.push(`⚠️ Cleanup warning: ${cleanupError.message}`);
                }
    
                // STEP 2: Check if this exact subscription already exists
                debugInfo.step = 'Existing Subscription Check';
                debugInfo.logs.push('🔍 Checking for existing subscription...');
                
                try {
                    const existingUser = await this.findUserByExternalId(external_user_id);
                    
                    if (existingUser.success && existingUser.oneSignalId) {
                        // Check if this is the same device
                        if (existingUser.oneSignalId === deviceData.playerId) {
                            debugInfo.logs.push('✅ Subscription already exists and up to date');
                            debugInfo.success = true;
                            debugInfo.message = 'Subscription already registered';
                            
                            return {
                                success: true,
                                message: 'Device already registered - no action needed',
                                oneSignalId: existingUser.oneSignalId,
                                external_user_id: external_user_id,
                                tags: tags,
                                debugInfo,
                                note: 'Existing subscription found, avoided duplicate'
                            };
                        } else {
                            // Different device for same user - this is OK, but log it
                            debugInfo.logs.push(`📱 Different device for same user: existing=${existingUser.oneSignalId}, new=${deviceData.playerId}`);
                        }
                    }
                } catch (existingCheckError) {
                    debugInfo.logs.push(`⚠️ Could not check existing subscriptions: ${existingCheckError.message}`);
                }
    
                // STEP 3: Determine if playerId is external ID or OneSignal ID
                const isExternalIdFormat = this.isExternalIdFormat(deviceData.playerId);
                debugInfo.logs.push(`🔍 Player ID format analysis: ${isExternalIdFormat ? 'External ID' : 'OneSignal ID'}`);
    
                if (isExternalIdFormat) {
                    // CASE A: playerId is actually an external ID - need to find real OneSignal ID
                    debugInfo.step = 'External ID Lookup Mode';
                    debugInfo.logs.push('🔄 Received external ID as playerId - looking up real OneSignal ID...');
                    
                    try {
                        const lookupResult = await this.findUserByExternalId(deviceData.playerId);
                        
                        if (lookupResult.success && lookupResult.oneSignalId) {
                            const realOneSignalId = lookupResult.oneSignalId;
                            debugInfo.oneSignalId = realOneSignalId;
                            debugInfo.logs.push(`✅ Found real OneSignal ID: ${realOneSignalId}`);
                            
                            // Update tags only
                            try {
                                const updatePayload = {
                                    properties: {
                                        tags: tags
                                    }
                                };
                                
                                debugInfo.updatePayload = updatePayload;
                                debugInfo.logs.push(`Updating tags for real OneSignal ID: ${realOneSignalId}`);
                                
                                const updateResponse = await lastValueFrom(
                                    this.httpService.patch(
                                        `https://api.onesignal.com/apps/${this.appId}/users/by/onesignal_id/${encodeURIComponent(realOneSignalId)}`,
                                        updatePayload,
                                        {
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Authorization': `Key ${this.apiKey}`,
                                            },
                                            timeout: 15000,
                                        }
                                    )
                                );
    
                                debugInfo.apiResponse = updateResponse.data;
                                debugInfo.logs.push('✅ Tags updated successfully on real OneSignal ID');
                                debugInfo.success = true;
                                debugInfo.message = 'External ID resolved to OneSignal ID and tags updated';
                                
                                return {
                                    success: true,
                                    message: debugInfo.message,
                                    oneSignalId: realOneSignalId,
                                    external_user_id: deviceData.playerId,
                                    tags: tags,
                                    debugInfo,
                                    oneSignalResponse: updateResponse.data,
                                    note: `Successfully resolved external ID ${deviceData.playerId} to OneSignal ID ${realOneSignalId}`,
                                    resolved: true,
                                    duplicatesRemoved: debugInfo.duplicatesRemoved
                                };
                                
                            } catch (updateError) {
                                debugInfo.logs.push(`⚠️ Failed to update tags: ${updateError.message}`);
                                debugInfo.success = true;
                                debugInfo.message = 'External ID resolved (tag update failed)';
                                
                                return {
                                    success: true,
                                    message: debugInfo.message,
                                    oneSignalId: realOneSignalId,
                                    external_user_id: deviceData.playerId,
                                    tags: tags,
                                    debugInfo,
                                    note: `Resolved external ID ${deviceData.playerId} to OneSignal ID ${realOneSignalId}, but tag update failed`,
                                    resolved: true,
                                    duplicatesRemoved: debugInfo.duplicatesRemoved
                                };
                            }
                            
                        } else {
                            debugInfo.logs.push('⚠️ External ID found but no OneSignal ID available');
                            debugInfo.success = true;
                            debugInfo.message = 'External ID verified (no OneSignal ID available)';
                            
                            return {
                                success: true,
                                message: debugInfo.message,
                                oneSignalId: null,
                                external_user_id: deviceData.playerId,
                                tags: tags,
                                debugInfo,
                                note: `External ID ${deviceData.playerId} exists but no OneSignal ID. Use include_external_user_ids for notifications.`,
                                fallbackUsed: true,
                                duplicatesRemoved: debugInfo.duplicatesRemoved
                            };
                        }
                        
                    } catch (lookupError) {
                        debugInfo.logs.push(`❌ External ID lookup failed: ${lookupError.message}`);
                        debugInfo.success = true;
                        debugInfo.message = 'External ID assumed valid (lookup failed)';
                        
                        return {
                            success: true,
                            message: debugInfo.message,
                            oneSignalId: null,
                            external_user_id: deviceData.playerId,
                            tags: tags,
                            debugInfo,
                            note: `External ID ${deviceData.playerId} assumed valid. Use include_external_user_ids for notifications.`,
                            fallbackUsed: true,
                            duplicatesRemoved: debugInfo.duplicatesRemoved
                        };
                    }
                    
                } else {
                    // CASE B: playerId is a real OneSignal ID - normal processing
                    debugInfo.step = 'Normal OneSignal ID Mode';
                    debugInfo.oneSignalId = deviceData.playerId;
                    debugInfo.logs.push(`Processing real OneSignal ID: ${deviceData.playerId}`);
                    
                    try {
                        const combinedPayload = {
                            identity: {
                                external_id: external_user_id
                            },
                            properties: {
                                tags: tags
                            }
                        };
                        debugInfo.updatePayload = combinedPayload;
                        
                        const updateResponse = await lastValueFrom(
                            this.httpService.patch(
                                `https://api.onesignal.com/apps/${this.appId}/users/by/onesignal_id/${encodeURIComponent(deviceData.playerId)}`,
                                combinedPayload,
                                {
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Key ${this.apiKey}`,
                                    },
                                    timeout: 15000,
                                }
                            )
                        );
    
                        debugInfo.apiResponse = updateResponse.data;
                        debugInfo.logs.push('✅ External ID and tags set successfully');
                        debugInfo.success = true;
                        debugInfo.message = 'OneSignal user updated with external ID and tags';
                        
                        return {
                            success: true,
                            message: debugInfo.message,
                            oneSignalId: deviceData.playerId,
                            external_user_id: external_user_id,
                            tags: tags,
                            debugInfo,
                            oneSignalResponse: updateResponse.data,
                            note: `OneSignal ID ${deviceData.playerId} updated with external ID ${external_user_id}`,
                            duplicatesRemoved: debugInfo.duplicatesRemoved
                        };
    
                    } catch (updateError) {
                        const errorMessage = updateError.response?.data?.errors?.[0] || updateError.message;
                        debugInfo.logs.push(`❌ OneSignal update failed: ${errorMessage}`);
                        
                        if (errorMessage && errorMessage.includes('string did not match the expected pattern')) {
                            debugInfo.logs.push('🔄 Pattern error suggests this might be external ID - retrying as external lookup');
                            
                            try {
                                const retryResult = await this.findUserByExternalId(deviceData.playerId);
                                if (retryResult.success) {
                                    debugInfo.success = true;
                                    debugInfo.message = 'Pattern error resolved - was external ID';
                                    
                                    return {
                                        success: true,
                                        message: debugInfo.message,
                                        oneSignalId: retryResult.oneSignalId || null,
                                        external_user_id: deviceData.playerId,
                                        tags: tags,
                                        debugInfo,
                                        note: `Pattern error resolved - ${deviceData.playerId} is external ID`,
                                        resolved: true,
                                        duplicatesRemoved: debugInfo.duplicatesRemoved
                                    };
                                }
                            } catch (retryError) {
                                debugInfo.logs.push(`❌ Retry as external ID also failed: ${retryError.message}`);
                            }
                        }
                        
                        return {
                            success: false,
                            message: `OneSignal update failed: ${errorMessage}`,
                            error: errorMessage,
                            oneSignalId: deviceData.playerId,
                            external_user_id: external_user_id,
                            debugInfo
                        };
                    }
                }
            }
    
            // No OneSignal ID provided
            debugInfo.step = 'No Player ID';
            debugInfo.success = false;
            debugInfo.error = 'No player ID provided';
            debugInfo.message = 'Player ID is required for registration';
            debugInfo.logs.push('❌ No player ID provided');
            
            return {
                success: false,
                message: 'Player ID is required',
                error: 'No player ID provided',
                debugInfo
            };
    
        } catch (error) {
            debugInfo.step = 'General Error';
            debugInfo.success = false;
            debugInfo.error = error.message;
            debugInfo.logs.push(`❌ General error: ${error.message}`);
    
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
 * NEW METHOD: Clean up duplicate subscriptions for a user
 */
async cleanupDuplicateSubscriptions(externalUserId: string): Promise<number> {
    try {
        if (!this.appId || !this.apiKey) {
            throw new Error('OneSignal not configured');
        }

        // Get all users with this external ID
        const allUsers = await lastValueFrom(
            this.httpService.get(
                `https://api.onesignal.com/apps/${this.appId}/users?filter[external_id]=${encodeURIComponent(externalUserId)}`,
                {
                    headers: {
                        'Authorization': `Key ${this.apiKey}`,
                    },
                    timeout: 10000,
                }
            )
        );

        const users = allUsers.data?.users || [];
        
        if (users.length <= 1) {
            // No duplicates found
            return 0;
        }

        console.log(`🔍 Found ${users.length} subscriptions for external ID: ${externalUserId}`);
        
        // Keep the most recent subscription, remove others
        const sortedUsers = users.sort((a, b) => 
            new Date(b.last_session || b.created_at).getTime() - 
            new Date(a.last_session || a.created_at).getTime()
        );
        
        const usersToRemove = sortedUsers.slice(1); // Remove all except the first (most recent)
        let removedCount = 0;

        for (const user of usersToRemove) {
            try {
                await lastValueFrom(
                    this.httpService.delete(
                        `https://api.onesignal.com/apps/${this.appId}/users/by/onesignal_id/${user.id}`,
                        {
                            headers: {
                                'Authorization': `Key ${this.apiKey}`,
                            },
                            timeout: 10000,
                        }
                    )
                );
                
                console.log(`🗑️ Removed duplicate subscription: ${user.id}`);
                removedCount++;
            } catch (deleteError) {
                console.error(`❌ Failed to remove duplicate subscription ${user.id}:`, deleteError.message);
            }
        }

        return removedCount;

    } catch (error) {
        console.error(`❌ Error during duplicate cleanup: ${error.message}`);
        return 0;
    }
}

/**
 * Helper method to detect if an ID is in external ID format
 */
private isExternalIdFormat(id: string): boolean {
    if (!id || typeof id !== 'string') return false;
    
    // Your external IDs follow the pattern: businessId_userId
    // Both are MongoDB ObjectIds (24 hex characters)
    const parts = id.split('_');
    if (parts.length !== 2) return false;
    
    // Check if both parts look like MongoDB ObjectIds (24 hex chars)
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    return objectIdRegex.test(parts[0]) && objectIdRegex.test(parts[1]);
}

/**
 * ENHANCED: Better external ID lookup with proper error handling
 */
async findUserByExternalId(externalUserId: string): Promise<{ success: boolean; oneSignalId?: string; userData?: any; error?: string }> {
    try {
        if (!this.appId || !this.apiKey) {
            throw new Error('OneSignal not configured');
        }

        const encodedExternalId = encodeURIComponent(externalUserId);
        const lookupUrl = `https://api.onesignal.com/apps/${this.appId}/users/by/external_id/${encodedExternalId}`;
        
        console.log(`🔍 Looking up user with external ID: ${externalUserId}`);
        console.log(`📡 API URL: ${lookupUrl}`);

        const response = await lastValueFrom(
            this.httpService.get(lookupUrl, {
                headers: {
                    'Authorization': `Key ${this.apiKey}`,
                },
                timeout: 10000,
            })
        );

        const userData = response.data;
        console.log(`📋 User data received:`, userData);
        
        if (userData && userData.identity?.onesignal_id) {
            console.log(`✅ Found OneSignal ID: ${userData.identity.onesignal_id} for external ID: ${externalUserId}`);
            return {
                success: true,
                oneSignalId: userData.identity.onesignal_id,
                userData: userData
            };
        } else if (userData) {
            console.log(`⚠️ User found but no OneSignal ID available for external ID: ${externalUserId}`);
            return {
                success: true,
                oneSignalId: null,
                userData: userData
            };
        } else {
            return {
                success: false,
                error: 'No user data returned'
            };
        }

    } catch (error) {
        const errorStatus = error.response?.status;
        const errorMessage = error.response?.data?.errors?.[0] || error.message;
        
        if (errorStatus === 404) {
            console.log(`⚠️ User with external ID ${externalUserId} not found in OneSignal (404)`);
            return {
                success: false,
                error: 'User not found'
            };
        }
        
        console.error(`❌ Error finding user by external ID ${externalUserId}: ${errorMessage}`);
        return {
            success: false,
            error: errorMessage
        };
    }
}




    // Fixed registerStaffluentDevice method with correct tags update
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

        let finalBusinessId = deviceData.businessId;
     
        // and role client or app client   
        if (!deviceData.businessId && (deviceData.userRole === 'client' || deviceData.userRole === 'app_client')) {
            try {
                // Find AppClient by user_id to get businessId
                const appClient = await this.appClientModel.findOne({
                    user_id: deviceData.userId,
                    is_active: true
                }).lean();

                if (appClient && appClient.businessId) {
                    finalBusinessId = appClient.businessId.toString();
                    console.log(`✅ Found businessId from AppClient: ${finalBusinessId}`);
                } else {
                    console.log('❌ AppClient not found or missing businessId');
                   
                }
            } catch (lookupError) {
                console.error('Error looking up businessId:', lookupError.message);
            }
        }

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
        const external_user_id = `${finalBusinessId}_${deviceData.userId}`;
        debugInfo.external_user_id = external_user_id;
        debugInfo.oneSignalId = deviceData.playerId;
        debugInfo.platform = deviceData.platform;

        const tags = {
            businessId: finalBusinessId,
            userId: deviceData.userId,
            userRole: deviceData.userRole || 'business_staff',
            // isActive: deviceData.isActive !== false ? 'true' : 'false',
            // platform: deviceData.platform,
        };
        debugInfo.tags = tags;

        debugInfo.logs.push(`External User ID: ${external_user_id}`);
        debugInfo.logs.push(`OneSignal ID: ${deviceData.playerId}`);
        debugInfo.logs.push(`Platform: ${deviceData.platform}`);
        debugInfo.logs.push(`Tags: ${JSON.stringify(tags)}`);

        if (deviceData.playerId) {
            // Step 3: Set External ID and Tags in single request (BETTER APPROACH)
            debugInfo.step = 'Set External ID and Tags (Combined API)';
            debugInfo.logs.push(`Setting external ID and tags for: ${deviceData.playerId}`);
            
            try {
                // FIXED: Use the correct Update User API with both identity and tags
                const combinedPayload = {
                    identity: {
                        external_id: external_user_id
                    },
                    properties: {
                        tags: tags
                    }
                };
                debugInfo.updatePayload = combinedPayload;
                debugInfo.logs.push(`Combined payload: ${JSON.stringify(combinedPayload, null, 2)}`);
                
                // FIXED: Update user with both external ID and tags in one call
                const updateResponse = await lastValueFrom(
                    this.httpService.patch(
                        `https://api.onesignal.com/apps/${this.appId}/users/by/onesignal_id/${deviceData.playerId}`,
                        combinedPayload,
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Key ${this.apiKey}`,
                            },
                            timeout: 15000,
                        }
                    )
                );

                debugInfo.apiResponse = updateResponse.data;
                debugInfo.logs.push('✅ External ID and tags set successfully');
                debugInfo.logs.push(`Update Response: ${JSON.stringify(updateResponse.data)}`);
                
                // Step 4: Verify both external ID and tags were set
                debugInfo.step = 'Verification - Get User Data';
                try {
                    // Wait a bit for OneSignal to process
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    const verifyResponse = await lastValueFrom(
                        this.httpService.get(
                            `https://api.onesignal.com/apps/${this.appId}/users/by/onesignal_id/${deviceData.playerId}`,
                            {
                                headers: {
                                    'Authorization': `Key ${this.apiKey}`,
                                },
                                timeout: 5000,
                            }
                        )
                    );
                    
                    const userData = verifyResponse.data;
                    debugInfo.logs.push(`User verification data: ${JSON.stringify(userData)}`);
                    
                    // Check if external ID was set correctly
                    const userExternalId = userData.identity?.external_id;
                    const userTags = userData.properties?.tags || {};
                    
                    if (userExternalId === external_user_id) {
                        debugInfo.logs.push('✅ External ID successfully set and verified!');
                        
                        // Check if tags were set
                        const tagsSet = Object.keys(tags).every(key => 
                            userTags[key] === tags[key]
                        );
                        
                        if (tagsSet) {
                            debugInfo.logs.push('✅ Tags successfully set and verified!');
                            debugInfo.success = true;
                            debugInfo.message = 'OneSignal user updated with external ID and tags verified';
                        } else {
                            debugInfo.logs.push('⚠️ Some tags may not have been set correctly');
                            debugInfo.logs.push(`Expected tags: ${JSON.stringify(tags)}`);
                            debugInfo.logs.push(`Actual tags: ${JSON.stringify(userTags)}`);
                            debugInfo.success = true; // Still success since external ID worked
                            debugInfo.message = 'OneSignal external ID set, tags partially updated';
                        }
                    } else {
                        debugInfo.logs.push(`⚠️ External ID mismatch. Expected: ${external_user_id}, Got: ${userExternalId}`);
                        debugInfo.success = true; // Still consider success since update worked
                        debugInfo.message = 'OneSignal user updated but verification unclear';
                    }
                } catch (verifyError) {
                    debugInfo.logs.push(`⚠️ Could not verify update: ${verifyError.message}`);
                    debugInfo.success = true; // Still success since main update worked
                    debugInfo.message = 'OneSignal update completed (verification failed)';
                }
                
                this.logger.log(`OneSignal user updated successfully: ${deviceData.playerId} with external_user_id: ${external_user_id}`);
                
                return {
                    success: true,
                    message: debugInfo.message,
                    oneSignalId: deviceData.playerId,
                    external_user_id: external_user_id,
                    tags: tags,
                    debugInfo,
                    oneSignalResponse: updateResponse.data,
                    note: `Check OneSignal dashboard for user ${deviceData.playerId} with external ID: ${external_user_id}`
                };

            } catch (updateError) {
                debugInfo.step = 'Update Error';
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
                
                // FALLBACK: Try external ID only if combined approach fails
                if (errorStatus === 409 || errorStatus === 400) {
                    debugInfo.logs.push('🔄 Trying fallback: External ID only...');
                    
                    try {
                        const aliasOnlyPayload = {
                            identity: {
                                external_id: external_user_id
                            }
                        };
                        
                        const aliasResponse = await lastValueFrom(
                            this.httpService.patch(
                                `https://api.onesignal.com/apps/${this.appId}/users/by/onesignal_id/${deviceData.playerId}/identity`,
                                aliasOnlyPayload,
                                {
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Key ${this.apiKey}`,
                                    },
                                    timeout: 10000,
                                }
                            )
                        );
                        
                        debugInfo.logs.push('✅ External ID set successfully (fallback)');
                        debugInfo.logs.push('⚠️ Tags update skipped due to API limitations');
                        debugInfo.success = true;
                        debugInfo.message = 'OneSignal external ID set (tags update failed)';
                        
                        return {
                            success: true,
                            message: debugInfo.message,
                            oneSignalId: deviceData.playerId,
                            external_user_id: external_user_id,
                            debugInfo,
                            oneSignalResponse: aliasResponse.data,
                            note: `External ID set, but tags update failed. Check OneSignal dashboard for user ${deviceData.playerId}`
                        };
                        
                    } catch (fallbackError) {
                        debugInfo.logs.push(`❌ Fallback also failed: ${fallbackError.message}`);
                        // Continue to main error handling below
                    }
                }
                
                if (errorStatus === 404) {
                    debugInfo.logs.push('🚨 404 Error: OneSignal User ID not found');
                    debugInfo.message = 'OneSignal User ID not found - verify the OneSignal ID is correct';
                } else if (errorStatus === 400) {
                    debugInfo.logs.push('🚨 400 Error: Bad request - check API key and payload');
                    debugInfo.message = 'OneSignal API rejected request - check API key and data format';
                } else if (errorStatus === 409) {
                    debugInfo.logs.push('🚨 409 Error: Conflict - user may already have external ID or tags');
                    debugInfo.message = 'OneSignal API conflict - user state conflict';
                } else {
                    debugInfo.message = `OneSignal update failed: ${errorMessage}`;
                }
                
                this.logger.error(`Failed to update OneSignal user ${deviceData.playerId}: ${errorMessage}`, {
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
 * Send notification to a specific user within a business
 */
async sendToSpecificUser(
    businessId: string,
    userId: string,
    title: string,
    message: string,
    options?: {
        data?: any;
        url?: string;
        priority?: number;
        buttons?: Array<{ id: string; text: string; icon?: string }>;
        bigPicture?: string;
        chromeWebIcon?: string;
        chromeWebImage?: string;
        ttl?: number;
        collapseId?: string;
    }
): Promise<any> {
    try {
        if (!this.appId || !this.apiKey) {
            throw new Error('OneSignal not configured');
        }

        // Create external user ID for the specific user
        const external_user_id = `${businessId}_${userId}`;

        const notificationOptions: StaffluentNotificationOptions = {
            headings: { en: title },
            contents: { en: message },
            include_external_user_ids: [external_user_id],
            data: {
                businessId,
                userId,
                type: 'direct_message',
                ...(options?.data || {}),
            },
            web_url: options?.url,
            priority: options?.priority || 5,
            buttons: options?.buttons,
            big_picture: options?.bigPicture,
            chrome_web_icon: options?.chromeWebIcon,
            chrome_web_image: options?.chromeWebImage,
            ttl: options?.ttl,
            collapse_id: options?.collapseId,
        };

        const result = await this.sendNotification(notificationOptions);

        this.logger.log(`Notification sent to specific user ${userId} in business ${businessId}: ${result?.id}`);
        
        return result;

    } catch (error) {
        this.logger.error(
            `Error sending notification to specific user ${userId} in business ${businessId}: ${error.message}`,
            error.stack,
        );
        throw error;
    }
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