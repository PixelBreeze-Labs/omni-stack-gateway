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

    //============================
    // Generic business list endpoints (no params)
    //============================
    
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
    
    //============================
    // Employee-specific endpoints
    //============================
    
    // Having employee endpoints before business ID endpoints prevents "employee" from being matched as a business ID
    
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
            allow_clockinout?: boolean;
            has_app_access?: boolean;
            allow_checkin?: boolean;
        }
    ) {
        return this.businessService.createEmployee(
            req.client.id,
            data
        );
    }
    
    @Patch('employee/:id')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update employee details' })
    @ApiResponse({ status: 200, description: 'Employee updated successfully' })
    async updateEmployee(
        @Req() req: Request & { client: Client },
        @Param('id') employeeId: string,
        @Body() updateData: {
            name?: string;
            email?: string;
            allow_clockinout?: boolean;
            has_app_access?: boolean;
            allow_checkin?: boolean;
            external_ids?: Record<string, any>;
            metadata?: Record<string, any>;
        }
    ) {
        return this.businessService.updateEmployee(
            req.client.id,
            employeeId,
            updateData
        );
    }

    @Patch('employee/:id/capabilities')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update employee capabilities' })
    @ApiResponse({ status: 200, description: 'Employee capabilities updated successfully' })
    async updateEmployeeCapabilities(
        @Req() req: Request & { client: Client },
        @Param('id') employeeId: string,
        @Body() updateData: {
            allow_clockinout?: boolean;
            has_app_access?: boolean;
            allow_checkin?: boolean;
        }
    ) {
        return this.businessService.updateEmployeeCapabilities(
            req.client.id,
            employeeId,
            updateData
        );
    }

    //============================
    // App client endpoints
    //============================
    
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

    //============================
    // Business-specific endpoints (with ID)
    //============================
    
    @Get(':id')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get business details by ID' })
    @ApiResponse({ status: 200, description: 'Returns business details' })
    async getBusinessDetails(
        @Req() req: Request & { client: Client },
        @Param('id') businessId: string
    ) {
        return this.businessService.getBusinessDetails(
            req.client.id,
            businessId
        );
    }
    
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
    
    @Patch(':id')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update business details' })
    @ApiResponse({ status: 200, description: 'Business updated successfully' })
    async updateBusiness(
        @Req() req: Request & { client: Client },
        @Param('id') businessId: string,
        @Body() updateData: {
            name?: string;
            email?: string;
            phone?: string;
            type?: string;
            address?: {
                street?: string;
                cityId?: string;
                stateId?: string;
                zip?: string;
                countryId?: string;
            };
            taxId?: string;
            vatNumber?: string;
            currency?: string;
            allow_clockinout?: boolean;
            has_app_access?: boolean;
            allow_checkin?: boolean;
            metadata?: Record<string, any>;
        }
    ) {
        return this.businessService.updateBusiness(
            req.client.id,
            businessId,
            updateData
        );
    }

    @Patch(':id/capabilities')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update business capabilities and optionally apply to all employees' })
    @ApiResponse({ status: 200, description: 'Business capabilities updated successfully' })
    async updateBusinessCapabilities(
        @Req() req: Request & { client: Client },
        @Param('id') businessId: string,
        @Body() updateData: {
            allow_clockinout?: boolean;
            has_app_access?: boolean;
            allow_checkin?: boolean;
            applyToAllEmployees?: boolean; // Whether to apply these capabilities to all employees
        }
    ) {
        return this.businessService.updateBusinessCapabilities(
            req.client.id,
            businessId,
            updateData
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
}