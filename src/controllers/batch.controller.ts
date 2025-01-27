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
import { BatchService } from '../services/batch.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { BatchStatus } from '../enums/batches.enum';

@ApiTags('Batches')
@Controller('batches')
@UseGuards(ClientAuthGuard)
export class BatchController {
    constructor(private readonly batchService: BatchService) {}

    @ApiOperation({ summary: 'Create new batch' })
    @ApiResponse({ status: 201, description: 'Batch created successfully' })
    @Post()
    async create(@Body() createBatchDto: any, @Req() req: any) {
        return this.batchService.create({
            ...createBatchDto,
            clientId: req.client.id
        });
    }

    @ApiOperation({ summary: 'Get all batches' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    @ApiQuery({ name: 'status', required: false, enum: BatchStatus })
    @ApiQuery({ name: 'warehouseId', required: false })
    @ApiQuery({ name: 'productId', required: false })
    @ApiResponse({ status: 200, description: 'Return all batches' })
    @Get()
    async findAll(@Query() query: any, @Req() req: any) {
        return this.batchService.findAll({
            ...query,
            clientId: req.client.id
        });
    }

    @ApiOperation({ summary: 'Get batch by id' })
    @ApiParam({ name: 'id', description: 'Batch ID' })
    @ApiResponse({ status: 200, description: 'Return batch' })
    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.batchService.findOne(id);
    }

    @ApiOperation({ summary: 'Update batch' })
    @ApiParam({ name: 'id', description: 'Batch ID' })
    @ApiResponse({ status: 200, description: 'Batch updated successfully' })
    @Put(':id')
    async update(@Param('id') id: string, @Body() updateData: any) {
        return this.batchService.update(id, updateData);
    }

    @ApiOperation({ summary: 'Deactivate batch' })
    @ApiParam({ name: 'id', description: 'Batch ID' })
    @ApiResponse({ status: 200, description: 'Batch deactivated successfully' })
    @Put(':id/deactivate')
    async deactivate(@Param('id') id: string) {
        return this.batchService.deactivate(id);
    }

    @ApiOperation({ summary: 'Delete batch' })
    @ApiParam({ name: 'id', description: 'Batch ID' })
    @ApiResponse({ status: 200, description: 'Batch deleted successfully' })
    @Delete(':id')
    async remove(@Param('id') id: string) {
        return this.batchService.remove(id);
    }

    @ApiOperation({ summary: 'Get batches by product' })
    @ApiParam({ name: 'productId', description: 'Product ID' })
    @ApiResponse({ status: 200, description: 'Return batches for product' })
    @Get('product/:productId')
    async findByProduct(@Param('productId') productId: string, @Req() req: any) {
        return this.batchService.findByProduct(productId, req.client.id);
    }

    @ApiOperation({ summary: 'Get batches by warehouse' })
    @ApiParam({ name: 'warehouseId', description: 'Warehouse ID' })
    @ApiResponse({ status: 200, description: 'Return batches for warehouse' })
    @Get('warehouse/:warehouseId')
    async findByWarehouse(@Param('warehouseId') warehouseId: string, @Req() req: any) {
        return this.batchService.findByWarehouse(warehouseId, req.client.id);
    }

    @ApiOperation({ summary: 'Get active batches quantity' })
    @ApiQuery({ name: 'productId', required: true })
    @ApiQuery({ name: 'warehouseId', required: true })
    @ApiResponse({ status: 200, description: 'Return total quantity' })
    @Get('quantity')
    async getActiveBatchesQuantity(
        @Query('productId') productId: string,
        @Query('warehouseId') warehouseId: string
    ) {
        return this.batchService.getActiveBatchesQuantity(productId, warehouseId);
    }
}