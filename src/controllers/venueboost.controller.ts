// src/controllers/venueboost.controller.ts
import {
    Controller,
    Req,
    Get,
    Post,
    Query,
    Param,
    Body,
    UseGuards,
    NotFoundException,
    UnauthorizedException
} from '@nestjs/common';
import {ApiOperation, ApiResponse, ApiTags, ApiQuery, ApiBearerAuth, ApiBody} from '@nestjs/swagger';
import { VenueBoostService } from '../services/venueboost.service';
import {ClientAuthGuard} from "../guards/client-auth.guard";
import {Client} from "../schemas/client.schema";
import {InjectModel} from "@nestjs/mongoose";
import {User} from "../schemas/user.schema";
import {Model} from "mongoose";

@ApiTags('VenueBoost')
@ApiBearerAuth()
@Controller('vb')
@UseGuards(ClientAuthGuard)
export class VenueBoostController {
    constructor(
        private readonly venueBoostService: VenueBoostService,
        @InjectModel(User.name) private userModel: Model<User>,
    ) {}

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

    @Get('feedback/stats')
    @ApiOperation({ summary: 'Get feedback statistics' })
    @ApiResponse({
        status: 200,
        description: 'Returns feedback statistics including averages and trends'
    })
    async getFeedbackStats() {
        return await this.venueBoostService.getFeedbackStats();
    }

    // --- Store Endpoints ---

    @ApiOperation({ summary: 'List connected VenueBoost stores' })
    @ApiResponse({ status: 200, description: 'Returns list of stores' })
    @Get('stores')
    async listStores(@Req() req: Request & { client: Client }) {
        return this.venueBoostService.listStores(req.client.id);
    }

    @ApiOperation({ summary: 'Connect/disconnect store with VenueBoost' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                vbId: { type: 'number' },
                osId: { type: 'string' },
                type: { type: 'string', enum: ['connect', 'disconnect'] }
            }
        }
    })
    @ApiResponse({ status: 200, description: 'Store connected/disconnected' })
    @Post('stores/connect-disconnect')
    async connectDisconnectStore(
        @Body() body: { vbId: number; osId: string; type: 'connect' | 'disconnect' },
        @Req() req: Request & { client: Client }
    ) {
        return this.venueBoostService.connectDisconnectStore({
            ...body,
            clientId: req.client.id
        });
    }

    @ApiOperation({ summary: 'Connect client with VenueBoost' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                venueShortCode: { type: 'string' }
            }
        }
    })
    @ApiResponse({ status: 200, description: 'Client connected with VenueBoost' })
    @Post('connect')
    async connect(
        @Body() body: { venueShortCode: string, webhookApiKey: string },
        @Req() req: Request & { client: Client }
    ) {
        return this.venueBoostService.connectVenueBoost(req.client.id, body.venueShortCode, body.webhookApiKey);
    }

    // Add this method to the VenueBoostController
    @ApiOperation({ summary: 'Change user password in VenueBoost' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                userId: { type: 'string' },
                newPassword: { type: 'string' }
            },
            required: ['userId', 'newPassword']
        }
    })
    @ApiResponse({ status: 200, description: 'Password changed successfully' })
    @Post('change-password')
    async changePassword(
        @Body() body: { userId: string; newPassword: string },
        @Req() req: Request & { client: Client }
    ) {
        // First find the user
        const user = await this.userModel.findById(body.userId);

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Verify that the user belongs to the authenticated client
        if (!user.client_ids.includes(req.client.id)) {
            throw new UnauthorizedException('User does not belong to this client');
        }

        // Call VenueBoost service to change the password
        const result = await this.venueBoostService.changePassword(user, body.newPassword);

        return {
            success: result.success,
            message: result.message
        };
    }
}