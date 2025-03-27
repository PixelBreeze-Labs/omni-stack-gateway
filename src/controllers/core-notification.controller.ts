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
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiBody,
    ApiParam,
    ApiQuery,
    ApiProperty
} from '@nestjs/swagger';
import { NotificationService } from '../services/notification.service';
import { OneSignalService } from '../services/onesignal.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';
import {CoreNotificationService} from "../services/core-notification.service";
import {IsArray, IsOptional, IsString} from "class-validator";

class RegisterDeviceDto {
    deviceToken: string;
    platform: 'ios' | 'android';
    userId: string;
}

export class SendTestNotificationDto {
    @ApiProperty({ description: 'Array of OneSignal player IDs to send the notification to', required: false })
    @IsArray()
    @IsOptional()
    playerIds?: string[];

    @ApiProperty({ description: 'Segment name to send the notification to', required: false })
    @IsString()
    @IsOptional()
    segment?: string;

    @ApiProperty({ description: 'Notification title' })
    @IsString()
    title: string;

    @ApiProperty({ description: 'Notification message' })
    @IsString()
    message: string;
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

@ApiTags('CoreNotifications')
@ApiBearerAuth()
@Controller('core-notifications')
@UseGuards(ClientAuthGuard)
export class CoreNotificationController {
    constructor(
        private readonly coreNotificationService: CoreNotificationService,
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
            await this.coreNotificationService.updateUserOneSignalId(
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
        let result;

        // Check if we're sending to segments or player IDs
        if (testNotificationDto.segment) {
            // Send to segment - create the exact object format expected by the service
            result = await this.oneSignalService.sendTestNotification(
                {
                    segment: testNotificationDto.segment,
                    title: testNotificationDto.title,
                    message: testNotificationDto.message
                },
                undefined,
                undefined
            );
        } else if (testNotificationDto.playerIds && testNotificationDto.playerIds.length > 0) {
            // Send to specific player IDs
            result = await this.oneSignalService.sendTestNotification(
                testNotificationDto.playerIds,
                testNotificationDto.title,
                testNotificationDto.message,
            );
        } else {
            throw new BadRequestException('Either playerIds array or segment name is required');
        }

        // Check for OneSignal errors
        if (result.errors && result.errors.length > 0) {
            return {
                success: false,
                message: 'OneSignal reported errors',
                oneSignalResponse: result
            };
        }

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
        const result = await this.coreNotificationService.sendChatMessageNotification({
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
        const result = await this.coreNotificationService.sendTestNotificationToUser(
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