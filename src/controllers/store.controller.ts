// src/controllers/store.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { StoreService } from '../services/store.service';
import { CreateStoreDto, UpdateStoreDto, ListStoreDto } from '../dtos/store.dto';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Client } from '../schemas/client.schema';

@ApiTags('Stores')
@ApiBearerAuth()
@Controller('stores')
@UseGuards(ClientAuthGuard)
export class StoreController {
    constructor(private storeService: StoreService) {}

    @ApiOperation({ summary: 'Create a new store' })
    @ApiResponse({ status: 201, description: 'Store created successfully' })
    @ApiBody({ type: CreateStoreDto })
    @Post()
    async create(
        @Req() req: Request & { client: Client },
        @Body() createStoreDto: CreateStoreDto
    ) {
        return this.storeService.create({
            ...createStoreDto,
            clientId: req.client.id
        });
    }

    @ApiOperation({ summary: 'Get all stores' })
    @ApiQuery({ type: ListStoreDto })
    @ApiResponse({ status: 200, description: 'Return all stores' })
    @Get()
    async findAll(
        @Query() query: ListStoreDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.storeService.findAll({
            ...query,
            clientId: req.client.id
        });
    }

    @ApiOperation({ summary: 'Get store by id' })
    @ApiParam({ name: 'id', description: 'Store ID' })
    @ApiResponse({ status: 200, description: 'Return store' })
    @Get(':id')
    async findOne(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.storeService.findOne(id, req.client.id);
    }

    @ApiOperation({ summary: 'Update store' })
    @ApiParam({ name: 'id', description: 'Store ID' })
    @ApiBody({ type: UpdateStoreDto })
    @ApiResponse({ status: 200, description: 'Store updated successfully' })
    @Put(':id')
    async update(
        @Param('id') id: string,
        @Body() updateStoreDto: UpdateStoreDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.storeService.update(id, req.client.id, updateStoreDto);
    }

    @ApiOperation({ summary: 'Soft delete store' })
    @ApiParam({ name: 'id', description: 'Store ID' })
    @ApiResponse({ status: 200, description: 'Store deactivated successfully' })
    @Delete(':id')
    async remove(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.storeService.remove(id, req.client.id);
    }

    @ApiOperation({ summary: 'Hard delete store' })
    @ApiParam({ name: 'id', description: 'Store ID' })
    @ApiResponse({ status: 200, description: 'Store deleted successfully' })
    @Delete(':id/hard')
    async hardDelete(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.storeService.hardDelete(id, req.client.id);
    }

    @ApiOperation({ summary: 'Get stores from connected VenueBoost clients' })
    @Get('connected')
    async getConnectedStores(@Req() req: Request & { client: Client }) {
        return this.storeService.findConnectedStores(req.client.id);
    }

    @ApiOperation({ summary: 'Connect user to store' })
    @ApiBody({ type: Object, schema: { properties: { userId: { type: 'string' } } } })
    @Post(':id/connect-user')
    async connectUser(
        @Param('id') storeId: string,
        @Body('userId') userId: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.storeService.connectUser(storeId, userId, req.client.id);
    }

    @ApiOperation({ summary: 'Disconnect user from store' })
    @ApiBody({ type: Object, schema: { properties: { userId: { type: 'string' } } } })
    @Post(':id/disconnect-user')
    async disconnectUser(
        @Param('id') storeId: string,
        @Body('userId') userId: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.storeService.disconnectUser(storeId, userId, req.client.id);
    }
}