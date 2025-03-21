// src/controllers/notification.controller.ts
import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    Req,
    UseGuards,
    UnauthorizedException
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth, ApiQuery
} from '@nestjs/swagger';
import { NotificationService } from '../services/notification.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { ListNotificationDto, MarkNotificationsReadDto } from '../dtos/notification.dto';
import { Client } from '../schemas/client.schema';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationController {
    constructor(private readonly notificationService: NotificationService) {}

    @ApiOperation({ summary: 'Get user notifications' })
    @ApiQuery({ type: ListNotificationDto })
    @ApiResponse({ status: 200, description: 'List of user notifications' })
    @UseGuards(ClientAuthGuard)
    @Get()
    async getUserNotifications(
        @Query() query: ListNotificationDto,
        @Query('userId') userId: string,
        @Req() req: Request & { client: Client }
    ) {
        if (!userId) {
            throw new UnauthorizedException('User ID is required');
        }

        return this.notificationService.findUserNotifications(
            userId,
            req.client.id,
            query
        );
    }

    @ApiOperation({ summary: 'Mark notifications as read' })
    @ApiResponse({ status: 200, description: 'Notifications marked as read' })
    @UseGuards(ClientAuthGuard)
    @Post('read')
    async markNotificationsAsRead(
        @Body() dto: MarkNotificationsReadDto,
        @Query('userId') userId: string,
        @Req() req: Request & { client: Client }
    ) {
        if (!userId) {
            throw new UnauthorizedException('User ID is required');
        }

        return this.notificationService.markAsRead(
            userId,
            req.client.id,
            dto
        );
    }

    @ApiOperation({ summary: 'Get unread notifications count' })
    @ApiResponse({ status: 200, description: 'Unread notifications count' })
    @UseGuards(ClientAuthGuard)
    @Get('count')
    async getUnreadCount(
        @Query('userId') userId: string,
        @Req() req: Request & { client: Client }
    ) {
        if (!userId) {
            throw new UnauthorizedException('User ID is required');
        }

        const count = await this.notificationService.getUnreadCount(
            userId,
            req.client.id
        );

        return { unreadCount: count };
    }
}