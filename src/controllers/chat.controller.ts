// src/controllers/chat.controller.ts
import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    UseGuards,
    Req,
    Query,
    DefaultValuePipe,
    ParseIntPipe,
    BadRequestException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ChatService } from '../services/chat.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { ChatStatus, ChatType } from '../schemas/chat.schema';
import { Client } from '../schemas/client.schema';

@ApiTags('Chats')
@ApiBearerAuth()
@Controller('chats')
@UseGuards(ClientAuthGuard)
export class ChatController {
    constructor(
        private readonly chatService: ChatService
    ) {}

    /**
     * Get all chats with filtering and pagination
     */
    @Get()
    @ApiOperation({ summary: 'Get all chats with filtering and pagination' })
    @ApiResponse({
        status: 200,
        description: 'Returns a list of chats'
    })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'search', required: false, type: String })
    @ApiQuery({ name: 'status', required: false, enum: ChatStatus })
    @ApiQuery({ name: 'type', required: false, enum: ChatType })
    async getChats(
        @Req() req: Request & { client: Client },
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
        @Query('status') status?: ChatStatus,
        @Query('type') type?: ChatType
    ) {
        return this.chatService.findAll(req.client.id, {
            page,
            limit,
            search,
            status,
            type
        });
    }

    /**
     * Get a chat by ID
     */
    @Get(':id')
    @ApiOperation({ summary: 'Get a chat by ID' })
    @ApiResponse({
        status: 200,
        description: 'Returns a chat by ID'
    })
    async getChatById(
        @Req() req: Request & { client: Client },
        @Param('id') id: string
    ) {
        return this.chatService.findById(req.client.id, id);
    }

    /**
     * Sync chats from VenueBoost
     */
    @Post('sync')
    @ApiOperation({ summary: 'Sync chats from VenueBoost' })
    @ApiResponse({
        status: 200,
        description: 'Chats synced successfully'
    })
    async syncChats(@Req() req: Request & { client: Client }) {
        return this.chatService.syncChatsFromVenueBoost(req.client.id);
    }

    /**
     * Delete a chat
     */
    @Delete(':id')
    @ApiOperation({ summary: 'Delete a chat' })
    @ApiResponse({
        status: 200,
        description: 'Chat deleted successfully'
    })
    @ApiResponse({
        status: 404,
        description: 'Chat not found'
    })
    async deleteChat(
        @Req() req: Request & { client: Client },
        @Param('id') id: string
    ) {
        return this.chatService.deleteChat(req.client.id, id);
    }
}