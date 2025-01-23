// src/controllers/warehouse-location.controller.ts
import {ClientAuthGuard} from "../guards/client-auth.guard";
import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from "@nestjs/common";
import {CreateLocationDto, UpdateLocationDto} from "../dtos/warehouse-location.dto";
import {WarehouseLocationService} from "../services/warehouse-location.service";
import {ApiOperation, ApiParam, ApiTags} from "@nestjs/swagger";

@ApiTags('Warehouse Locations')
@Controller('warehouse-locations')
@UseGuards(ClientAuthGuard)
export class WarehouseLocationController {
    constructor(private locationService: WarehouseLocationService) {}

    @Post(':warehouseId')
    @ApiOperation({ summary: 'Create location' })
    @ApiParam({ name: 'warehouseId' })
    create(
        @Param('warehouseId') warehouseId: string,
        @Body() createDto: CreateLocationDto
    ) {
        return this.locationService.create(warehouseId, createDto);
    }

    @Get('warehouse/:warehouseId')
    @ApiOperation({ summary: 'Get all locations in warehouse' })
    @ApiParam({ name: 'warehouseId' })
    findAll(@Param('warehouseId') warehouseId: string) {
        return this.locationService.findAll(warehouseId);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update location' })
    update(@Param('id') id: string, @Body() updateDto: UpdateLocationDto) {
        return this.locationService.update(id, updateDto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete location' })
    remove(@Param('id') id: string) {
        return this.locationService.remove(id);
    }
}