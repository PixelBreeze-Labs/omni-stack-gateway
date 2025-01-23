// src/controllers/inventory.controller.ts
import {ClientAuthGuard} from "../guards/client-auth.guard";
import {Body, Controller, Get, Param, Post, Req, UseGuards} from "@nestjs/common";
import {InventoryService} from "../services/inventory.service";
import {Client} from "../schemas/client.schema";
import {AdjustInventoryDto} from "../dtos/inventory.dto";
import {ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags} from "@nestjs/swagger";

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('inventory')
@UseGuards(ClientAuthGuard)
export class InventoryController {
    constructor(private inventoryService: InventoryService) {}

    @ApiOperation({ summary: 'Adjust inventory levels' })
    @ApiResponse({ status: 200, description: 'Inventory adjusted successfully' })
    @Post('adjust')
    async adjustInventory(
        @Body() adjustmentDto: AdjustInventoryDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.inventoryService.adjust(adjustmentDto, req.client.id);
    }

    @ApiOperation({ summary: 'Get inventory level for product in warehouse' })
    @ApiParam({ name: 'productId', description: 'Product ID' })
    @ApiParam({ name: 'warehouseId', description: 'Warehouse ID' })
    @ApiResponse({ status: 200, description: 'Inventory details' })
    @Get('product/:productId/warehouse/:warehouseId')
    async getInventory(
        @Param('productId') productId: string,
        @Param('warehouseId') warehouseId: string
    ) {
        return this.inventoryService.getInventory(productId, warehouseId);
    }
}