import {
    Controller,
    Get,
    Query,
    Param,
    Res,
    UseGuards,
    Post,
    Body,
    UploadedFile,
    Put,
    Delete,
    UseInterceptors, HttpStatus, HttpException
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express'; // Import FileInterceptor

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
    RecentOrdersResponse,
    DateRangeChartData,
    PromotionStats,
    CashbackStats,
    BlogSendNotificationResponse,
    BlogNotificationReadResponse,
    BlogResponse,
    BlogCreateResponse,
    BlogToggleStatusResponse,
    BlogsResponse, BlogCategoriesResponse, BlogUpdateResponse, BlogDeleteResponse
} from '../types/snapfood.types';
import {ClientAuthGuard} from "../guards/client-auth.guard";
import {IsSnapFood} from "../decorators/snapfood.decorator";

@ApiTags('SnapFood')
@ApiBearerAuth()
@Controller('sf')
@UseGuards(ClientAuthGuard)
@IsSnapFood()
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

    // Coupon Statistics
    @Get('statistics/coupons/totalAmount')
    @ApiOperation({ summary: 'Get total amount of coupons used' })
    @ApiResponse({ status: 200, description: 'Returns total coupon amount by date' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getTotalCouponsAmount(
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<DateRangeChartData> {
        return await this.snapfoodService.getTotalCouponsAmount({
            start_date: startDate,
            end_date: endDate
        });
    }

    @Get('statistics/coupons/totalOrders')
    @ApiOperation({ summary: 'Get total orders with coupons' })
    @ApiResponse({ status: 200, description: 'Returns total orders using coupons by date' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getTotalOrdersCoupons(
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<DateRangeChartData> {
        return await this.snapfoodService.getTotalOrdersCoupons({
            start_date: startDate,
            end_date: endDate
        });
    }

    // Discount Statistics
    @Get('statistics/discounts/totalAmount')
    @ApiOperation({ summary: 'Get total amount of discounts used' })
    @ApiResponse({ status: 200, description: 'Returns total discount amount by date' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getTotalDiscountsAmount(
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<DateRangeChartData> {
        return await this.snapfoodService.getTotalDiscountsAmount({
            start_date: startDate,
            end_date: endDate
        });
    }

    @Get('statistics/discounts/totalOrders')
    @ApiOperation({ summary: 'Get total orders with discounts' })
    @ApiResponse({ status: 200, description: 'Returns total orders using discounts by date' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getTotalOrdersDiscounts(
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<DateRangeChartData> {
        return await this.snapfoodService.getTotalOrdersDiscounts({
            start_date: startDate,
            end_date: endDate
        });
    }

    // Promotion Statistics
    @Get('statistics/promotions/totalAmount')
    @ApiOperation({ summary: 'Get total amount of promotions used' })
    @ApiResponse({ status: 200, description: 'Returns total promotion amount by date' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getTotalPromotionsAmount(
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<DateRangeChartData> {
        return await this.snapfoodService.getTotalPromotionsAmount({
            start_date: startDate,
            end_date: endDate
        });
    }

    @Get('statistics/promotions/totalOrders')
    @ApiOperation({ summary: 'Get total orders with promotions' })
    @ApiResponse({ status: 200, description: 'Returns total orders using promotions by date' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getTotalOrdersPromotions(
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<DateRangeChartData> {
        return await this.snapfoodService.getTotalOrdersPromotions({
            start_date: startDate,
            end_date: endDate
        });
    }

    @Get('statistics/promotions')
    @ApiOperation({ summary: 'Get active promotions' })
    @ApiResponse({ status: 200, description: 'Returns list of active promotions with usage statistics' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getActivePromotions(
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<PromotionStats['active_promotions']> {
        return await this.snapfoodService.getActivePromotions({
            start_date: startDate,
            end_date: endDate
        });
    }

    // Cashback Statistics
    @Get('statistics/cashback/totalAmountEarned')
    @ApiOperation({ summary: 'Get total amount of cashback earned' })
    @ApiResponse({ status: 200, description: 'Returns total cashback earned by date' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getTotalCashbackEarned(
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<DateRangeChartData> {
        return await this.snapfoodService.getTotalCashbackEarned({
            start_date: startDate,
            end_date: endDate
        });
    }

    @Get('statistics/cashback/totalAmountUsed')
    @ApiOperation({ summary: 'Get total amount of cashback used' })
    @ApiResponse({ status: 200, description: 'Returns total cashback used by date' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getTotalCashbackUsed(
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<DateRangeChartData> {
        return await this.snapfoodService.getTotalCashbackUsed({
            start_date: startDate,
            end_date: endDate
        });
    }

    @Get('statistics/cashback/mostUsedValues')
    @ApiOperation({ summary: 'Get most used cashback values' })
    @ApiResponse({ status: 200, description: 'Returns statistics about most frequently used cashback amounts' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    async getMostUsedCashbackValues(
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<CashbackStats['most_used_values']> {
        return await this.snapfoodService.getMostUsedCashbackValues({
            start_date: startDate,
            end_date: endDate
        });
    }

    @Get('vendors')
    @ApiOperation({ summary: 'List vendors' })
    @ApiResponse({ status: 200, description: 'Returns vendors list with pagination' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'per_page', required: false })
    async listVendors(
        @Query('page') page?: number,
        @Query('per_page') perPage?: number,
    ): Promise<any> {
        return await this.snapfoodService.listVendors({
            page,
            per_page: perPage
        });
    }

    @Get('blogs/categories')
    @ApiOperation({ summary: 'List blog categories' })
    @ApiResponse({ status: 200, description: 'Returns list of blog categories' })
    async listBlogCategories(): Promise<BlogCategoriesResponse> {
        return await this.snapfoodService.listBlogCategories();
    }

    @Get('blogs')
    @ApiOperation({ summary: 'List blogs' })
    @ApiResponse({ status: 200, description: 'Returns list of blogs with pagination' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'per_page', required: false })
    @ApiQuery({ name: 'category_id', required: false })
    @ApiQuery({ name: 'title', required: false })
    @ApiQuery({ name: 'active', required: false, type: 'boolean' })
    async listBlogs(
        @Query('page') page?: number,
        @Query('per_page') perPage?: number,
        @Query('category_id') categoryId?: number,
        @Query('title') title?: string,
        @Query('active') active?: boolean,
    ): Promise<BlogsResponse> {
        // Convert string 'true'/'false' to actual boolean if the parameter is provided
        let activeBoolean: boolean | undefined = undefined;
        if (active !== undefined) {
            activeBoolean = active;
        }

        return await this.snapfoodService.listBlogs({
            page,
            per_page: perPage,
            category_id: categoryId,
            title,
            active: activeBoolean
        });
    }

    @Get('blogs/:id')
    @ApiOperation({ summary: 'Get blog by ID' })
    @ApiResponse({ status: 200, description: 'Returns blog details' })
    @ApiResponse({ status: 404, description: 'Blog not found' })
    async getBlog(@Param('id') id: string): Promise<BlogResponse> {
        return await this.snapfoodService.getBlog(id);
    }

    @Post('blogs')
    @ApiOperation({ summary: 'Create a new blog' })
    @UseInterceptors(FileInterceptor('image_cover'))
    async createBlog(
        @Body() createBlogDto: any,
        @UploadedFile() image?: Express.Multer.File,
    ): Promise<BlogCreateResponse> {
        try {
            if (image) {
                // With image: use FormData
                const formData = new FormData();

                // Add all fields to FormData
                for (const key in createBlogDto) {
                    formData.append(key, createBlogDto[key]);
                }

                // Add image to FormData
                const blob = new Blob([image.buffer]);
                formData.append('image_cover', blob, image.originalname);

                return await this.snapfoodService.createBlog(formData);
            } else {
                // Without image: use regular JSON body
                return await this.snapfoodService.createBlog(createBlogDto);
            }
        } catch (error) {
            console.error('Failed to create blog:', error);
            throw error;
        }
    }

    @Put('blogs/:id')
    @ApiOperation({ summary: 'Update blog' })
    @ApiResponse({ status: 200, description: 'Returns updated blog details' })
    @ApiResponse({ status: 404, description: 'Blog not found' })
    @ApiResponse({ status: 422, description: 'Validation error' })
    @UseInterceptors(FileInterceptor('image_cover'))
    async updateBlog(
        @Param('id') id: string,
        @Body() updateBlogDto: any,
        @UploadedFile() image?: Express.Multer.File,
    ): Promise<BlogUpdateResponse> {
        const formData = new FormData();
        for (const key in updateBlogDto) {
            formData.append(key, updateBlogDto[key]);
        }
        if (image) {
            // Try creating a Blob-like object from the buffer
            const blob = new Blob([image.buffer]);
            formData.append('image_cover', blob, image.originalname);
        }
        return await this.snapfoodService.updateBlog(id, formData);
    }

    @Delete('blogs/:id')
    @ApiOperation({ summary: 'Delete blog' })
    @ApiResponse({ status: 200, description: 'Blog deleted successfully' })
    @ApiResponse({ status: 404, description: 'Blog not found' })
    async deleteBlog(@Param('id') id: string): Promise<BlogDeleteResponse> {
        return await this.snapfoodService.deleteBlog(id);
    }

    @Put('blogs/:id/toggle-status')
    @ApiOperation({ summary: 'Toggle blog status (active/inactive)' })
    @ApiResponse({ status: 200, description: 'Blog status toggled successfully' })
    @ApiResponse({ status: 404, description: 'Blog not found' })
    async toggleBlogStatus(@Param('id') id: string): Promise<BlogToggleStatusResponse> {
        return await this.snapfoodService.toggleBlogStatus(id);
    }


    @Put('blogs/:id/notification-read')
    @ApiOperation({ summary: 'Increment notification read count for a blog' })
    @ApiResponse({ status: 200, description: 'Notification read count incremented successfully' })
    @ApiResponse({ status: 404, description: 'Blog not found' })
    async incrementNotificationReadCount(@Param('id') id: string): Promise<BlogNotificationReadResponse> {
        return await this.snapfoodService.incrementNotificationReadCount(id);
    }

    @Post('blogs/:id/send-notification')
    @ApiOperation({ summary: 'Send notification for a blog' })
    @ApiResponse({ status: 200, description: 'Notification sent successfully' })
    @ApiResponse({ status: 404, description: 'Blog not found or no devices available' })
    @ApiResponse({ status: 422, description: 'Validation error' })
    async sendBlogNotification(
        @Param('id') id: string,
        @Body() notificationDto: {
            notification_title: string;
            notification_title_en: string;
            target_user_id?: number;
        }
    ): Promise<BlogSendNotificationResponse> {
        return await this.snapfoodService.sendBlogNotification(id, notificationDto);
    }

    @Post('blogs/upload-image')
    @ApiOperation({ summary: 'Upload an image for a blog post' })
    @ApiResponse({ status: 200, description: 'Returns URL of the uploaded image' })
    @ApiResponse({ status: 500, description: 'Upload failed' })
    @UseInterceptors(FileInterceptor('image'))
    async uploadBlogImage(
        @UploadedFile() file: Express.Multer.File
    ): Promise<{ success: boolean; url: string }> {
        if (!file) {
            throw new HttpException('No image file provided', HttpStatus.BAD_REQUEST);
        }

        // Check file type
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedMimeTypes.includes(file.mimetype)) {
            throw new HttpException(
                'Invalid file type. Only JPG, PNG, GIF and WEBP images are allowed.',
                HttpStatus.BAD_REQUEST
            );
        }

        // Check file size (limit to 5MB)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            throw new HttpException(
                'File too large. Maximum size is 5MB.',
                HttpStatus.BAD_REQUEST
            );
        }

        return await this.snapfoodService.uploadBlogImage(file.buffer, file.originalname);
    }

}