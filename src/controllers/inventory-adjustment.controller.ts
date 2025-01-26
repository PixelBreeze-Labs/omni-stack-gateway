// src/controllers/inventory-adjustment.controller.ts
import {Controller, Post, Req, UseGuards, Body, Query, Get, Param} from "@nestjs/common";
import {ClientAuthGuard} from "../guards/client-auth.guard";
import {CreateAdjustmentDto, ListAdjustmentsDto} from "../dtos/inventory-adjustment.dto";
import {InventoryAdjustmentService} from "../services/inventory-adjustments.service";
import {ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags} from "@nestjs/swagger";

@ApiTags('Inventory Adjustments')
@Controller('inventory/adjustments')
@UseGuards(ClientAuthGuard)
export class InventoryAdjustmentController {
    constructor(private service: InventoryAdjustmentService) {}

    @ApiOperation({ summary: 'Create new inventory adjustment' })
    @ApiBody({ type: CreateAdjustmentDto })
    @ApiResponse({ status: 201, description: 'Adjustment created' })
    @Post()
    create(@Body() dto: CreateAdjustmentDto, @Req() req: any) {
        return this.service.create({
            ...dto,
            clientId: req.client.id
        });
    }

    @ApiOperation({ summary: 'List all inventory adjustments' })
    @ApiQuery({ type: ListAdjustmentsDto })
    @ApiResponse({ status: 200, description: 'Adjustments retrieved' })
    @Get()
    findAll(@Query() query: ListAdjustmentsDto, @Req() req: any) {
        return this.service.findAll({
            ...query,
            clientId: req.client.id
        });
    }
    @ApiOperation({ summary: 'Get single adjustment' })
    @ApiParam({ name: 'id', description: 'Adjustment ID' })
    @ApiResponse({ status: 200, description: 'Adjustment retrieved' })
    @Get(':id')
    findOne(@Param('id') id: string, @Req() req: any) {
        return this.service.findOne(id, req.client.id);
    }

    @ApiOperation({ summary: 'Approve adjustment' })
    @ApiParam({ name: 'id' })
    @ApiBody({ schema: { properties: { approvedBy: { type: 'string' }}}})
    @ApiResponse({ status: 200, description: 'Adjustment approved' })
    @Post(':id/approve')
    approve(@Param('id') id: string, @Body('approvedBy') approvedBy: string, @Req() req: any) {
        return this.service.approve(id, approvedBy, req.client.id);
    }

    @ApiOperation({ summary: 'Reject adjustment' })
    @ApiParam({ name: 'id' })
    @ApiBody({ schema: { properties: { reason: { type: 'string' }}}})
    @ApiResponse({ status: 200, description: 'Adjustment rejected' })
    @Post(':id/reject')
    reject(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
        return this.service.reject(id, reason, req.client.id);
    }
}