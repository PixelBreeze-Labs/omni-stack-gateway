// src/controllers/guest.controller.ts
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { GuestService } from '../services/guest.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { ListGuestDto } from '../dtos/guest.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Client } from '../schemas/client.schema';
import { GuestListResponse } from '../types/guest.types';

@ApiTags('Guests')
@Controller('guests')
@UseGuards(ClientAuthGuard)
export class GuestController {
    constructor(
        private guestService: GuestService,
    ) {}

    @ApiOperation({ summary: 'Get all guests' })
    @ApiQuery({ type: ListGuestDto })
    @ApiResponse({ status: 200, description: 'List of guests' })
    @Get()
    async findAll(
        @Query() query: ListGuestDto,
        @Req() req: Request & { client: Client }
    ): Promise<GuestListResponse> {
        return this.guestService.findAll({ ...query, clientIds: [req.client.id] });
    }

    @ApiOperation({ summary: 'Search guests by query' })
    @ApiQuery({ name: 'query', type: String, description: 'Search query for guests' })
    @ApiResponse({ status: 200, description: 'List of matching guests' })
    @Get('search')
    async search(
        @Req() req: Request & { client: Client },
        @Query('query') searchQuery: string,
    ): Promise<GuestListResponse> {
        const queryDto: ListGuestDto = {
            search: searchQuery,
            page: 1,
            limit: 10
        };

        return this.guestService.findAll({
            ...queryDto,
            clientIds: [req.client.id]
        });
    }
}