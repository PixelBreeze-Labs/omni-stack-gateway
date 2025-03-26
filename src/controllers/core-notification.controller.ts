// src/controllers/core-notification.controller.ts
import {
    Controller,
    Post,
    Body,
    UseGuards,
    Req,
    Get,
    Param,
    Query,
    BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { NotificationService } from '../services/notification.service';
import { OneSignalService } from '../services/onesignal.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';

class RegisterDeviceDto {
    deviceToken: string;
    platform: 'ios' | 'android';
    userId: string;
}

class SendTestNotificationDto {
    playerIds: string[];
    title?: string;
    message?: string;
}

class SendChatNotificationDto {
    chatId: string;
    messageId: string;
    senderId: string;
    excludeUsers?: string[];
    title?: string;
    message?: string;
    data?: any;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(ClientAuthGuard)
export class NotificationController {
    constructor(
        private readonly notificationService: NotificationService,
        private readonly oneSignalService: OneSignalService,
    ) {}

    /**
     * Register a device token for push notifications
     */
    @Post('register-device')
    @ApiOperation({ summary: 'Register a device token for push notifications' })
    @ApiResponse({ status: 200, description: 'Device registered successfully' })
    @ApiBody({ type: RegisterDeviceDto })
    async registerDevice(
        @Req() req: Request & { client: Client },
        @Body() registerDeviceDto: RegisterDeviceDto,
    ) {
        const { deviceToken, platform, userId } = registerDeviceDto;

        // Register with OneSignal
        const result = await this.oneSignalService.registerDevice(
            userId,
            deviceToken,
            platform,
        );

        // Update the user with the OneSignal player ID
        if (result && result.id) {
            await this.notificationService.updateUserOneSignalId(
                userId,
                result.id,
            );
        }

        return {
            success: true,
            message: 'Device registered successfully',
            oneSignalPlayerId: result?.id,
        };
    }

    /**
     * Send a test notification through OneSignal
     */
    @Post('test')
    @ApiOperation({ summary: 'Send a test notification' })
    @ApiResponse({ status: 200, description: 'Test notification sent' })
    @ApiBody({ type: SendTestNotificationDto })
    async sendTestNotification(
        @Req() req: Request & { client: Client },
        @Body() testNotificationDto: SendTestNotificationDto,
    ) {
        if (!testNotificationDto.playerIds || testNotificationDto.playerIds.length === 0) {
            throw new BadRequestException('At least one player ID is required');
        }

        const result = await this.oneSignalService.sendTestNotification(
            testNotificationDto.playerIds,
            testNotificationDto.title,
            testNotificationDto.message,
        );

        return {
            success: true,
            message: 'Test notification sent',
            oneSignalResponse: result,
        };
    }

    /**
     * Send a chat notification
     */
    @Post('chat')
    @ApiOperation({ summary: 'Send a chat notification' })
    @ApiResponse({ status: 200, description: 'Chat notification sent' })
    @ApiBody({ type: SendChatNotificationDto })
    async sendChatNotification(
        @Req() req: Request & { client: Client },
        @Body() chatNotificationDto: SendChatNotificationDto,
    ) {
        const result = await this.notificationService.sendChatMessageNotification({
            ...chatNotificationDto,
        });

        return {
            success: true,
            message: 'Chat notification sent',
            details: result,
        };
    }

    /**
     * Send a test notification to a specific user
     */
    @Post('test-user/:userId')
    @ApiOperation({ summary: 'Send a test notification to a specific user' })
    @ApiResponse({ status: 200, description: 'Test notification sent to user' })
    @ApiParam({ name: 'userId', description: 'User ID' })
    @ApiQuery({ name: 'title', required: false, description: 'Notification title' })
    @ApiQuery({ name: 'message', required: false, description: 'Notification message' })
    async sendTestNotificationToUser(
        @Req() req: Request & { client: Client },
        @Param('userId') userId: string,
        @Query('title') title?: string,
        @Query('message') message?: string,
    ) {
        const result = await this.notificationService.sendTestNotificationToUser(
            userId,
            title,
            message,
        );

        return {
            success: true,
            message: 'Test notification sent to user',
            oneSignalResponse: result,
        };
    }
}