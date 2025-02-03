// src/controllers/location.controller.ts
import { Controller, Post, Get, Query, UseGuards } from '@nestjs/common';
import { LocationSyncService } from '../../services/location-sync.service';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiQuery } from '@nestjs/swagger';
import { Country } from '../../schemas/country.schema';
import { State } from '../../schemas/state.schema';
import { City } from '../../schemas/city.schema';

@ApiTags('Locations')
@Controller('locations')
export class LocationController {
    constructor(private readonly locationSyncService: LocationSyncService) {}

    @ApiOperation({ summary: 'Sync all location data' })
    @ApiResponse({ status: 200, description: 'Location data synchronized successfully' })
    @Post('sync')
    async syncLocations() {
        await this.locationSyncService.syncAll();
        return { message: 'Location sync completed successfully' };
    }

    @ApiOperation({ summary: 'Get all countries' })
    @ApiResponse({ status: 200, description: 'List of countries' })
    @Get('countries')
    async getCountries() {
        return this.locationSyncService.getCountries();
    }

    @ApiOperation({ summary: 'Get states by country' })
    @ApiQuery({ name: 'countryId', required: true, type: String })
    @ApiResponse({ status: 200, description: 'List of states for the specified country' })
    @Get('states')
    async getStates(@Query('countryId') countryId: string) {
        return this.locationSyncService.getStates(countryId);
    }

    @ApiOperation({ summary: 'Get cities by state' })
    @ApiQuery({ name: 'stateId', required: true, type: String })
    @ApiResponse({ status: 200, description: 'List of cities for the specified state' })
    @Get('cities')
    async getCities(@Query('stateId') stateId: string) {
        return this.locationSyncService.getCities(stateId);
    }

    @ApiOperation({ summary: 'Sync states and cities for specific country' })
    @ApiQuery({ name: 'countryId', required: true, type: String })
    @ApiResponse({ status: 200, description: 'Locations synchronized successfully' })
    @Post('sync/country')
    async syncCountryLocations(@Query('countryId') countryId: string) {
        return this.locationSyncService.syncCountryStatesAndCities(countryId);
    }
}