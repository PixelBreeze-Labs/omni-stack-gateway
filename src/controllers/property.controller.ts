// src/controllers/property.controller.ts
import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    UseGuards,
    Req,
    Query,
    DefaultValuePipe,
    ParseIntPipe
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PropertyService } from '../services/property.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';
import { PropertyStatus, PropertyType } from '../schemas/property.schema';

@ApiTags('Properties')
@ApiBearerAuth()
@Controller('properties')
@UseGuards(ClientAuthGuard)
export class PropertyController {
    constructor(
        private readonly propertyService: PropertyService
    ) {}

    /**
     * Get all properties with filtering and pagination
     */
    @Get()
    @ApiOperation({ summary: 'Get all properties with filtering and pagination' })
    @ApiResponse({
        status: 200,
        description: 'Returns a list of properties'
    })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'search', required: false, type: String })
    @ApiQuery({ name: 'status', required: false, enum: PropertyStatus })
    @ApiQuery({ name: 'type', required: false, enum: PropertyType })
    async getProperties(
        @Req() req: Request & { client: Client },
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
        @Query('status') status?: PropertyStatus,
        @Query('type') type?: PropertyType
    ) {
        return this.propertyService.findAll(req.client.id, {
            page,
            limit,
            search,
            status,
            type
        });
    }

    /**
     * Get a property by ID
     */
    @Get(':id')
    @ApiOperation({ summary: 'Get a property by ID' })
    @ApiResponse({
        status: 200,
        description: 'Returns a property by ID'
    })
    async getPropertyById(
        @Req() req: Request & { client: Client },
        @Param('id') id: string
    ) {
        return this.propertyService.findById(req.client.id, id);
    }

    /**
     * Sync properties from VenueBoost
     */
    @Post('sync')
    @ApiOperation({ summary: 'Sync properties from VenueBoost' })
    @ApiResponse({
        status: 200,
        description: 'Properties synced successfully'
    })
    async syncProperties(@Req() req: Request & { client: Client }) {
        return this.propertyService.syncPropertiesFromVenueBoost(req.client.id);
    }
}