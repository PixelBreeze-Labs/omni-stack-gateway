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
    ParseIntPipe,
    BadRequestException,
    UploadedFiles,
    UseInterceptors,
    Logger
} from '@nestjs/common';
import {ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam, ApiConsumes} from '@nestjs/swagger';
import { CheckinSubmissionService } from '../services/checkin-submission.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';
import { SubmitCheckinFormDto, UpdateSubmissionStatusDto, ListCheckinSubmissionsDto } from '../dtos/checkin-form.dto';
import { SubmissionStatus } from '../schemas/checkin-submission.schema';
import {FileFieldsInterceptor} from "@nestjs/platform-express";

@ApiTags('Check-in Form Submissions')
@Controller('checkin-submissions')
export class CheckinSubmissionController {
    private readonly logger = new Logger(CheckinSubmissionController.name);

    constructor(
        private readonly checkinSubmissionService: CheckinSubmissionService
    ) {}

    /**
     * Submit a check-in form
     */
    @Post(':shortCode')
    @ApiConsumes('multipart/form-data')
    @UseInterceptors(FileFieldsInterceptor([
        { name: 'files', maxCount: 10 }
    ]))
    @ApiOperation({ summary: 'Submit a check-in form' })
    @ApiResponse({
        status: 201,
        description: 'The check-in form has been submitted successfully'
    })
    @ApiParam({ name: 'shortCode', description: 'The short code of the form configuration' })
    async submit(
        @Param('shortCode') shortCode: string,
        @Body() submitDto: SubmitCheckinFormDto,
        @UploadedFiles() uploadedFiles: { files?: Express.Multer.File[] }
    ) {
        try {
            // Log the raw data for debugging
            this.logger.debug(`Raw submitDto: ${JSON.stringify(submitDto)}`);

            // Parse formData from string to object if needed
            if (typeof submitDto.formData === 'string') {
                try {
                    submitDto.formData = JSON.parse(submitDto.formData);
                    this.logger.debug(`Parsed formData: ${JSON.stringify(submitDto.formData)}`);
                } catch (error) {
                    this.logger.error(`Error parsing formData: ${error.message}`);
                    submitDto.formData = { rawInput: submitDto.formData };
                }
            } else if (!submitDto.formData) {
                // Ensure formData is always an object
                submitDto.formData = {};
            }

            // Parse specialRequests from string to array if needed
            if (typeof submitDto.specialRequests === 'string') {
                try {
                    const parsedRequests = JSON.parse(submitDto.specialRequests);
                    submitDto.specialRequests = Array.isArray(parsedRequests) ? parsedRequests : [parsedRequests];
                    this.logger.debug(`Parsed specialRequests: ${JSON.stringify(submitDto.specialRequests)}`);
                } catch (error) {
                    this.logger.error(`Error parsing specialRequests: ${error.message}`);
                    submitDto.specialRequests = [submitDto.specialRequests];
                }
            } else if (!submitDto.specialRequests) {
                // Ensure specialRequests is always an array
                submitDto.specialRequests = [];
            }

            // Handle boolean conversion for needsParkingSpot
            if (typeof submitDto.needsParkingSpot === 'string') {
                submitDto.needsParkingSpot = submitDto.needsParkingSpot.toLowerCase() === 'true';
            }

            // Log the processed data
            this.logger.debug(`Processed submitDto: ${JSON.stringify(submitDto)}`);

            // Get the files array (or empty array if none)
            const files = uploadedFiles?.files || [];

            return this.checkinSubmissionService.submit(shortCode, submitDto, files);
        } catch (error) {
            this.logger.error(`Submit error: ${error.message}`, error.stack);
            if (error instanceof BadRequestException) {
                throw error;
            }
            throw new BadRequestException(`Failed to submit check-in form: ${error.message}`);
        }
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
        return this.checkinSubmissionService.getStats(req.client.id, { formConfigId });
    }


    /**
     * Get form details by short code (ADMIN)
     */
    @Get('form/:shortCode')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get check-in form details by short code' })
    @ApiResponse({
        status: 200,
        description: 'Returns the check-in form configuration details'
    })
    @ApiParam({ name: 'shortCode', description: 'The short code of the form configuration' })
    async getFormDetails(
        @Param('shortCode') shortCode: string,
        @Req() req: Request & { client: Client },
    ) {
        return this.checkinSubmissionService.getFormDetails(shortCode, req.client.id);
    }


    /**
     * Get form details by short code with full property and booking data (public)
     */
    @Get('form/:shortCode/public')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get detailed public check-in form by short code' })
    @ApiResponse({
        status: 200,
        description: 'Returns the check-in form configuration with property and booking details'
    })
    @ApiParam({ name: 'shortCode', description: 'The short code of the form configuration' })
    async getFormDetailsPublic(
        @Req() req: Request & { client: Client },
        @Param('shortCode') shortCode: string
    ) {
        return this.checkinSubmissionService.getFormDetailsPublic(shortCode, req.client.id);
    }
}