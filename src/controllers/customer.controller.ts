import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { CustomerService } from '../services/customer.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { CreateCustomerDto, UpdateCustomerDto, ListCustomerDto } from '../dtos/customer.dto';
import { Customer } from '../schemas/customer.schema';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';

@ApiTags('Customers')
@Controller('customers')
export class CustomerController {
    constructor(private customerService: CustomerService) {}

    @ApiOperation({ summary: 'Get all customers' })
    @ApiQuery({ type: ListCustomerDto })
    @ApiResponse({ status: 200, description: 'List of customers' })
    @Get()
    async findAll(@Query() query: ListCustomerDto, @Req() req): Promise<{ items: Customer[]; total: number; pages: number; page: number; limit: number }> {
        return this.customerService.findAll({ ...query, clientIds: req.client.clientIds });
    }

    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get customer by ID' })
    @ApiParam({ name: 'id', description: 'Customer ID' })
    @ApiResponse({ status: 200, description: 'Customer details' })
    @Get(':id')
    @UseGuards(ClientAuthGuard)
    async findOne(@Param('id') id: string, @Req() req): Promise<Customer> {
        return this.customerService.findOne(id, req.client.clientIds);
    }

    @ApiOperation({ summary: 'Create new customer' })
    @ApiResponse({ status: 201, description: 'Customer created' })
    @Post()
    async create(@Body() createCustomerDto: CreateCustomerDto, @Req() req): Promise<Customer> {
        return this.customerService.create({ ...createCustomerDto, clientIds: req.client.clientIds });
    }

    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update customer' })
    @ApiParam({ name: 'id', description: 'Customer ID' })
    @ApiResponse({ status: 200, description: 'Customer updated' })
    @Put(':id')
    @UseGuards(ClientAuthGuard)
    async update(
        @Param('id') id: string,
        @Body() updateCustomerDto: UpdateCustomerDto,
        @Req() req
    ): Promise<Customer> {
        return this.customerService.update(id, req.client.clientIds, updateCustomerDto);
    }

    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete customer' })
    @ApiParam({ name: 'id', description: 'Customer ID' })
    @ApiResponse({ status: 200, description: 'Customer deleted' })
    @Delete(':id')
    @UseGuards(ClientAuthGuard)
    async remove(@Param('id') id: string, @Req() req): Promise<void> {
        await this.customerService.remove(id, req.client.clientIds);
    }
}
