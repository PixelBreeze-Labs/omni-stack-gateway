// src/controllers/checkin-submission.controller.ts
import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Patch,
    Delete,
    UseGuards,
    Req,
    Query,
    DefaultValuePipe,
    ParseIntPipe
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { CheckinSubmissionService } from '../services/checkin-submission.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';
import { SubmitCheckinFormDto, UpdateSubmissionStatusDto, ListCheckinSubmissionsDto } from '../dtos/checkin-form.dto';
import { SubmissionStatus } from '../schemas/checkin-submission.schema';

@ApiTags('Check-in Form Submissions')
@Controller('checkin-submissions')
export class CheckinSubmissionController {
    constructor(
        private readonly checkinSubmissionService: CheckinSubmissionService
    ) {}

    /**
     * Submit a check-in form
     */
    @Post(':shortCode')
    @ApiOperation({ summary: 'Submit a check-in form' })
    @ApiResponse({
        status: 201,
        description: 'The check-in form has been submitted successfully'
    })
    @ApiParam({ name: 'shortCode', description: 'The short code of the form configuration' })
    async submit(
        @Param('shortCode') shortCode: string,
        @Body() submitDto: SubmitCheckinFormDto
    ) {
        return this.checkinSubmissionService.submit(shortCode, submitDto);
    }

    /**
     * Get all submissions with filtering and pagination (requires auth)
     */
    @Get()
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all check-in form submissions' })
    @ApiResponse({
        status: 200,
        description: 'Returns a list of check-in form submissions'
    })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'formConfigId', required: false, type: String })
    @ApiQuery({ name: 'propertyId', required: false, type: String })
    @ApiQuery({ name: 'guestId', required: false, type: String })
    @ApiQuery({ name: 'email', required: false, type: String })
    @ApiQuery({ name: 'status', required: false, enum: SubmissionStatus })
    async findAll(
        @Req() req: Request & { client: Client },
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('formConfigId') formConfigId?: string,
        @Query('propertyId') propertyId?: string,
        @Query('guestId') guestId?: string,
        @Query('email') email?: string,
        @Query('status') status?: SubmissionStatus
    ) {
        const options: ListCheckinSubmissionsDto = {
            page,
            limit,
            formConfigId,
            propertyId,
            guestId,
            email,
            status
        };

        return this.checkinSubmissionService.findAll(req.client.id, options);
    }

    /**
     * Get a submission by ID (requires auth)
     */
    @Get(':id')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get a check-in form submission by ID' })
    @ApiResponse({
        status: 200,
        description: 'Returns a check-in form submission by ID'
    })
    @ApiParam({ name: 'id', description: 'The MongoDB ID of the submission' })
    async findById(
        @Req() req: Request & { client: Client },
        @Param('id') id: string
    ) {
        return this.checkinSubmissionService.findById(req.client.id, id);
    }

    /**
     * Update submission status (requires auth)
     */
    @Patch(':id/status')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update a check-in form submission status' })
    @ApiResponse({
        status: 200,
        description: 'The check-in form submission status has been updated successfully'
    })
    @ApiParam({ name: 'id', description: 'The MongoDB ID of the submission' })
    async updateStatus(
        @Req() req: Request & { client: Client },
        @Param('id') id: string,
        @Body() updateDto: UpdateSubmissionStatusDto
    ) {
        return this.checkinSubmissionService.updateStatus(req.client.id, id, updateDto);
    }

    /**
     * Delete a submission (requires auth)
     */
    @Delete(':id')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete a check-in form submission' })
    @ApiResponse({
        status: 200,
        description: 'The check-in form submission has been deleted successfully'
    })
    @ApiParam({ name: 'id', description: 'The MongoDB ID of the submission' })
    async delete(
        @Req() req: Request & { client: Client },
        @Param('id') id: string
    ) {
        return this.checkinSubmissionService.delete(req.client.id, id);
    }

    /**
     * Get submission stats for a form config (requires auth)
     */
    @Get('stats/:formConfigId')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get submission stats for a form configuration' })
    @ApiResponse({
        status: 200,
        description: 'Returns submission stats for a form configuration'
    })
    @ApiParam({ name: 'formConfigId', description: 'The MongoDB ID of the form configuration' })
    async getStatsForForm(
        @Req() req: Request & { client: Client },
        @Param('formConfigId') formConfigId: string
    ) {
        return this.checkinSubmissionService.getStatsForForm(req.client.id, formConfigId);
    }
}