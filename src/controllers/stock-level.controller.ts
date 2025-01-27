import {
    Controller,
    Get,
    Put,
    Body,
    Param,
    Query,
    UseGuards,
    Req
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { StockLevelService } from '../services/stock-level.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';

@ApiTags('Stock Levels')
@Controller('stock/levels')
@UseGuards(ClientAuthGuard)
export class StockLevelController {
    constructor(private readonly stockLevelService: StockLevelService) {}

    @Get()
    @ApiOperation({ summary: 'Get all stock levels' })
    @ApiQuery({ name: 'warehouseId', required: false })
    @ApiQuery({ name: 'productId', required: false })
    @ApiQuery({ name: 'belowReorderPoint', required: false, type: 'boolean' })
    async findAll(@Query() query: any, @Req() req: any) {
        return this.stockLevelService.findAll({
            ...query,
            clientId: req.client.id
        });
    }

    @Get(':warehouseId/:productId')
    @ApiOperation({ summary: 'Get stock level for specific product in warehouse' })
    @ApiParam({ name: 'warehouseId', description: 'Warehouse ID' })
    @ApiParam({ name: 'productId', description: 'Product ID' })
    async findOne(
        @Param('warehouseId') warehouseId: string,
        @Param('productId') productId: string
    ) {
        return this.stockLevelService.findOne(warehouseId, productId);
    }

    @Put(':warehouseId/:productId')
    @ApiOperation({ summary: 'Update stock level settings' })
    @ApiParam({ name: 'warehouseId', description: 'Warehouse ID' })
    @ApiParam({ name: 'productId', description: 'Product ID' })
    async update(
        @Param('warehouseId') warehouseId: string,
        @Param('productId') productId: string,
        @Body() updateData: any,
        @Req() req: any
    ) {
        return this.stockLevelService.createOrUpdate(
            warehouseId,
            productId,
            req.client.id,
            updateData
        );
    }

    @Get('low-stock')
    @ApiOperation({ summary: 'Get items below reorder point' })
    async getLowStockItems(@Req() req: any) {
        return this.stockLevelService.getLowStockItems(req.client.id);
    }

    @Put(':warehouseId/:productId/count')
    @ApiOperation({ summary: 'Record stock count' })
    @ApiParam({ name: 'warehouseId', description: 'Warehouse ID' })
    @ApiParam({ name: 'productId', description: 'Product ID' })
    async recordCount(
        @Param('warehouseId') warehouseId: string,
        @Param('productId') productId: string,
        @Body('quantity') quantity: number
    ) {
        return this.stockLevelService.recordCount(warehouseId, productId, quantity);
    }
}