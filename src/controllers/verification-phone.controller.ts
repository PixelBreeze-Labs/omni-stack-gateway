// src/controllers/verification.controller.ts
import { Controller, Post, Get, Body, Param, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { TwilioVerificationService } from '../services/twilio-verification.service';
import {ApiTags, ApiOperation, ApiBody, ApiResponse, ApiHeader, ApiParam, ApiBearerAuth} from '@nestjs/swagger';
import {ClientAuthGuard} from "../guards/client-auth.guard";



@ApiTags('VerificationPhone')
@ApiBearerAuth()
@Controller('verification-phone')
@UseGuards(ClientAuthGuard)
export class VerificationController {
    constructor(private readonly twilioService: TwilioVerificationService) {}

    @ApiOperation({ summary: 'Send verification code' })
    @ApiHeader({
        name: 'x-api-key',
        description: 'API Key for authentication',
        required: true
    })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                phone: { type: 'string', example: '+355123456789' },
                user_id: { type: 'number', example: 123 }
            },
            required: ['phone', 'user_id']
        }
    })
    @ApiResponse({ status: 200, description: 'Verification code sent successfully' })
    @ApiResponse({ status: 400, description: 'Bad request' })
    @Post('send-code')
    async sendVerificationCode(@Body() data: { phone: string; user_id: number }) {
        if (!data.phone || !data.user_id) {
            throw new HttpException('Phone number and user ID are required', HttpStatus.BAD_REQUEST);
        }

        // Format phone number properly
        let formattedPhone = data.phone;
        if (!formattedPhone.startsWith('+')) {
            if (formattedPhone.startsWith('0')) { // Albanian format
                formattedPhone = '+355' + formattedPhone.substring(1);
            } else if (/^[2-9]\d{2}[2-9]\d{2}\d{4}$/.test(formattedPhone)) { // US format
                formattedPhone = '+1' + formattedPhone;
            }
        }

        const result = await this.twilioService.sendVerificationCode(formattedPhone, data.user_id);

        if (!result.success) {
            throw new HttpException(result.error || 'Failed to send verification code', HttpStatus.BAD_REQUEST);
        }

        return {
            success: true,
            message_id: result.messageId
        };
    }

    @ApiOperation({ summary: 'Verify code' })
    @ApiHeader({
        name: 'x-api-key',
        description: 'API Key for authentication',
        required: true
    })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                phone: { type: 'string', example: '+355123456789' },
                code: { type: 'number', example: '123456' }
            },
            required: ['phone', 'code']
        }
    })
    @ApiResponse({ status: 200, description: 'Code verification result' })
    @ApiResponse({ status: 400, description: 'Bad request' })
    @Post('verify-code')
    async verifyCode(@Body() data: { phone: string; code: number }) {
        if (!data.phone || !data.code) {
            throw new HttpException('Phone number and verification code are required', HttpStatus.BAD_REQUEST);
        }

        // Format phone number properly
        let formattedPhone = data.phone;
        if (!formattedPhone.startsWith('+')) {
            if (formattedPhone.startsWith('0')) { // Albanian format
                formattedPhone = '+355' + formattedPhone.substring(1);
            } else if (/^[2-9]\d{2}[2-9]\d{2}\d{4}$/.test(formattedPhone)) { // US format
                formattedPhone = '+1' + formattedPhone;
            }
        }

        const result = await this.twilioService.verifyCode(formattedPhone, data.code);

        if (!result.success) {
            throw new HttpException(result.error || 'Failed to verify code', HttpStatus.BAD_REQUEST);
        }

        return {
            success: true,
            valid: result.valid
        };
    }

    @ApiOperation({ summary: 'Get verification status' })
    @ApiHeader({
        name: 'x-api-key',
        description: 'API Key for authentication',
        required: true
    })
    @ApiParam({
        name: 'messageId',
        description: 'Verification message ID',
        required: true,
        type: String
    })
    @ApiResponse({ status: 200, description: 'Verification status' })
    @ApiResponse({ status: 404, description: 'Verification not found' })
    @Get('status/:messageId')
    async getVerificationStatus(@Param('messageId') messageId: string) {
        try {
            const verification = await this.twilioService.getVerificationStatus(messageId);
            return {
                success: true,
                verification: {
                    status: verification.status,
                    phoneNumber: verification.phoneNumber,
                    snapfoodUserId: verification.snapfoodUserId,
                    expiresAt: verification.expiresAt,
                    verifiedAt: verification.verifiedAt
                }
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to get verification status', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}