// src/controllers/promotion.controller.ts
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
import { PromotionService } from '../services/promotion.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';

@ApiTags('Promotions')
@ApiBearerAuth()
@Controller('promotions')
@UseGuards(ClientAuthGuard)
export class PromotionController {
    constructor(
        private readonly promotionService: PromotionService
    ) {}

    /**
     * Get all promotions with filtering and pagination
     */
    @Get()
    @ApiOperation({ summary: 'Get all promotions with filtering and pagination' })
    @ApiResponse({
        status: 200,
        description: 'Returns a list of promotions'
    })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'search', required: false, type: String })
    @ApiQuery({ name: 'status', required: false, type: Boolean })
    @ApiQuery({ name: 'type', required: false, enum: ['discount', 'coupon'] })
    async getPromotions(
        @Req() req: Request & { client: Client },
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
        @Query('status', new DefaultValuePipe(true), ParseBoolPipe) status?: boolean,
        @Query('type') type?: string
    ) {
        return this.promotionService.findAll(req.client.id, {
            page,
            limit,
            search,
            status,
            type
        });
    }

    /**
     * Get a promotion by ID
     */
    @Get(':id')
    @ApiOperation({ summary: 'Get a promotion by ID' })
    @ApiResponse({
        status: 200,
        description: 'Returns a promotion by ID'
    })
    async getPromotionById(
        @Req() req: Request & { client: Client },
        @Param('id') id: string
    ) {
        return this.promotionService.findById(req.client.id, id);
    }

    /**
     * Sync promotions from VenueBoost
     */
    @Post('sync')
    @ApiOperation({ summary: 'Sync promotions from VenueBoost' })
    @ApiResponse({
        status: 200,
        description: 'Promotions synced successfully'
    })
    async syncPromotions(@Req() req: Request & { client: Client }) {
        return this.promotionService.syncPromotionsFromVenueBoost(req.client.id);
    }

    /**
     * Delete a promotion
     */
    @Delete(':id')
    @ApiOperation({ summary: 'Delete a promotion' })
    @ApiResponse({
        status: 200,
        description: 'Promotion deleted successfully'
    })
    @ApiResponse({
        status: 404,
        description: 'Promotion not found'
    })
    async deletePromotion(
        @Req() req: Request & { client: Client },
        @Param('id') id: string
    ) {
        return this.promotionService.deletePromotion(req.client.id, id);
    }
}