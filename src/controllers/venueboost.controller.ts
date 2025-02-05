// src/controllers/venueboost.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { VenueBoostService } from '../services/venueboost.service';

@ApiTags('VenueBoost')
@Controller('vb')
export class VenueBoostController {
    constructor(private readonly venueBoostService: VenueBoostService) {}

    @Get('members')
    @ApiOperation({ summary: 'List members from VenueBoost' })
    @ApiResponse({ status: 200, description: 'Returns list of members' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'per_page', required: false, type: Number })
    @ApiQuery({
        name: 'registration_source',
        required: false,
        enum: ['from_my_club', 'landing_page']
    })
    async listMembers(
        @Query('page') page?: number,
        @Query('per_page') perPage?: number,
        @Query('registration_source') registrationSource?: 'from_my_club' | 'landing_page'
    ) {
        return await this.venueBoostService.listMembers({
            page,
            per_page: perPage,
            registration_source: registrationSource
        });
    }
}