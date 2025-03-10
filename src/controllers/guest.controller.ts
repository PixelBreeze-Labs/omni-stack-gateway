// src/controllers/guest.controller.ts
import { Controller, Get, Query, Req, UseGuards, Delete, Param } from '@nestjs/common';
import { GuestService } from '../services/guest.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { ListGuestDto } from '../dtos/guest.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
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

    /**
     * Delete a guest
     */
    @Delete(':id')
    @ApiOperation({ summary: 'Delete a guest' })
    @ApiParam({ name: 'id', description: 'Guest ID' })
    @ApiQuery({ name: 'forceDelete', required: false, type: Boolean, description: 'Force delete even if guest has bookings' })
    @ApiQuery({ name: 'deleteUser', required: false, type: Boolean, description: 'Also delete the associated user' })
    @ApiResponse({ status: 200, description: 'Guest deleted successfully' })
    @ApiResponse({ status: 400, description: 'Invalid request' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Guest not found' })
    async deleteGuest(
        @Req() req: Request & { client: Client },
        @Param('id') id: string,
        @Query('forceDelete') forceDelete?: string,
        @Query('deleteUser') deleteUser?: string
    ) {
        const options = {
            forceDelete: forceDelete === 'true',
            deleteUser: deleteUser === 'true'
        };

        return this.guestService.deleteGuest(id, req.client.id, options);
    }
}