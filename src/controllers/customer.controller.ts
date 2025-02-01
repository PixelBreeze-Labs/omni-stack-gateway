// src/controllers/customer.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { CustomerService } from '../services/customer.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { CreateCustomerDto, UpdateCustomerDto, ListCustomerDto } from '../dtos/customer.dto';
import { Customer } from '../schemas/customer.schema';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { Client } from '../schemas/client.schema';

@ApiTags('Customers')
@Controller('customers')
@UseGuards(ClientAuthGuard)
export class CustomerController {
    constructor(private customerService: CustomerService) {}

    @ApiOperation({ summary: 'Get all customers' })
    @ApiQuery({ type: ListCustomerDto })
    @ApiResponse({ status: 200, description: 'List of customers' })
    @Get()
    async findAll(
        @Query() query: ListCustomerDto,
        @Req() req: Request & { client: Client }
    ): Promise<{ items: Customer[]; total: number; pages: number; page: number; limit: number }> {
        // For findAll, the service expects an array of client IDs.
        return this.customerService.findAll({ ...query, clientIds: [req.client.id] });
    }

    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get customer by ID' })
    @ApiParam({ name: 'id', description: 'Customer ID' })
    @ApiResponse({ status: 200, description: 'Customer details' })
    @Get(':id')
    async findOne(@Param('id') id: string, @Req() req: Request & { client: Client }): Promise<Customer> {
        // For findOne, pass the client ID as a string.
        return this.customerService.findOne(id, req.client.id);
    }

    @ApiOperation({ summary: 'Create new customer' })
    @ApiResponse({ status: 201, description: 'Customer created' })
    @Post()
    async create(@Body() createCustomerDto: CreateCustomerDto, @Req() req: Request & { client: Client }): Promise<Customer> {
        // For create, the DTO expects clientIds as an array.
        return this.customerService.create({ ...createCustomerDto, clientIds: [req.client.id] });
    }

    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update customer' })
    @ApiParam({ name: 'id', description: 'Customer ID' })
    @ApiResponse({ status: 200, description: 'Customer updated' })
    @Put(':id')
    async update(
        @Param('id') id: string,
        @Body() updateCustomerDto: UpdateCustomerDto,
        @Req() req: Request & { client: Client }
    ): Promise<Customer> {
        // For update, pass the client ID as a string.
        return this.customerService.update(id, req.client.id, updateCustomerDto);
    }

    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete customer' })
    @ApiParam({ name: 'id', description: 'Customer ID' })
    @ApiResponse({ status: 200, description: 'Customer deleted' })
    @Delete(':id')
    async remove(@Param('id') id: string, @Req() req: Request & { client: Client }): Promise<void> {
        // For remove, pass the client ID as a string.
        await this.customerService.remove(id, req.client.id);
    }
}
