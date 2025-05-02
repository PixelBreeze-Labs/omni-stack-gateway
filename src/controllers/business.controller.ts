// src/controllers/business.controller.ts
import {Controller, Post, Get, Param, Body, Query, Req, UseGuards, Patch} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BusinessService } from '../services/business.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';
import {ClientType} from "../schemas/app-client.schema";

@ApiTags('Businesses')
@Controller('businesses')
export class BusinessController {
    constructor(private businessService: BusinessService) {}

    @Post(':id/subscribe')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update business details and create subscription' })
    @ApiResponse({ status: 201, description: 'Checkout session created successfully' })
    async updateBusinessAndSubscribe(
        @Req() req: Request & { client: Client },
        @Param('id') businessId: string,
        @Body() subscriptionData: {
            businessDetails?: {
                businessType?: string;
                phone?: string;
                address?: {
                    street?: string;
                    cityId?: string;  // Changed from city
                    stateId?: string; // Changed from state
                    zip?: string;
                    countryId?: string; // Changed from country
                };
                taxId?: string;
                vatNumber?: string;
            };
            subscription: {
                planId: string;
                interval: 'month' | 'year';
            };
        }
    ) {
        return this.businessService.updateBusinessAndSubscribe(
            req.client.id,
            businessId,
            subscriptionData
        );
    }

    @Get('subscription/finalize')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Finalize subscription after successful payment' })
    @ApiResponse({ status: 200, description: 'Subscription finalized successfully' })
    async finalizeSubscription(
        @Req() req: Request & { client: Client },
        @Query('session_id') sessionId: string
    ) {
        return this.businessService.finalizeSubscription(req.client.id, sessionId);
    }

    @Get()
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all businesses' })
    @ApiResponse({ status: 200, description: 'Returns a list of businesses' })
    async getBusinesses(
        @Req() req: Request & { client: Client },
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
        @Query('status') status?: string,
        @Query('isTrialing') isTrialing?: boolean,
        @Query('isTestAccount') isTestAccount?: boolean,
        @Query('isActive') isActive?: boolean,
        @Query('sort') sort?: string
    ) {
        return this.businessService.getBusinesses(
            req.client.id,
            {
                page,
                limit,
                search,
                status,
                isTrialing,
                isTestAccount,
                isActive,
                sort
            }
        );
    }

    @Get('trials')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get businesses in trial period' })
    @ApiResponse({ status: 200, description: 'Returns a list of businesses in trial period' })
    async getTrialBusinesses(
        @Req() req: Request & { client: Client },
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
        @Query('sort') sort?: string
    ) {
        return this.businessService.getTrialBusinesses(
            req.client.id,
            {
                page,
                limit,
                search,
                sort
            }
        );
    }

    @Patch(':id/delete')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Soft delete a business' })
    @ApiResponse({ status: 200, description: 'Business deleted successfully' })
    async softDeleteBusiness(
        @Req() req: Request & { client: Client },
        @Param('id') businessId: string
    ) {
        return this.businessService.softDeleteBusiness(
            req.client.id,
            businessId
        );
    }

    @Patch(':id/deactivate')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Deactivate a business' })
    @ApiResponse({ status: 200, description: 'Business deactivated successfully' })
    async deactivateBusiness(
        @Req() req: Request & { client: Client },
        @Param('id') businessId: string
    ) {
        return this.businessService.updateBusinessStatus(
            req.client.id,
            businessId,
            false
        );
    }

    @Patch(':id/activate')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Activate a business' })
    @ApiResponse({ status: 200, description: 'Business activated successfully' })
    async activateBusiness(
        @Req() req: Request & { client: Client },
        @Param('id') businessId: string
    ) {
        return this.businessService.updateBusinessStatus(
            req.client.id,
            businessId,
            true
        );
    }

    @Patch(':id/mark-test-account')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Mark a business as a test account' })
    @ApiResponse({ status: 200, description: 'Business marked as test account successfully' })
    async markAsTestAccount(
        @Req() req: Request & { client: Client },
        @Param('id') businessId: string,
        @Body() data: { isTestAccount: boolean }
    ) {
        return this.businessService.updateBusinessTestStatus(
            req.client.id,
            businessId,
            data.isTestAccount
        );
    }

    @Post('app-client')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create a new app client for a business' })
    @ApiResponse({ status: 201, description: 'App client created successfully' })
    async createAppClient(
        @Req() req: Request & { client: Client },
        @Body() data: {
            name: string;
            adminUserId: string;
            type?: ClientType;
            contact_person?: string;
            email?: string;
            phone?: string;
            notes?: string;
            createAccount?: boolean;
            external_ids?: Record<string, any>;
            metadata?: Record<string, any>;
        }
    ) {
        return this.businessService.createAppClient(
            req.client.id,
            data
        );
    }

    @Post('employee')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create a new employee for a business' })
    @ApiResponse({ status: 201, description: 'Employee created successfully' })
    async createEmployee(
        @Req() req: Request & { client: Client },
        @Body() data: {
            name: string;
            surname: string;
            email: string;
            adminUserId: string;
            createAccount?: boolean;
            external_ids?: Record<string, any>;
            metadata?: Record<string, any>;
        }
    ) {
        return this.businessService.createEmployee(
            req.client.id,
            data
        );
    }

    @Post('simple-app-client')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create a simple app client without user account' })
    @ApiResponse({ status: 201, description: 'App client created successfully' })
    async createSimpleAppClient(
        @Req() req: Request & { client: Client },
        @Body() data: {
            name: string;
            adminUserId: string;
            type?: ClientType;
            contact_person?: string;
            email?: string;
            phone?: string;
            notes?: string;
            external_ids?: Record<string, any>;
            metadata?: Record<string, any>;
        }
    ) {
        return this.businessService.createSimpleAppClient(
            req.client.id,
            data
        );
    }
}