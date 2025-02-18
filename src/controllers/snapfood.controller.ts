import { Controller, Get, Query, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { SnapfoodService } from '../services/snapfood.service';
import {
    CustomerListResponse,
    TotalOrdersResponse,
    OrderFrequencyResponse,
    OrderTimeAnalysisResponse,
    FavoriteDishesResponse,
    CuisinePreferencesResponse,
    OrderCustomizationsResponse
} from '../types/snapfood';

@ApiTags('SnapFood')
@ApiBearerAuth()
@Controller('sf')
export class SnapFoodController {
    constructor(private readonly snapfoodService: SnapfoodService) {}

    @Get('customers')
    @ApiOperation({ summary: 'List customers' })
    @ApiResponse({ status: 200, description: 'Returns customers list with pagination' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'per_page', required: false })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async listCustomers(
        @Query('page') page?: number,
        @Query('per_page') perPage?: number,
        @Query('search') search?: string,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<CustomerListResponse> {
        return await this.snapfoodService.listCustomers({
            page,
            per_page: perPage,
            search,
            start_date: startDate,
            end_date: endDate
        });
    }

    // Order History and Frequency endpoints
    @Get('customer/:id/total-orders')
    @ApiOperation({ summary: 'Get total orders for a customer' })
    @ApiResponse({ status: 200, description: 'Returns total number of orders' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getTotalOrders(
        @Param('id') id: string,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<TotalOrdersResponse> {
        return await this.snapfoodService.getTotalOrders(id, {
            start_date: startDate,
            end_date: endDate
        });
    }

    @Get('customer/:id/order-frequency')
    @ApiOperation({ summary: 'Get order frequency for a customer' })
    @ApiResponse({ status: 200, description: 'Returns order frequency data' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getOrderFrequency(
        @Param('id') id: string,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<OrderFrequencyResponse> {
        return await this.snapfoodService.getOrderFrequency(id, {
            start_date: startDate,
            end_date: endDate
        });
    }

    @Get('customer/:id/order-time-analysis')
    @ApiOperation({ summary: 'Get order time analysis for a customer' })
    @ApiResponse({ status: 200, description: 'Returns order time analysis data' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getOrderTimeAnalysis(
        @Param('id') id: string,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<OrderTimeAnalysisResponse> {
        return await this.snapfoodService.getOrderTimeAnalysis(id, {
            start_date: startDate,
            end_date: endDate
        });
    }

    // Order Preferences endpoints
    @Get('customer/:id/favorite-dishes')
    @ApiOperation({ summary: 'Get favorite dishes for a customer' })
    @ApiResponse({ status: 200, description: 'Returns favorite dishes data' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getFavoriteDishes(
        @Param('id') id: string,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<FavoriteDishesResponse> {
        return await this.snapfoodService.getFavoriteDishes(id, {
            start_date: startDate,
            end_date: endDate
        });
    }

    @Get('customer/:id/cuisine-preferences')
    @ApiOperation({ summary: 'Get cuisine preferences for a customer' })
    @ApiResponse({ status: 200, description: 'Returns cuisine preferences data' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getCuisinePreferences(
        @Param('id') id: string,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<CuisinePreferencesResponse> {
        return await this.snapfoodService.getCuisinePreferences(id, {
            start_date: startDate,
            end_date: endDate
        });
    }

    @Get('customer/:id/order-customizations')
    @ApiOperation({ summary: 'Get order customizations for a customer' })
    @ApiResponse({ status: 200, description: 'Returns order customizations data' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getOrderCustomizations(
        @Param('id') id: string,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<OrderCustomizationsResponse> {
        return await this.snapfoodService.getOrderCustomizations(id, {
            start_date: startDate,
            end_date: endDate
        });
    }
}