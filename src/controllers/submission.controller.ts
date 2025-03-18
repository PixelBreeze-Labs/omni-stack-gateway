// src/controllers/submission.controller.ts
import { ClientAuthGuard } from "../guards/client-auth.guard";
import { Body, Controller, Get, Post, Req, UseGuards, Query } from "@nestjs/common";
import { CreateSubmissionDto, ListSubmissionDto } from "../dtos/submission.dto";
import { Client } from "../schemas/client.schema";
import { SubmissionService } from "../services/submission.service";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiQuery } from '@nestjs/swagger';

@ApiTags('Submissions')
@ApiBearerAuth()
@Controller('submissions')
@UseGuards(ClientAuthGuard)
export class SubmissionController {
    constructor(private submissionService: SubmissionService) {}

    @ApiOperation({ summary: 'Create a new submission' })
    @ApiResponse({ status: 201, description: 'Submission created successfully' })
    @ApiBody({ type: CreateSubmissionDto })
    @Post()
    async create(
        @Req() req: Request & { client: Client },
        @Body() createSubmissionDto: CreateSubmissionDto,
    ) {
        return this.submissionService.create({
            ...createSubmissionDto,
            clientId: req.client.id,
            status: 'pending'
        });
    }

    @ApiOperation({ summary: 'Get all submissions' })
    @ApiQuery({ type: ListSubmissionDto })
    @ApiResponse({ status: 200, description: 'Return all submissions' })
    @Get()
    async findAll(
        @Query() query: ListSubmissionDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.submissionService.findAll({
            ...query,
            clientId: req.client.id
        });
    }


    @Post('contact')
    async createContact(
        @Req() req: Request & { client: Client },
        @Body() contactData: { firstName: string; lastName: string; email: string; phone?: string; content: string }
    ) {
        // Get IP address from headers only
        const forwardedFor = req.headers['x-forwarded-for'];
        const ipAddress = forwardedFor ?
            (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) :
            '';

        return this.submissionService.createContactSubmission({
            ...contactData,
            clientId: req.client.id,
            userAgent: req.headers['user-agent'] as string,
            ipAddress
        });
    }
}