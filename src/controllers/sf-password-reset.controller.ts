// src/controllers/sf-password-reset.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { SnapfoodAdminService } from '../services/snapfood-admin.service';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

@ApiTags('SF Password Reset')
@Controller('api/sf-password-reset')
export class PasswordResetController {
    constructor(private readonly snapfoodAdminService: SnapfoodAdminService) {}

    @ApiOperation({ summary: 'Send password reset email' })
    @ApiBody({ description: 'Password reset data' })
    @ApiResponse({ status: 200, description: 'Email sent' })
    @Post('email')
    async sendPasswordResetEmail(@Body() data: any) {
        return await this.snapfoodAdminService.forward(
            'external/password-reset/email',
            'POST',
            data
        );
    }
}