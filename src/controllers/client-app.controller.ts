// src/controllers/client-app.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { ClientAppService } from '../services/client-app.service';
import { ClientApp } from '../interfaces/client-app.interface';

@Controller('api/client-apps')
export class ClientAppController {
    constructor(private readonly clientAppService: ClientAppService) {}

    @Post()
    async create(@Body() clientApp: Partial<ClientApp>) {
        return await this.clientAppService.create(clientApp);
    }

    @Get()
    async findAll() {
        return await this.clientAppService.findAll();
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        return await this.clientAppService.findOne(id);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() clientApp: Partial<ClientApp>) {
        return await this.clientAppService.update(id, clientApp);
    }

    @Delete(':id')
    async delete(@Param('id') id: string) {
        return await this.clientAppService.delete(id);
    }
}