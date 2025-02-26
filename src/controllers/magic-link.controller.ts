import { Controller, Post, Body, Get, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MagicLinkService } from '../services/magic-link.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';

@ApiTags('Magic Link')
@Controller('magic-link')
export class MagicLinkController {
    constructor(private magicLinkService: MagicLinkService) {}

    /**
     * Send a magic link to the provided email
     */
    @ApiOperation({ summary: 'Send a magic link to the specified email' })
    @ApiResponse({ status: 200, description: 'Magic link sent successfully' })
    @Post('send')
    async sendMagicLink(@Body() body: { email: string }) {
        return this.magicLinkService.sendMagicLinkByEmail(body.email);
    }

    /**
     * Verify a magic link token and return authentication data
     */
    @ApiOperation({ summary: 'Verify a magic link token' })
    @ApiResponse({ status: 200, description: 'Token verified successfully' })
    @ApiResponse({ status: 400, description: 'Invalid, expired, or used token' })
    @Get('verify')
    async verifyMagicLink(@Query('token') token: string) {
        return this.magicLinkService.verifyMagicLink(token);
    }

    /**
     * Send a magic link after subscription
     * This endpoint requires client authentication
     */
    @ApiOperation({ summary: 'Send a magic link after subscription completion' })
    @ApiResponse({ status: 200, description: 'Magic link sent successfully' })
    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Post('send-after-subscription')
    async sendAfterSubscription(
        @Req() req: Request & { client: Client },
        @Body() body: { businessId: string }
    ) {
        return this.magicLinkService.sendMagicLinkAfterSubscription(
            body.businessId,
            req.client.id
        );
    }
}