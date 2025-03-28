// src/controllers/social-chat.controller.ts
import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
    UseGuards,
    Req,
    Patch,
    Delete
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { SocialChatService } from '../services/social-chat.service';
import { CreateSocialChatDto, UpdateSocialChatDto } from '../dtos/social-chat.dto';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';

@ApiTags('SocialChat')
@ApiBearerAuth()
@Controller('social-chats')
@UseGuards(ClientAuthGuard)
export class SocialChatController {
    constructor(private readonly socialChatService: SocialChatService) {}

    @Post()
    @ApiOperation({ summary: 'Create a new chat' })
    @ApiResponse({ status: 201, description: 'Chat created successfully' })
    async createChat(@Body() createChatDto: CreateSocialChatDto, @Req() req: Request & { client: Client }) {
        // Instead of modifying the DTO, pass the clientId as a separate parameter
        return this.socialChatService.createChat({
            ...createChatDto,
            clientId: req.client.id
        });
    }

    @Get()
    @ApiOperation({ summary: 'Get all chats for the current user' })
    @ApiResponse({ status: 200, description: 'Returns user chats' })
    async getUserChats(@Req() req: Request & { client: Client, user: any }) {
        return this.socialChatService.getUserChats(req.user._id, req.client.id);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get chat details' })
    @ApiResponse({ status: 200, description: 'Returns chat details' })
    @ApiParam({ name: 'id', description: 'Chat ID' })
    async getChatById(@Param('id') id: string, @Req() req: Request & { client: Client }) {
        return this.socialChatService.getChatById(id);
    }

    @Get(':id/messages')
    @ApiOperation({ summary: 'Get chat messages with pagination' })
    @ApiResponse({ status: 200, description: 'Returns chat messages' })
    @ApiParam({ name: 'id', description: 'Chat ID' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getChatMessages(
        @Param('id') chatId: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 20,
        @Req() req: Request & { client: Client }
    ) {
        return this.socialChatService.getChatMessages(chatId, page, limit);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a chat' })
    @ApiResponse({ status: 200, description: 'Chat updated successfully' })
    @ApiParam({ name: 'id', description: 'Chat ID' })
    async updateChat(
        @Param('id') chatId: string,
        @Body() updateChatDto: UpdateSocialChatDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.socialChatService.updateChat(chatId, updateChatDto);
    }
}