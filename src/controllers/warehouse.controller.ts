// src/controllers/warehouse.controller.ts

import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { WarehouseService } from '../services/warehouse.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { CreateWarehouseDto, UpdateWarehouseDto } from '../dtos/warehouse.dto';

@ApiTags('Warehouses')
@Controller('warehouses')
@UseGuards(ClientAuthGuard)
export class WarehouseController {
    constructor(private readonly warehouseService: WarehouseService) {}

    @Post()
    @ApiOperation({ summary: 'Create a new warehouse' })
    create(@Body() createWarehouseDto: CreateWarehouseDto) {
        return this.warehouseService.create(createWarehouseDto);
    }

    @Get('client/:clientId')
    @ApiOperation({ summary: 'Get all warehouses for a specific client' })
    @ApiParam({ name: 'clientId' })
    findAll(@Param('clientId') clientId: string) {
        return this.warehouseService.findAll(clientId);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a single warehouse by its ID' })
    @ApiParam({ name: 'id' })
    findOne(@Param('id') id: string) {
        return this.warehouseService.findOne(id);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update an existing warehouse' })
    @ApiParam({ name: 'id' })
    update(@Param('id') id: string, @Body() updateWarehouseDto: UpdateWarehouseDto) {
        return this.warehouseService.update(id, updateWarehouseDto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a warehouse by its ID' })
    @ApiParam({ name: 'id' })
    remove(@Param('id') id: string) {
        return this.warehouseService.remove(id);
    }
}
