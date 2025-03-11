// src/controllers/discount.controller.ts
import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    UseGuards,
    Req,
    Query,
    DefaultValuePipe,
    ParseIntPipe,
    ParseBoolPipe
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DiscountService } from '../services/discount.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { DiscountType } from '../schemas/discount.schema';
import { Client } from '../schemas/client.schema';

@ApiTags('Discounts')
@ApiBearerAuth()
@Controller('discounts')
@UseGuards(ClientAuthGuard)
export class DiscountController {
    constructor(
        private readonly discountService: DiscountService
    ) {}

    /**
     * Get all discounts with filtering and pagination
     */
    @Get()
    @ApiOperation({ summary: 'Get all discounts with filtering and pagination' })
    @ApiResponse({
        status: 200,
        description: 'Returns a list of discounts'
    })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'search', required: false, type: String })
    @ApiQuery({ name: 'status', required: false, type: Boolean })
    @ApiQuery({ name: 'type', required: false, enum: DiscountType })
    async getDiscounts(
        @Req() req: Request & { client: Client },
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
        @Query('status', new DefaultValuePipe(true), ParseBoolPipe) status?: boolean,
        @Query('type') type?: DiscountType
    ) {
        return this.discountService.findAll(req.client.id, {
            page,
            limit,
            search,
            status,
            type
        });
    }

    /**
     * Get a discount by ID
     */
    @Get(':id')
    @ApiOperation({ summary: 'Get a discount by ID' })
    @ApiResponse({
        status: 200,
        description: 'Returns a discount by ID'
    })
    async getDiscountById(
        @Req() req: Request & { client: Client },
        @Param('id') id: string
    ) {
        return this.discountService.findById(req.client.id, id);
    }

    /**
     * Sync discounts from VenueBoost
     */
    @Post('sync')
    @ApiOperation({ summary: 'Sync discounts from VenueBoost' })
    @ApiResponse({
        status: 200,
        description: 'Discounts synced successfully'
    })
    async syncDiscounts(@Req() req: Request & { client: Client }) {
        return this.discountService.syncDiscountsFromVenueBoost(req.client.id);
    }

    /**
     * Delete a discount
     */
    @Delete(':id')
    @ApiOperation({ summary: 'Delete a discount' })
    @ApiResponse({
        status: 200,
        description: 'Discount deleted successfully'
    })
    @ApiResponse({
        status: 404,
        description: 'Discount not found'
    })
    async deleteDiscount(
        @Req() req: Request & { client: Client },
        @Param('id') id: string
    ) {
        return this.discountService.deleteDiscount(req.client.id, id);
    }
}