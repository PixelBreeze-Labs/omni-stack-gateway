// src/controllers/inventory-adjustment.controller.ts
import {Controller, Post, Req, UseGuards, Body, Query, Get, Param} from "@nestjs/common";
import {ClientAuthGuard} from "../guards/client-auth.guard";
import {CreateAdjustmentDto, ListAdjustmentsDto} from "../dtos/inventory-adjustment.dto";
import {InventoryAdjustmentService} from "../services/inventory-adjustments.service";

@Controller('inventory/adjustments')
@UseGuards(ClientAuthGuard)
export class InventoryAdjustmentController {
    constructor(private service: InventoryAdjustmentService) {}

    @Post()
    create(@Body() dto: CreateAdjustmentDto, @Req() req: any) {
        return this.service.create({
            ...dto,
            clientId: req.client.id
        });
    }

    @Get()
    findAll(@Query() query: ListAdjustmentsDto, @Req() req: any) {
        return this.service.findAll({
            ...query,
            clientId: req.client.id
        });
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Req() req: any) {
        return this.service.findOne(id, req.client.id);
    }

    @Post(':id/approve')
    approve(@Param('id') id: string, @Body('approvedBy') approvedBy: string, @Req() req: any) {
        return this.service.approve(id, approvedBy, req.client.id);
    }

    @Post(':id/reject')
    reject(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
        return this.service.reject(id, reason, req.client.id);
    }
}