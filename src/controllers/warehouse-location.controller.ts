// src/controllers/warehouse-location.controller.ts
@Controller('warehouse-locations')
@UseGuards(ClientAuthGuard)
export class WarehouseLocationController {
    constructor(private locationService: WarehouseLocationService) {}

    @Post()
    create(@Body() createDto: CreateLocationDto) {
        return this.locationService.create(createDto);
    }

    @Get('warehouse/:warehouseId')
    findAll(@Param('warehouseId') warehouseId: string) {
        return this.locationService.findAll(warehouseId);
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() updateDto: UpdateLocationDto) {
        return this.locationService.update(id, updateDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.locationService.remove(id);
    }
}