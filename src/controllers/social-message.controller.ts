// src/controllers/social-message.controller.ts
import {
    Controller,
    Post,
    Body,
    Param,
    UseGuards,
    Req,
    Patch,
    Delete
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { SocialChatService } from '../services/social-chat.service';
import { CreateSocialMessageDto } from '../dtos/social-message.dto';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';

@ApiTags('SocialMessages')
@ApiBearerAuth()
@Controller('social-messages')
@UseGuards(ClientAuthGuard)
export class SocialMessageController {
    constructor(private readonly socialChatService: SocialChatService) {}

    @Post()
    @ApiOperation({ summary: 'Send a new message' })
    @ApiResponse({ status: 201, description: 'Message sent successfully' })
    async sendMessage(@Body() createMessageDto: CreateSocialMessageDto, @Req() req: Request & { client: Client }) {
        // Ensure client ID is set from the authenticated client
        createMessageDto.clientId = req.client.id;
        return this.socialChatService.sendMessage(createMessageDto);
    }

    @Post(':id/forward')
    @ApiOperation({ summary: 'Forward a message to another chat' })
    @ApiResponse({ status: 201, description: 'Message forwarded successfully' })
    @ApiParam({ name: 'id', description: 'Message ID to forward' })
    async forwardMessage(
        @Param('id') messageId: string,
        @Body() forwardData: { chatId: string },
        @Req() req: Request & { client: Client, user: any }
    ) {
        return this.socialChatService.forwardMessage(
            messageId,
            forwardData.chatId,
            req.user._id
        );
    }

    @Post(':id/reply')
    @ApiOperation({ summary: 'Reply to a message' })
    @ApiResponse({ status: 201, description: 'Reply sent successfully' })
    @ApiParam({ name: 'id', description: 'Message ID to reply to' })
    async replyToMessage(
        @Param('id') replyToId: string,
        @Body() replyData: CreateSocialMessageDto,
        @Req() req: Request & { client: Client, user: any }
    ) {
        // Ensure client ID is set from the authenticated client
        replyData.clientId = req.client.id;

        return this.socialChatService.replyToMessage({
            ...replyData,
            replyToId,
            senderId: req.user._id
        });
    }

    @Patch(':id/read')
    @ApiOperation({ summary: 'Mark a message as read' })
    @ApiResponse({ status: 200, description: 'Message marked as read' })
    @ApiParam({ name: 'id', description: 'Message ID' })
    async markAsRead(
        @Param('id') messageId: string,
        @Req() req: Request & { client: Client, user: any }
    ) {
        return this.socialChatService.markMessageAsRead(messageId, req.user._id);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a message' })
    @ApiResponse({ status: 200, description: 'Message deleted successfully' })
    @ApiParam({ name: 'id', description: 'Message ID' })
    async deleteMessage(
        @Param('id') messageId: string,
        @Req() req: Request & { client: Client, user: any }
    ) {
        return this.socialChatService.deleteMessage(messageId, req.user._id);
    }
}