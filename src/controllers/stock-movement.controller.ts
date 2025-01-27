import {
    Controller,
    Get,
    Query,
    Param,
    UseGuards
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { StockMovementService } from '../services/stock-movement.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { StockMovementType } from '../enums/stock.enum';

@ApiTags('Stock Movements')
@Controller('stock/movements')
@UseGuards(ClientAuthGuard)
export class StockMovementController {
    constructor(private readonly stockMovementService: StockMovementService) {}

    @Get()
    @ApiOperation({ summary: 'Get all stock movements' })
    @ApiQuery({ name: 'warehouseId', required: false })
    @ApiQuery({ name: 'productId', required: false })
    @ApiQuery({ name: 'type', required: false, enum: StockMovementType })
    @ApiQuery({ name: 'startDate', required: false })
    @ApiQuery({ name: 'endDate', required: false })
    async findAll(@Query() query: any) {
        return this.stockMovementService.findAll(query);
    }

    @Get('product/:productId')
    @ApiOperation({ summary: 'Get movements for specific product' })
    @ApiParam({ name: 'productId', description: 'Product ID' })
    @ApiQuery({ name: 'startDate', required: false })
    @ApiQuery({ name: 'endDate', required: false })
    async getProductMovements(
        @Param('productId') productId: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string
    ) {
        return this.stockMovementService.getProductMovements(
            productId,
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined
        );
    }

    @Get('warehouse/:warehouseId')
    @ApiOperation({ summary: 'Get movements for specific warehouse' })
    @ApiParam({ name: 'warehouseId', description: 'Warehouse ID' })
    @ApiQuery({ name: 'startDate', required: false })
    @ApiQuery({ name: 'endDate', required: false })
    async getWarehouseMovements(
        @Param('warehouseId') warehouseId: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string
    ) {
        return this.stockMovementService.getWarehouseMovements(
            warehouseId,
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined
        );
    }
}