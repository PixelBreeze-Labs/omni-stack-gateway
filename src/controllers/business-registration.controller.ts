// src/controllers/business-registration.controller.ts
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BusinessRegistrationDto } from '../dtos/business-registration.dto';
import { BusinessRegistrationService } from '../services/business-registration.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';

@ApiTags('Business Registration')
@ApiBearerAuth()
@Controller('business-registration')
@UseGuards(ClientAuthGuard)
export class BusinessRegistrationController {
    constructor(
        private businessRegistrationService: BusinessRegistrationService
    ) {}

    @ApiOperation({ summary: 'Register new business with trial account' })
    @ApiResponse({ status: 201, description: 'Business registered successfully' })
    @Post('trial')
    async registerTrialBusiness(
        @Req() req: Request & { client: Client },
        @Body() registrationData: BusinessRegistrationDto
    ) {
        return this.businessRegistrationService.registerTrialBusiness({
            ...registrationData,
            clientId: req.client.id
        });
    }
}