// src/controllers/business-registration.controller.ts
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BusinessRegistrationDto } from '../dtos/business-registration.dto';
import { BusinessRegistrationService } from '../services/business-registration.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';
import { Get, Query } from '@nestjs/common';
import { VerificationService } from '../services/verification.service';

interface VerificationResponse {
    status: 'success' | 'already_verified' | 'expired' | 'invalid';
    message: string;
    userId?: string;
}

@ApiTags('Business Registration')
@ApiBearerAuth()
@Controller('business-registration')
@UseGuards(ClientAuthGuard)
export class BusinessRegistrationController {
    constructor(
        private businessRegistrationService: BusinessRegistrationService,
        private verificationService: VerificationService
    ) {}

    @ApiOperation({ summary: 'Register new business with trial account' })
    @ApiResponse({ status: 201, description: 'Business registered successfully' })
    @Post('trial')
    async registerTrialBusiness(
        @Req() req: Request & { client: Client },
        @Body() registrationData: BusinessRegistrationDto
    ) {
        return this.businessRegistrationService.registerTrialBusiness({
            ...registrationData,
            clientId: req.client.id
        });
    }

    @ApiOperation({ summary: 'Verify email address' })
    @ApiResponse({ status: 200, description: 'Email verified successfully' })
    @ApiResponse({ status: 404, description: 'Invalid or expired token' })
    @Get('verify-email')
    async verifyEmail(@Query('token') token: string): Promise<VerificationResponse> {
        return this.verificationService.verifyEmail(token);
    }
}