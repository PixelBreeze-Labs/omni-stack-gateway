// src/controllers/customer.controller.ts
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Body, Controller, Get, Param, Post, Put, Delete, Req, UseGuards, Query } from '@nestjs/common';
import { CreateCustomerDto, ListCustomerDto, UpdateCustomerDto } from '../dtos/customer.dto';
import { Client } from '../schemas/client.schema';
import { CustomerService } from '../services/customer.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
@UseGuards(ClientAuthGuard)
export class CustomerController {
    constructor(private customerService: CustomerService) {}

    @Post()
    @ApiOperation({ summary: 'Create a new customer' })
    @ApiResponse({ status: 201, description: 'Customer created successfully' })
    async create(
        @Req() req: Request & { client: Client },
        @Body() createCustomerDto: CreateCustomerDto,
    ) {
        return this.customerService.create({
            ...createCustomerDto,
            clientId: req.client.id
        });
    }

    @Get()
    @ApiOperation({ summary: 'Get all customers' })
    @ApiResponse({ status: 200, description: 'Return all customers' })
    async findAll(
        @Query() query: ListCustomerDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.customerService.findAll({
            ...query,
            clientId: req.client.id
        });
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get customer by id' })
    @ApiResponse({ status: 200, description: 'Return customer' })
    async findOne(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.customerService.findOne(id, req.client.id);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update customer' })
    @ApiResponse({ status: 200, description: 'Customer updated successfully' })
    async update(
        @Param('id') id: string,
        @Body() updateCustomerDto: UpdateCustomerDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.customerService.update(id, req.client.id, updateCustomerDto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Soft delete customer' })
    @ApiResponse({ status: 200, description: 'Customer deactivated successfully' })
    async remove(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.customerService.remove(id, req.client.id);
    }

    @Delete(':id/hard')
    @ApiOperation({ summary: 'Hard delete customer' })
    @ApiResponse({ status: 200, description: 'Customer deleted successfully' })
    async hardDelete(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.customerService.hardDelete(id, req.client.id);
    }
}