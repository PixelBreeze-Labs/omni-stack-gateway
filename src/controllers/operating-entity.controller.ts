// src/controllers/operating-entity.controller.ts
import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, Query, Req } from '@nestjs/common';
import { OperatingEntityService } from '../services/operating-entity.service';
import { CreateOperatingEntityDto, ListOperatingEntityDto, UpdateOperatingEntityDto } from '../dtos/operating-entity.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { OperatingEntity } from "../schemas/operating-entity.schema";
import { Client } from '../schemas/client.schema';

@ApiTags('Operating Entities')
@Controller('operating-entities')
export class OperatingEntityController {
    constructor(private readonly operatingEntityService: OperatingEntityService) {}

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Post()
    @ApiOperation({ summary: 'Create new operating entity' })
    @ApiResponse({ status: 201, description: 'Operating entity created successfully' })
    async create(
        @Body() createOperatingEntityDto: CreateOperatingEntityDto,
        @Req() req: Request & { client: Client }
    ) {
        // Ensure the clientId is always set from the authenticated client
        return this.operatingEntityService.create({
            ...createOperatingEntityDto,
            clientId: req.client.id
        });
    }

    @UseGuards(ClientAuthGuard)
    @Get()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all operating entities' })
    @ApiQuery({ type: ListOperatingEntityDto })
    @ApiResponse({ status: 200, description: 'List of operating entities' })
    async findAll(
        @Query() query: ListOperatingEntityDto,
        @Req() req: Request & { client: Client }
    ): Promise<{
        items: OperatingEntity[];
        total: number;
        pages: number;
        page: number;
        limit: number;
    }> {
        // Always filter by the authenticated client's ID
        return this.operatingEntityService.findAll({
            ...query,
            clientId: req.client.id
        });
    }

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Get(':id')
    @ApiOperation({ summary: 'Get operating entity by ID' })
    @ApiParam({ name: 'id', description: 'Operating Entity ID' })
    @ApiResponse({ status: 200, description: 'Operating entity details' })
    async findOne(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        // Ensure we only retrieve entities belonging to this client
        return this.operatingEntityService.findOne(id, req.client.id);
    }

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Put(':id')
    @ApiOperation({ summary: 'Update operating entity' })
    @ApiParam({ name: 'id', description: 'Operating Entity ID' })
    @ApiResponse({ status: 200, description: 'Operating entity updated' })
    async update(
        @Param('id') id: string,
        @Body() updateOperatingEntityDto: UpdateOperatingEntityDto,
        @Req() req: Request & { client: Client }
    ) {
        // The clientId should not be updatable
        const { clientId, ...updateData } = updateOperatingEntityDto;
        return this.operatingEntityService.update(id, updateData, req.client.id);
    }

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Delete(':id')
    @ApiOperation({ summary: 'Delete operating entity' })
    @ApiParam({ name: 'id', description: 'Operating Entity ID' })
    @ApiResponse({ status: 200, description: 'Operating entity deleted' })
    async remove(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.operatingEntityService.remove(id, req.client.id);
    }
}