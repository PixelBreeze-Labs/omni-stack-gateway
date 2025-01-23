import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ClientAppService } from '../services/client-app.service';
import { CreateClientAppDto, UpdateClientAppDto, ListClientAppDto } from '../dtos/client-app.dto';
import { ApiKeyAuthGuard } from '../guards/api-key-auth.guard';

@Controller('client-apps')
export class ClientAppController {
    constructor(private clientAppService: ClientAppService) {}

    @Get()
    async findAll(@Query() query: ListClientAppDto) {
        return this.clientAppService.findAll(query);
    }

    @Get(':id')
    @UseGuards(ApiKeyAuthGuard)
    async findOne(@Param('id') id: string) {
        return this.clientAppService.findOne(id);
    }

    @Post()
    async create(@Body() createClientAppDto: CreateClientAppDto) {
        return this.clientAppService.create(createClientAppDto);
    }

    @Put(':id')
    @UseGuards(ApiKeyAuthGuard)
    async update(
        @Param('id') id: string,
        @Body() updateClientAppDto: UpdateClientAppDto
    ) {
        return this.clientAppService.update(id, updateClientAppDto);
    }

    @Delete(':id')
    @UseGuards(ApiKeyAuthGuard)
    // TODO: add can be deleted by superadmin also
    async remove(@Param('id') id: string) {
        return this.clientAppService.remove(id);
    }
}