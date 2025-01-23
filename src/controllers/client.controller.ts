// src/controllers/client.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ClientService } from '../services/client.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { CreateClientDto, UpdateClientDto, ListClientDto } from '../dtos/client.dto';
import { Client } from '../schemas/client.schema';

@Controller('clients')
export class ClientController {
    constructor(private clientService: ClientService) {}

    @Get()
    async findAll(@Query() query: ListClientDto): Promise<Client[]> {
        return this.clientService.findAll(query);
    }

    @Get(':id')
    @UseGuards(ClientAuthGuard)
    async findOne(@Param('id') id: string): Promise<Client> {
        return this.clientService.findOne(id);
    }

    @Post()
    async create(@Body() createClientDto: CreateClientDto): Promise<Client> {
        return this.clientService.create(createClientDto);
    }

    @Put(':id')
    @UseGuards(ClientAuthGuard)
    async update(
        @Param('id') id: string,
        @Body() updateClientDto: UpdateClientDto
    ): Promise<Client> {
        return this.clientService.update(id, updateClientDto);
    }

    @Delete(':id')
    @UseGuards(ClientAuthGuard)
    // TODO: add can be deleted by superadmin also
    async remove(@Param('id') id: string): Promise<void> {
        await this.clientService.remove(id);
    }
}