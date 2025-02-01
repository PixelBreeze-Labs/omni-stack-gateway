// src/controllers/customer.controller.ts
import {Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards, Patch} from '@nestjs/common';
import { CustomerService } from '../services/customer.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import {CreateCustomerDto, UpdateCustomerDto, ListCustomerDto, PartialUpdateCustomerDto} from '../dtos/customer.dto';
import { Customer } from '../schemas/customer.schema';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Client } from '../schemas/client.schema';
import {FamilyAccountService} from "../services/family-account.service";

@ApiTags('Customers')
@Controller('customers')
@UseGuards(ClientAuthGuard)
export class CustomerController {
    constructor(
        private customerService: CustomerService,
        private readonly familyAccountService: FamilyAccountService
        ) {}

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

    // customer.controller.ts
    @ApiOperation({ summary: 'Search customers by query' })
    @ApiQuery({ name: 'query', type: String, description: 'Search query for customers' })
    @ApiQuery({ name: 'excludeFamilyMembers', type: Boolean, required: false, description: 'Exclude customers who are already in families' })
    @ApiResponse({ status: 200, description: 'List of matching customers' })
    @Get('search')
    async search(
        @Req() req: Request & { client: Client },
        @Query('query') searchQuery: string,
        @Query('excludeFamilyMembers') excludeFamilyMembers?: boolean,
    ): Promise<{ items: Customer[]; total: number; pages: number; page: number; limit: number }> {
        // First get all matching customers
        const queryDto: ListCustomerDto = {
            search: searchQuery,
            page: 1,
            limit: 10
        };

        const customers = await this.customerService.findAll({
            ...queryDto,
            clientIds: [req.client.id]
        });

        // If we don't need to exclude family members, return as is
        if (!excludeFamilyMembers) {
            return customers;
        }

        // Get available customers (not in families)
        const availableCustomers = await this.familyAccountService.searchCustomers(
            searchQuery,
            req.client.id
        );

        // Create a Set of available customer IDs for efficient lookup
        const availableCustomerIds = new Set(
            availableCustomers.map(c => c._id.toString())
        );

        // Filter the original results
        const filteredItems = customers.items.filter(customer =>
            availableCustomerIds.has(customer._id.toString())
        );

        return {
            items: filteredItems,
            total: filteredItems.length,
            pages: Math.ceil(filteredItems.length / queryDto.limit),
            page: queryDto.page,
            limit: queryDto.limit
        };
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
        return this.customerService.create({ ...createCustomerDto, clientId: req.client.id });
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



    @ApiOperation({ summary: 'Hard delete customer' })
    @ApiParam({ name: 'id', description: 'Customer ID' })
    @ApiResponse({ status: 200, description: 'Customer deleted successfully' })
    @Delete(':id/hard')
    async hardDelete(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.customerService.hardDelete(id, req.client.id);
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

    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update customer (partial update)' })
    @ApiParam({ name: 'id', description: 'Customer ID' })
    @ApiResponse({ status: 200, description: 'Customer updated' })
    @Patch(':id')
    async partialUpdate(
        @Param('id') id: string,
        @Body() updateCustomerDto: PartialUpdateCustomerDto,
        @Req() req: Request & { client: Client }
    ): Promise<Customer> {
        return this.customerService.partialUpdate(id, req.client.id, updateCustomerDto);
    }
}
