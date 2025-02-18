import { Controller, Get, Query, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';  // Add this import
import { SnapfoodService } from '../services/snapfood.service';
import {
    CustomerListResponse,
    TotalOrdersResponse,
    OrderFrequencyResponse,
    OrderTimeAnalysisResponse,
    FavoriteDishesResponse,
    CuisinePreferencesResponse,
    OrderCustomizationsResponse,
    ReviewAndFeedbackResponse,
    InteractionWithPromotionsResponse,
    TotalSpendResponse,
    AverageOrderValueResponse,
    CustomerGeneralStatsResponse,
    GeneralInfoResponse,
    OrderListResponse,
    WalletCreditsResponse,
    WalletCustomersResponse,
    FeatureUsageResponse,
    SocialStatsResponse,
    TopVendorsResponse,
    TopCustomersResponse,
    OrdersBySourceResponse,
    OrdersByHoursResponse,
    RevenueDataResponse,
    OrderReportResponse,
    CustomerReportResponse,
    RecentOrdersResponse
} from '../types/snapfood.types';

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

    // Spending Behavior endpoints
    @Get('customer/:id/average-order-value')
    @ApiOperation({ summary: 'Get average order value for a customer' })
    @ApiResponse({ status: 200, description: 'Returns average order value in Lek' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getAverageOrderValue(
        @Param('id') id: string,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<AverageOrderValueResponse> {
        return await this.snapfoodService.getAverageOrderValue(id, {
            start_date: startDate,
            end_date: endDate
        });
    }

    @Get('customer/:id/total-spend')
    @ApiOperation({ summary: 'Get total spend for a customer' })
    @ApiResponse({ status: 200, description: 'Returns total spend in Lek' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getTotalSpend(
        @Param('id') id: string,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<TotalSpendResponse> {
        return await this.snapfoodService.getTotalSpend(id, {
            start_date: startDate,
            end_date: endDate
        });
    }

    // Engagement Metrics endpoints
    @Get('customer/:id/interaction-with-promotions')
    @ApiOperation({ summary: 'Get promotion interactions for a customer' })
    @ApiResponse({ status: 200, description: 'Returns coupon and discount usage data' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getInteractionWithPromotions(
        @Param('id') id: string,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<InteractionWithPromotionsResponse> {
        return await this.snapfoodService.getInteractionWithPromotions(id, {
            start_date: startDate,
            end_date: endDate
        });
    }

    @Get('customer/:id/review-and-feedback')
    @ApiOperation({ summary: 'Get reviews and feedback for a customer' })
    @ApiResponse({ status: 200, description: 'Returns average ratings for products, vendors, and riders' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getReviewAndFeedback(
        @Param('id') id: string,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<ReviewAndFeedbackResponse> {
        return await this.snapfoodService.getReviewAndFeedback(id, {
            start_date: startDate,
            end_date: endDate
        });
    }


    @Get('customer/:id/general-info')
    @ApiOperation({ summary: 'Get general customer information' })
    @ApiResponse({ status: 200, description: 'Returns detailed customer information including orders and preferences' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getGeneralInfo(
        @Param('id') id: string,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<GeneralInfoResponse> {
        return await this.snapfoodService.getGeneralInfo(id, {
            start_date: startDate,
            end_date: endDate
        });
    }

    @Get('export-products')
    @ApiOperation({ summary: 'Export vendor products to CSV' })
    @ApiResponse({ status: 200, description: 'Returns CSV file with vendor products' })
    @ApiQuery({ name: 'vendor_id', required: true })
    async exportProducts(
        @Query('vendor_id') vendorId: string,
        @Res() res: Response
    ): Promise<void> {
        const result = await this.snapfoodService.exportProducts(vendorId);

        Object.entries(result.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
        });

        res.send(result.data);
    }

    @Get('statistics/customer-insights/general-report')
    @ApiOperation({ summary: 'Get general customer statistics' })
    @ApiResponse({ status: 200, description: 'Returns general customer statistics and insights' })
    async getCustomerGeneralStats(): Promise<CustomerGeneralStatsResponse> {
        return await this.snapfoodService.getCustomerGeneralStats();
    }

    @Get('orders')
    @ApiOperation({ summary: 'List orders' })
    @ApiResponse({ status: 200, description: 'Returns orders list with statistics' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'per_page', required: false })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async listOrders(
        @Query('page') page?: number,
        @Query('per_page') perPage?: number,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<OrderListResponse> {
        return await this.snapfoodService.listOrders({
            page,
            per_page: perPage,
            start_date: startDate,
            end_date: endDate
        });
    }

    @Get('statistics/wallet/credits')
    @ApiOperation({ summary: 'Get wallet credits statistics' })
    @ApiResponse({ status: 200, description: 'Returns wallet credit usage statistics' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getWalletCredits(
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<WalletCreditsResponse> {
        return await this.snapfoodService.getWalletCredits({
            start_date: startDate,
            end_date: endDate
        });
    }

    @Get('statistics/wallet/customers')
    @ApiOperation({ summary: 'Get wallet customers statistics' })
    @ApiResponse({ status: 200, description: 'Returns wallet customer usage statistics' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getWalletCustomers(
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<WalletCustomersResponse> {
        return await this.snapfoodService.getWalletCustomers({
            start_date: startDate,
            end_date: endDate
        });
    }

    @Get('statistics/feature-usage/stats')
    @ApiOperation({ summary: 'Get feature usage statistics' })
    @ApiResponse({ status: 200, description: 'Returns feature usage and click statistics' })
    async getFeatureUsageStats(): Promise<FeatureUsageResponse> {
        return await this.snapfoodService.getFeatureUsageStats();
    }

    @Get('statistics/social/general-report')
    @ApiOperation({ summary: 'Get social statistics' })
    @ApiResponse({ status: 200, description: 'Returns social interaction statistics' })
    async getSocialStats(): Promise<SocialStatsResponse> {
        return await this.snapfoodService.getSocialStats();
    }

    @Get('statistics/orders/topvendors')
    @ApiOperation({ summary: 'Get top vendors statistics' })
    @ApiResponse({ status: 200, description: 'Returns top performing vendors' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getTopVendors(
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<TopVendorsResponse> {
        return await this.snapfoodService.getTopVendors({ start_date: startDate, end_date: endDate });
    }

    @Get('statistics/orders/topcustomers')
    @ApiOperation({ summary: 'Get top customers statistics' })
    @ApiResponse({ status: 200, description: 'Returns top customers by orders and spending' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getTopCustomers(
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<TopCustomersResponse> {
        return await this.snapfoodService.getTopCustomers({ start_date: startDate, end_date: endDate });
    }

    @Get('statistics/orders/get-by-source')
    @ApiOperation({ summary: 'Get orders by source' })
    @ApiResponse({ status: 200, description: 'Returns order distribution by source' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getOrdersBySource(
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<OrdersBySourceResponse> {
        return await this.snapfoodService.getOrdersBySource({ start_date: startDate, end_date: endDate });
    }

    @Get('statistics/orders/get-by-hours')
    @ApiOperation({ summary: 'Get orders by hours' })
    @ApiResponse({ status: 200, description: 'Returns order distribution by hours' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getOrdersByHours(
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<OrdersByHoursResponse> {
        return await this.snapfoodService.getOrdersByHours({ start_date: startDate, end_date: endDate });
    }

    @Get('statistics/orders/get-revenue')
    @ApiOperation({ summary: 'Get revenue data' })
    @ApiResponse({ status: 200, description: 'Returns revenue statistics' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getRevenueData(
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<RevenueDataResponse> {
        return await this.snapfoodService.getRevenueData({ start_date: startDate, end_date: endDate });
    }

    @Get('statistics/orders/report')
    @ApiOperation({ summary: 'Get order report' })
    @ApiResponse({ status: 200, description: 'Returns order status report' })
    async getOrderReport(): Promise<OrderReportResponse> {
        return await this.snapfoodService.getOrderReport();
    }

    @Get('statistics/orders/customer-report')
    @ApiOperation({ summary: 'Get customer report' })
    @ApiResponse({ status: 200, description: 'Returns customer statistics report' })
    async getCustomerReport(): Promise<CustomerReportResponse> {
        return await this.snapfoodService.getCustomerReport();
    }

    @Get('orders-recent-ten')
    @ApiOperation({ summary: 'Get recent orders' })
    @ApiResponse({ status: 200, description: 'Returns most recent orders with statistics' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'per_page', required: false })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getRecentOrders(
        @Query('page') page?: number,
        @Query('per_page') perPage?: number,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<RecentOrdersResponse> {
        return await this.snapfoodService.getRecentOrders({
            page,
            per_page: perPage,
            start_date: startDate,
            end_date: endDate
        });
    }
}