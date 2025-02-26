import { Controller, Post, Body, Get, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MagicLinkService } from '../services/magic-link.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';
import { MagicLinkResponse } from '../interfaces/magic-link.interface';

@ApiTags('Magic Link')
@Controller('magic-link')
export class MagicLinkController {
    constructor(private magicLinkService: MagicLinkService) {}

    /**
     * Send a magic link to the provided email
     */
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Send a magic link to the specified email' })
    @ApiResponse({ status: 200, description: 'Magic link sent successfully' })
    @Post('send')
    async sendMagicLink(@Body() body: { email: string }): Promise<{ success: boolean; message: string }> {
        return this.magicLinkService.sendMagicLinkByEmail(body.email);
    }

    /**
     * Verify a magic link token and return authentication data
     */
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Verify a magic link token' })
    @ApiResponse({ status: 200, description: 'Token verified successfully' })
    @ApiResponse({ status: 400, description: 'Invalid, expired, or used token' })
    @Get('verify')
    async verifyMagicLink(@Query('token') token: string): Promise<MagicLinkResponse> {
        return this.magicLinkService.verifyMagicLink(token);
    }

}