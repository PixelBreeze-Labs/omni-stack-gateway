// src/controllers/communications.controller.ts
import {
    Controller,
    Post,
    Get,
    Body,
    Param,
    UseGuards,
    BadRequestException,
    Request,
} from '@nestjs/common';
import { CommunicationsService, CommunicationResponse, SendCommunicationParams } from '../services/communications.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { ClientAuthGuard } from "../guards/client-auth.guard";

// DTOs
class SendCommunicationDto implements SendCommunicationParams {
    type: 'EMAIL' | 'SMS';
    recipient: string;
    subject?: string;
    message: string;
    metadata?: Record<string, any>;
    template?: string;
}

@ApiTags('communications')
@Controller('communications')
export class CommunicationsController {
    constructor(private readonly communicationsService: CommunicationsService) {}

    @Post('send')
    @UseGuards(ClientAuthGuard)
    @ApiOperation({ summary: 'Send a communication (email or SMS)' })
    @ApiResponse({ status: 200, description: 'Communication sent successfully' })
    @ApiResponse({ status: 400, description: 'Invalid input parameters' })
    @ApiResponse({ status: 500, description: 'Server error' })
    async sendCommunication(
        @Body() sendCommunicationDto: SendCommunicationDto
    ): Promise<CommunicationResponse> {
        const { type, recipient, subject, message, metadata, template } = sendCommunicationDto;

        // Validate required fields
        if (!type || !recipient || !message) {
            throw new BadRequestException('Type, recipient, and message are required');
        }

        // Validate type
        if (!['EMAIL', 'SMS'].includes(type)) {
            throw new BadRequestException('Type must be EMAIL or SMS');
        }

        // Additional validation for email
        if (type === 'EMAIL' && !subject) {
            throw new BadRequestException('Subject is required for email communications');
        }

        // Send the communication
        return this.communicationsService.sendCommunication({
            type,
            recipient,
            subject,
            message,
            metadata,
            template
        });
    }
}