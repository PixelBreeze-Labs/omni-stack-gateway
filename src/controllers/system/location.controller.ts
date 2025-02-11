// src/controllers/location.controller.ts
import {Controller, Post, Get, Query, UseGuards, HttpStatus, HttpException} from '@nestjs/common';
import { LocationSyncService } from '../../services/location-sync.service';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiQuery } from '@nestjs/swagger';
import { Country } from '../../schemas/country.schema';
import { State } from '../../schemas/state.schema';
import { City } from '../../schemas/city.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotFoundException } from '@nestjs/common';
import {EmailService} from "../../services/email.service";

@ApiTags('Locations')
@Controller('locations')
export class LocationController {
    constructor(
        private readonly locationSyncService: LocationSyncService,
        @InjectModel(City.name) private cityModel: Model<City>,
        private readonly emailService: EmailService,

    ) {}

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

    @Get('cities/random')
    @ApiOperation({ summary: 'Get 10 random test cities' })
    @ApiResponse({ status: 200, description: 'List of random cities' })
    async getRandomCities() {
        const cities = await this.cityModel.aggregate([
            { $sample: { size: 10 } }
        ]);

        if (!cities.length) {
            throw new NotFoundException('No cities found');
        }

        return cities;
    }

    @Get('send')
    async sendTestEmail() {
        try {
            // Define a test recipient email address.
            const testRecipient = 'ggerveni@gmail.com'; // Replace with a valid email for testing

            // Call the sendTemplateEmail method.
            await this.emailService.sendTemplateEmail(
                'Metroshop',                          // fromName: The display name of the sender
                'metroshop@omnistackhub.xyz',          // fromEmail: The verified sender email address
                testRecipient,                         // to: Recipient email address
                'Mirë se vjen në Metroshop!',          // subject: Email subject
                'templates/metroshop/welcome-email-template.html', // templatePath: Relative path to your template file
                {
                    discount_percentage: '10%',          // Data for {{discount_percentage}}
                    promo_code: 'WELCOME10',               // Data for {{promo_code}}
                },
            );

            return { message: 'Test email sent successfully' };
        } catch (error) {
            console.error('Error sending test email:', error);
            throw new HttpException('Failed to send test email', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}