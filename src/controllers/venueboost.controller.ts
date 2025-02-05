// src/controllers/venueboost.controller.ts
import { Controller, Get, Post, Query, Param, Body } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { VenueBoostService } from '../services/venueboost.service';

@ApiTags('VenueBoost')
@Controller('vb')
export class VenueBoostController {
    constructor(private readonly venueBoostService: VenueBoostService) {}

    @Get('members')
    @ApiOperation({ summary: 'List members' })
    @ApiResponse({ status: 200, description: 'Returns members list with pagination' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'per_page', required: false })
    @ApiQuery({ name: 'registration_source', required: false, enum: ['from_my_club', 'landing_page'] })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'status', required: false })
    async listMembers(
        @Query('page') page?: number,
        @Query('per_page') perPage?: number,
        @Query('registration_source') registrationSource?: 'from_my_club' | 'landing_page',
        @Query('search') search?: string,
        @Query('status') status?: string
    ) {
        return await this.venueBoostService.listMembers({
            page,
            per_page: perPage,
            registration_source: registrationSource,
            search,
            status
        });
    }

    @Post('members/:id/approve')
    @ApiOperation({ summary: 'Approve member' })
    @ApiResponse({ status: 200, description: 'Member approved successfully' })
    async approveMember(@Param('id') id: number) {
        return await this.venueBoostService.acceptMember(id);
    }

    @Post('members/:id/reject')
    @ApiOperation({ summary: 'Reject member' })
    @ApiResponse({ status: 200, description: 'Member rejected successfully' })
    async rejectMember(
        @Param('id') id: number,
        @Body('rejection_reason') reason?: string
    ) {
        return await this.venueBoostService.rejectMember(id, reason);
    }

    @Get('members/export')
    @ApiOperation({ summary: 'Export members' })
    @ApiResponse({ status: 200, description: 'Returns members export file' })
    @ApiQuery({ name: 'registration_source', required: false, enum: ['from_my_club', 'landing_page'] })
    async exportMembers(
        @Query('registration_source') registrationSource?: 'from_my_club' | 'landing_page'
    ) {
        return await this.venueBoostService.exportMembers(registrationSource);
    }

    // --- Feedback Endpoints ---

    @Get('feedback')
    @ApiOperation({ summary: 'List customer feedback' })
    @ApiResponse({ status: 200, description: 'Returns customer feedback list with pagination' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'per_page', required: false })
    @ApiQuery({ name: 'search', required: false })
    async listFeedback(
        @Query('page') page?: number,
        @Query('per_page') perPage?: number,
        @Query('search') search?: string,
    ) {
        return await this.venueBoostService.listFeedback({ page, per_page: perPage, search });
    }

    @Get('feedback/:id')
    @ApiOperation({ summary: 'Get customer feedback by ID' })
    @ApiResponse({ status: 200, description: 'Returns feedback detail' })
    async getFeedbackById(@Param('id') id: number) {
        return await this.venueBoostService.getFeedbackById(id);
    }
}