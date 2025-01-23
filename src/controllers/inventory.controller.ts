// src/controllers/inventory.controller.ts
import {ClientAuthGuard} from "../guards/client-auth.guard";
import {Body, Controller, Get, Param, Post, Req, UseGuards} from "@nestjs/common";
import {InventoryService} from "../services/inventory.service";
import {Client} from "../schemas/client.schema";
import {AdjustInventoryDto} from "../dtos/inventory.dto";

@Controller('inventory')
@UseGuards(ClientAuthGuard)
export class InventoryController {
    constructor(private inventoryService: InventoryService) {}

    @Post('adjust')
    async adjustInventory(
        @Body() adjustmentDto: AdjustInventoryDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.inventoryService.adjust(adjustmentDto, req.client.id);
    }

    @Get('product/:productId/warehouse/:warehouseId')
    async getInventory(
        @Param('productId') productId: string,
        @Param('warehouseId') warehouseId: string
    ) {
        return this.inventoryService.getInventory(productId, warehouseId);
    }
}
