// src/controllers/checkin-form-config.controller.ts
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
import { CheckinFormConfigService } from '../services/checkin-form-config.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';
import { CreateCheckinFormConfigDto, UpdateCheckinFormConfigDto } from '../dtos/checkin-form.dto';

@ApiTags('Check-in Form Configurations')
@ApiBearerAuth()
@Controller('checkin-forms')
@UseGuards(ClientAuthGuard)
export class CheckinFormConfigController {
    constructor(
        private readonly checkinFormConfigService: CheckinFormConfigService
    ) {}

    /**
     * Create a new check-in form configuration
     */
    @Post()
    @ApiOperation({ summary: 'Create a new check-in form configuration' })
    @ApiResponse({
        status: 201,
        description: 'The check-in form configuration has been created successfully'
    })
    async create(
        @Req() req: Request & { client: Client },
        @Body() createDto: CreateCheckinFormConfigDto
    ) {
        return this.checkinFormConfigService.create(req.client.id, createDto);
    }

    /**
     * Get all check-in form configurations with filtering and pagination
     */
    @Get()
    @ApiOperation({ summary: 'Get all check-in form configurations with filtering and pagination' })
    @ApiResponse({
        status: 200,
        description: 'Returns a list of check-in form configurations'
    })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'search', required: false, type: String })
    @ApiQuery({ name: 'propertyId', required: false, type: String })
    @ApiQuery({ name: 'isActive', required: false, type: Boolean })
    async findAll(
        @Req() req: Request & { client: Client },
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
        @Query('propertyId') propertyId?: string,
        @Query('isActive') isActive?: boolean
    ) {
        return this.checkinFormConfigService.findAll(req.client.id, {
            page,
            limit,
            search,
            propertyId,
            isActive
        });
    }

    /**
     * Get a check-in form configuration by ID
     */
    @Get('id/:id')
    @ApiOperation({ summary: 'Get a check-in form configuration by ID' })
    @ApiResponse({
        status: 200,
        description: 'Returns a check-in form configuration by ID'
    })
    @ApiParam({ name: 'id', description: 'The MongoDB ID of the form configuration' })
    async findById(
        @Req() req: Request & { client: Client },
        @Param('id') id: string
    ) {
        return this.checkinFormConfigService.findById(req.client.id, id);
    }

    /**
     * Get a check-in form configuration by short code
     */
    @Get(':shortCode')
    @ApiOperation({ summary: 'Get a check-in form configuration by short code' })
    @ApiResponse({
        status: 200,
        description: 'Returns a check-in form configuration by short code'
    })
    @ApiParam({ name: 'shortCode', description: 'The short code of the form configuration' })
    async findByShortCode(@Param('shortCode') shortCode: string) {
        return this.checkinFormConfigService.findByShortCode(shortCode);
    }

    /**
     * Update a check-in form configuration
     */
    @Patch(':shortCode')
    @ApiOperation({ summary: 'Update a check-in form configuration' })
    @ApiResponse({
        status: 200,
        description: 'The check-in form configuration has been updated successfully'
    })
    @ApiParam({ name: 'shortCode', description: 'The short code of the form configuration' })
    async update(
        @Req() req: Request & { client: Client },
        @Param('shortCode') shortCode: string,
        @Body() updateDto: UpdateCheckinFormConfigDto
    ) {
        return this.checkinFormConfigService.update(req.client.id, shortCode, updateDto);
    }

    /**
     * Soft delete a check-in form configuration
     */
    @Delete(':shortCode')
    @ApiOperation({ summary: 'Soft delete a check-in form configuration' })
    @ApiResponse({
        status: 200,
        description: 'The check-in form configuration has been deactivated successfully'
    })
    @ApiParam({ name: 'shortCode', description: 'The short code of the form configuration' })
    async softDelete(
        @Req() req: Request & { client: Client },
        @Param('shortCode') shortCode: string
    ) {
        return this.checkinFormConfigService.softDelete(req.client.id, shortCode);
    }

    /**
     * Hard delete a check-in form configuration (admin only)
     */
    @Delete(':shortCode/permanent')
    @ApiOperation({ summary: 'Permanently delete a check-in form configuration (admin only)' })
    @ApiResponse({
        status: 200,
        description: 'The check-in form configuration has been permanently deleted'
    })
    @ApiParam({ name: 'shortCode', description: 'The short code of the form configuration' })
    async hardDelete(
        @Req() req: Request & { client: Client },
        @Param('shortCode') shortCode: string
    ) {
        return this.checkinFormConfigService.hardDelete(req.client.id, shortCode);
    }
}