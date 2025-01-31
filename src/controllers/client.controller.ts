// src/controllers/client.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ClientService } from '../services/client.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { CreateClientDto, UpdateClientDto, ListClientDto } from '../dtos/client.dto';
import { Client } from '../schemas/client.schema';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';

@ApiTags('Clients')
@Controller('clients')
export class ClientController {
    constructor(private clientService: ClientService) {}

    @ApiOperation({ summary: 'Get all clients' })
    @ApiQuery({ type: ListClientDto })
    @ApiResponse({ status: 200, description: 'List of clients' })
    @Get()
    async findAll(@Query() query: ListClientDto): Promise<Client[]> {
        return this.clientService.findAll(query);
    }

    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get client by ID' })
    @ApiParam({ name: 'id', description: 'Client ID' })
    @ApiResponse({ status: 200, description: 'Client details' })
    @Get(':id')
    @UseGuards(ClientAuthGuard)
    async findOne(@Param('id') id: string): Promise<Client> {
        return this.clientService.findOne(id);
    }

    @ApiOperation({ summary: 'Create new client' })
    @ApiResponse({ status: 201, description: 'Client created' })
    @Post()
    async create(@Body() createClientDto: CreateClientDto): Promise<Client> {
        return this.clientService.create(createClientDto);
    }

    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update client' })
    @ApiParam({ name: 'id', description: 'Client ID' })
    @ApiResponse({ status: 200, description: 'Client updated' })
    @Put(':id')
    @UseGuards(ClientAuthGuard)
    async update(
        @Param('id') id: string,
        @Body() updateClientDto: UpdateClientDto
    ): Promise<Client> {
        return this.clientService.update(id, updateClientDto);
    }

    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete client' })
    @ApiParam({ name: 'id', description: 'Client ID' })
    @ApiResponse({ status: 200, description: 'Client deleted' })
    @Delete(':id')
    @UseGuards(ClientAuthGuard)
    async remove(@Param('id') id: string): Promise<void> {
        await this.clientService.remove(id);
    }

    @ApiBearerAuth()
    @ApiOperation({ summary: 'Migrate Client Records to support multiple Client Apps' })
    @ApiResponse({ status: 200, description: 'Migration completed successfully' })
    @Post('migrate')
    async migrateClients() {
        return this.clientService.migrateClients();
    }
}