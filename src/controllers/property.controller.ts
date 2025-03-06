// src/controllers/property.controller.ts
import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    UseGuards,
    Req,
    Query
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PropertyService } from '../services/property.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';

@ApiTags('Properties')
@ApiBearerAuth()
@Controller('properties')
@UseGuards(ClientAuthGuard)
export class PropertyController {
    constructor(
        private readonly propertyService: PropertyService
    ) {}

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