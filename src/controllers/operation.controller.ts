import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Req
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { OperationService } from '../services/operation.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { OperationType, OperationStatus } from '../enums/operations.enum';

@ApiTags('Operations')
@Controller('operations')
@UseGuards(ClientAuthGuard)
export class OperationController {
    constructor(private readonly operationService: OperationService) {}

    @Post()
    @ApiOperation({ summary: 'Create new operation' })
    @ApiResponse({ status: 201, description: 'Operation created successfully' })
    async create(@Body() createData: any, @Req() req: any) {
        return this.operationService.create({
            ...createData,
            clientId: req.client.id
        });
    }

    @Get()
    @ApiOperation({ summary: 'Get all operations' })
    @ApiQuery({ name: 'type', required: false, enum: OperationType })
    @ApiQuery({ name: 'status', required: false, enum: OperationStatus })
    @ApiQuery({ name: 'warehouseId', required: false })
    @ApiQuery({ name: 'startDate', required: false })
    @ApiQuery({ name: 'endDate', required: false })
    async findAll(@Query() query: any, @Req() req: any) {
        return this.operationService.findAll({
            ...query,
            clientId: req.client.id
        });
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get operation by id' })
    @ApiParam({ name: 'id', description: 'Operation ID' })
    async findOne(@Param('id') id: string) {
        return this.operationService.findOne(id);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update operation' })
    @ApiParam({ name: 'id', description: 'Operation ID' })
    async update(@Param('id') id: string, @Body() updateData: any) {
        return this.operationService.update(id, updateData);
    }

    @Put(':id/items')
    @ApiOperation({ summary: 'Update operation items' })
    @ApiParam({ name: 'id', description: 'Operation ID' })
    async updateItems(@Param('id') id: string, @Body() items: any[]) {
        return this.operationService.updateItems(id, items);
    }

    @Put(':id/complete')
    @ApiOperation({ summary: 'Complete operation' })
    @ApiParam({ name: 'id', description: 'Operation ID' })
    async complete(@Param('id') id: string) {
        return this.operationService.complete(id);
    }

    @Put(':id/cancel')
    @ApiOperation({ summary: 'Cancel operation' })
    @ApiParam({ name: 'id', description: 'Operation ID' })
    async cancel(@Param('id') id: string, @Body('reason') reason?: string) {
        return this.operationService.cancel(id, reason);
    }

    @Get('product/:productId')
    @ApiOperation({ summary: 'Get operations by product' })
    @ApiParam({ name: 'productId', description: 'Product ID' })
    async getByProduct(@Param('productId') productId: string, @Query() query: any) {
        return this.operationService.getOperationsByProduct(productId, query);
    }

    @Get('warehouse/:warehouseId')
    @ApiOperation({ summary: 'Get operations by warehouse' })
    @ApiParam({ name: 'warehouseId', description: 'Warehouse ID' })
    async getByWarehouse(@Param('warehouseId') warehouseId: string, @Query() query: any) {
        return this.operationService.getOperationsByWarehouse(warehouseId, query);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete operation' })
    @ApiParam({ name: 'id', description: 'Operation ID' })
    async delete(@Param('id') id: string) {
        return this.operationService.delete(id);
    }
}