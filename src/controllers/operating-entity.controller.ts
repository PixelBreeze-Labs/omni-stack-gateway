// src/controllers/operating-entity.controller.ts
import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { OperatingEntityService } from '../services/operating-entity.service';
import { CreateOperatingEntityDto, ListOperatingEntityDto, UpdateOperatingEntityDto } from '../dtos/operating-entity.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { OperatingEntity } from "../schemas/operating-entity.schema";

@ApiTags('Operating Entities')
@Controller('operating-entities')
export class OperatingEntityController {
    constructor(private readonly operatingEntityService: OperatingEntityService) {}

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Post()
    @ApiOperation({ summary: 'Create new operating entity' })
    @ApiResponse({ status: 201, description: 'Operating entity created successfully' })
    async create(@Body() createOperatingEntityDto: CreateOperatingEntityDto) {
        return this.operatingEntityService.create(createOperatingEntityDto);
    }

    @ApiOperation({ summary: 'Get all operating entities' })
    @ApiQuery({ type: ListOperatingEntityDto })
    @ApiResponse({ status: 200, description: 'List of operating entities' })
    @Get()
    async findAll(@Query() query: ListOperatingEntityDto): Promise<{
        items: OperatingEntity[];
        total: number;
        pages: number;
        page: number;
        limit: number;
    }> {
        return this.operatingEntityService.findAll(query);
    }

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Get(':id')
    @ApiOperation({ summary: 'Get operating entity by ID' })
    @ApiParam({ name: 'id', description: 'Operating Entity ID' })
    @ApiResponse({ status: 200, description: 'Operating entity details' })
    async findOne(@Param('id') id: string) {
        return this.operatingEntityService.findOne(id);
    }

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Put(':id')
    @ApiOperation({ summary: 'Update operating entity' })
    @ApiParam({ name: 'id', description: 'Operating Entity ID' })
    @ApiResponse({ status: 200, description: 'Operating entity updated' })
    async update(@Param('id') id: string, @Body() updateOperatingEntityDto: UpdateOperatingEntityDto) {
        return this.operatingEntityService.update(id, updateOperatingEntityDto);
    }

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Delete(':id')
    @ApiOperation({ summary: 'Delete operating entity' })
    @ApiParam({ name: 'id', description: 'Operating Entity ID' })
    @ApiResponse({ status: 200, description: 'Operating entity deleted' })
    async remove(@Param('id') id: string) {
        return this.operatingEntityService.remove(id);
    }
}