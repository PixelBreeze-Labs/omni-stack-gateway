// src/controllers/community-report.controller.ts
import {
    Controller,
    Get,
    Post,
    Body,
    Put,
    Param,
    Delete,
    Query,
    Req,
    UseGuards,
    UseInterceptors,
    UploadedFiles,
    Optional, UnauthorizedException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiParam,
    ApiQuery,
    ApiConsumes
} from '@nestjs/swagger';
import { CommunityReportService } from '../services/community-report.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import {
    CreateCommunityReportDto,
    UpdateCommunityReportDto,
    ListCommunityReportDto
} from '../dtos/community-report.dto';
import { Report } from '../schemas/report.schema';
import { Client } from '../schemas/client.schema';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

@ApiTags('Community Reports')
@Controller('community-reports')
export class CommunityReportController {
    constructor(private readonly communityReportService: CommunityReportService) {}

    @Post()
    @ApiConsumes('multipart/form-data')
    @UseInterceptors((FileFieldsInterceptor as any)([
        { name: 'media', maxCount: 10 },
        { name: 'audio', maxCount: 1 }
    ]))

    @UseGuards(ClientAuthGuard)
    @Optional() // Make auth optional for anonymous reports
    @ApiOperation({ summary: 'Create a new community report' })
    @ApiResponse({
        status: 201,
        description: 'Community report has been successfully created',
        type: Report
    })
    @ApiResponse({ status: 400, description: 'Bad Request - Invalid input data' })
    async create(
        @Body() createReportDto: CreateCommunityReportDto,
        @UploadedFiles() files: {
            media?: Express.Multer.File[],
            audio?: Express.Multer.File[]
        },
        @Req() req: Request & { client: Client }
    ): Promise<Report> {
        // Parse location from string to object if it's a string
        if (typeof createReportDto.location === 'string') {
            createReportDto.location = JSON.parse(createReportDto.location);
        }

        return this.communityReportService.create(
            { ...createReportDto, clientId: req.client.id },
            files?.media || [],
            files?.audio?.[0]
        );
    }

    @Post('admin')
    @ApiConsumes('multipart/form-data')
    @UseInterceptors((FileFieldsInterceptor as any)([
        { name: 'media', maxCount: 10 },
        { name: 'audio', maxCount: 1 }
    ]))
    @UseGuards(ClientAuthGuard)
    @ApiOperation({ summary: 'Create a new community report from admin panel' })
    @ApiResponse({
        status: 201,
        description: 'Community report has been successfully created from admin',
        type: Report
    })
    @ApiResponse({ status: 400, description: 'Bad Request - Invalid input data' })
    async createFromAdmin(
        @Body() createReportDto: any,
        @UploadedFiles() files: {
            media?: Express.Multer.File[],
            audio?: Express.Multer.File[]
        },
        @Req() req: Request & { client: Client }
    ): Promise<Report> {
        try {
            // Add client ID to the report data
            const reportData = {
                ...createReportDto,
                clientId: req.client.id
            };

            // Call the dedicated service method that handles special cases
            return this.communityReportService.createFromAdmin(
                reportData,
                files?.media || [],
                files?.audio?.[0]
            );
        } catch (error) {
            console.error('Error creating admin report:', error);
            throw error;
        }
    }

    @ApiOperation({ summary: 'Get all community reports' })
    @ApiQuery({ type: ListCommunityReportDto })
    @ApiResponse({ status: 200, description: 'List of community reports' })
    @UseGuards(ClientAuthGuard)
    @Get()
    async findAll(
        @Query() query: ListCommunityReportDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.communityReportService.findAll({
            ...query,
            clientId: req.client.id
        });
    }

    @ApiOperation({ summary: 'Get featured community reports' })
    @ApiResponse({
        status: 200,
        description: 'Returns array of featured reports',
        type: [Report]
    })
    @UseGuards(ClientAuthGuard)
    @Get('featured')
    getFeaturedReports(
        @Req() req: Request & { client: Client }
    ) {
        return this.communityReportService.getFeaturedReports(req.client.id);
    }

    @ApiOperation({ summary: 'Get community reports for map view' })
    @ApiResponse({
        status: 200,
        description: 'Returns array of reports for map display',
        type: Report
    })
    @UseGuards(ClientAuthGuard)
    @Get('map')
    getMapReports(
        @Req() req: Request & { client: Client }
    ) {
        return this.communityReportService.getMapReports(req.client.id);
    }

    @ApiOperation({ summary: 'Get community reports near a specific location' })
    @ApiQuery({
        name: 'lat',
        required: true,
        type: Number,
        description: 'Latitude coordinate'
    })
    @ApiQuery({
        name: 'lng',
        required: true,
        type: Number,
        description: 'Longitude coordinate'
    })
    @ApiQuery({
        name: 'distance',
        required: false,
        type: Number,
        description: 'Search radius in meters (default: 5000)'
    })
    @ApiResponse({
        status: 200,
        description: 'Returns reports within specified radius',
        type: [Report]
    })
    @UseGuards(ClientAuthGuard)
    @Get('nearby')
    findNearby(
        @Query('lat') lat: number,
        @Query('lng') lng: number,
        @Req() req: Request & { client: Client },
        @Query('distance') distance?: number
    ) {
        return this.communityReportService.findNearby(lat, lng, req.client.id, distance);
    }

    @ApiOperation({ summary: 'Get statistics and data for the report form page' })
    @ApiResponse({
        status: 200,
        description: 'Returns recent reports and impact statistics'
    })
    @UseGuards(ClientAuthGuard)
    @Get('form-data')
    getReportFormData(
        @Req() req: Request & { client: Client }
    ) {
        return this.communityReportService.getReportFormData(req.client.id);
    }


    @ApiOperation({ summary: 'Get all community reports for admin' })
    @ApiQuery({ type: ListCommunityReportDto })
    @ApiResponse({ status: 200, description: 'List of all community reports (admin view)' })
    @UseGuards(ClientAuthGuard)
    @Get('admin')
    async getAdminReports(
        @Query() query: ListCommunityReportDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.communityReportService.getAdminReports({
            ...query,
            clientId: req.client.id
        });
    }

    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get community report by ID for admin' })
    @ApiParam({ name: 'id', description: 'Report ID' })
    @ApiResponse({ status: 200, description: 'Admin report details' })
    @UseGuards(ClientAuthGuard)
    @Get('admin/:id')
    async findOneAdmin(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ): Promise<Report> {
        return this.communityReportService.findOneAdmin(id, req.client.id);
    }

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Put(':id/tags')
    @ApiOperation({ summary: 'Update report tags' })
    async updateReportTags(
        @Param('id') id: string,
        @Body() data: { reportTags: string[] },
        @Req() req: Request & { client: Client }
    ): Promise<Report> {
        return this.communityReportService.updateReportTags(id, req.client.id, data.reportTags);
    }


    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update community report' })
    @ApiParam({ name: 'id', description: 'Report ID' })
    @ApiResponse({ status: 200, description: 'Report updated' })
    @UseGuards(ClientAuthGuard)
    @Put(':id')
    async update(
        @Param('id') id: string,
        @Body() updateReportDto: UpdateCommunityReportDto,
        @Req() req: Request & { client: Client }
    ): Promise<Report> {
        return this.communityReportService.update(id, req.client.id, updateReportDto);
    }

    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete community report' })
    @ApiParam({ name: 'id', description: 'Report ID' })
    @ApiResponse({ status: 200, description: 'Report deleted' })
    @UseGuards(ClientAuthGuard)
    @Delete(':id')
    async remove(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ): Promise<void> {
        await this.communityReportService.remove(id, req.client.id);
    }

    @ApiOperation({ summary: 'Get reports submitted by the current user' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'status', required: false })
    @ApiQuery({ name: 'sort', required: false })
    @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
    @ApiQuery({ name: 'userId', required: true, type: String, description: 'The user ID to fetch reports for' })
    @ApiResponse({
        status: 200,
        description: 'Returns reports submitted by the specified user',
        type: Report
    })
    @UseGuards(ClientAuthGuard) // Only need ClientAuthGuard, no JwtAuthGuard
    @Get('user')
    getUserReports(
        @Req() req: Request & { client: Client },
        @Query('userId') userId: string,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('status') status?: string,
        @Query('sort') sort?: string,
        @Query('order') order?: 'asc' | 'desc'
    ) {
        // Use userId from query params
        if (!userId) {
            throw new UnauthorizedException('User ID is required');
        }

        return this.communityReportService.getUserReports(
            userId,
            req.client.id,
            { page, limit, status, sort, order }
        );
    }

    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get community report by ID' })
    @ApiParam({ name: 'id', description: 'Report ID' })
    @ApiResponse({ status: 200, description: 'Report details' })
    @UseGuards(ClientAuthGuard)
    @Get(':id')
    async findOne(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ): Promise<Report> {
        return this.communityReportService.findOne(id, req.client.id);
    }


    @ApiOperation({ summary: 'Get report statistics for a user' })
    @ApiQuery({ name: 'userId', required: true, type: String, description: 'The user ID to get stats for' })
    @ApiResponse({
        status: 200,
        description: 'Returns report statistics for the specified user'
    })
    @UseGuards(ClientAuthGuard)
    @Get('stats')
    getReportStats(
        @Req() req: Request & { client: Client },
        @Query('userId') userId: string
    ) {
        if (!userId) {
            throw new UnauthorizedException('User ID is required');
        }

        return this.communityReportService.getReportStats(userId, req.client.id);
    }s

    @ApiOperation({ summary: 'Get overall dashboard statistics' })
    @ApiResponse({
        status: 200,
        description: 'Returns dashboard statistics'
    })
    @UseGuards(ClientAuthGuard)
    @Get('dashboard-stats')
    async getDashboardStats(
        @Req() req: Request & { client: Client }
    ) {
        return this.communityReportService.getDashboardStats(req.client.id);
    }

    @ApiOperation({ summary: 'Get reports by category' })
    @ApiResponse({
        status: 200,
        description: 'Returns report distribution by category'
    })
    @UseGuards(ClientAuthGuard)
    @Get('stats/by-category')
    async getReportsByCategory(
        @Req() req: Request & { client: Client }
    ) {
        return this.communityReportService.getReportsByCategory(req.client.id);
    }

    @ApiOperation({ summary: 'Get monthly report trends' })
    @ApiQuery({
        name: 'year',
        required: false,
        type: Number,
        description: 'Year for monthly trends (defaults to current year)'
    })
    @ApiResponse({
        status: 200,
        description: 'Returns report counts by month'
    })
    @UseGuards(ClientAuthGuard)
    @Get('stats/monthly')
    async getMonthlyReportTrends(
        @Req() req: Request & { client: Client },
        @Query('year') year?: number
    ) {
        return this.communityReportService.getMonthlyReportTrends(
            req.client.id,
            year || new Date().getFullYear()
        );
    }

    @ApiOperation({ summary: 'Get reports by status' })
    @ApiResponse({
        status: 200,
        description: 'Returns report counts by status'
    })
    @UseGuards(ClientAuthGuard)
    @Get('stats/by-status')
    async getReportsByStatus(
        @Req() req: Request & { client: Client }
    ) {
        return this.communityReportService.getReportsByStatus(req.client.id);
    }

    @ApiOperation({ summary: 'Get top report locations' })
    @ApiQuery({
        name: 'limit',
        required: false,
        type: Number,
        description: 'Number of locations to return (defaults to 5)'
    })
    @ApiResponse({
        status: 200,
        description: 'Returns top locations by report count'
    })
    @UseGuards(ClientAuthGuard)
    @Get('stats/top-locations')
    async getTopReportLocations(
        @Req() req: Request & { client: Client },
        @Query('limit') limit?: number
    ) {
        return this.communityReportService.getTopReportLocations(
            req.client.id,
            limit
        );
    }

    @ApiOperation({ summary: 'Get recent reports' })
    @ApiQuery({
        name: 'limit',
        required: false,
        type: Number,
        description: 'Number of reports to return (defaults to 5)'
    })
    @ApiResponse({
        status: 200,
        description: 'Returns recent reports'
    })
    @UseGuards(ClientAuthGuard)
    @Get('stats/recent')
    async getRecentReports(
        @Req() req: Request & { client: Client },
        @Query('limit') limit?: number
    ) {
        return this.communityReportService.getRecentReports(
            req.client.id,
            limit
        );
    }

    @ApiOperation({ summary: 'Get citizen engagement metrics' })
    @ApiResponse({
        status: 200,
        description: 'Returns user engagement metrics'
    })
    @UseGuards(ClientAuthGuard)
    @Get('engagement-metrics')
    async getCitizenEngagementMetrics(
        @Req() req: Request & { client: Client }
    ) {
        return this.communityReportService.getCitizenEngagementMetrics(req.client.id);
    }


    @ApiTags('Report Analytics')
    @ApiOperation({ summary: 'Get report resolution metrics' })
    @ApiQuery({
        name: 'startDate',
        required: false,
        type: String,
        description: 'Start date (YYYY-MM-DD)'
    })
    @ApiQuery({
        name: 'endDate',
        required: false,
        type: String,
        description: 'End date (YYYY-MM-DD)'
    })
    @ApiQuery({
        name: 'category',
        required: false,
        type: String,
        description: 'Filter by category'
    })
    @ApiResponse({
        status: 200,
        description: 'Returns resolution metrics'
    })
    @UseGuards(ClientAuthGuard)
    @Get('analytics/resolution')
    async getResolutionMetrics(
        @Req() req: Request & { client: Client },
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('category') category?: string
    ) {
        return this.communityReportService.getResolutionMetrics(
            req.client.id,
            { startDate, endDate, category }
        );
    }

    @ApiOperation({ summary: 'Get category trends' })
    @ApiQuery({
        name: 'startDate',
        required: false,
        type: String,
        description: 'Start date (YYYY-MM-DD)'
    })
    @ApiQuery({
        name: 'endDate',
        required: false,
        type: String,
        description: 'End date (YYYY-MM-DD)'
    })
    @ApiResponse({
        status: 200,
        description: 'Returns category trends'
    })
    @UseGuards(ClientAuthGuard)
    @Get('analytics/category-trends')
    async getCategoryTrends(
        @Req() req: Request & { client: Client },
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string
    ) {
        return this.communityReportService.getCategoryTrends(
            req.client.id,
            { startDate, endDate }
        );
    }

    @ApiOperation({ summary: 'Get geographic distribution' })
    @ApiQuery({
        name: 'startDate',
        required: false,
        type: String,
        description: 'Start date (YYYY-MM-DD)'
    })
    @ApiQuery({
        name: 'endDate',
        required: false,
        type: String,
        description: 'End date (YYYY-MM-DD)'
    })
    @ApiQuery({
        name: 'limit',
        required: false,
        type: Number,
        description: 'Number of hotspots to return (default: 5)'
    })
    @ApiResponse({
        status: 200,
        description: 'Returns geographic distribution data'
    })
    @UseGuards(ClientAuthGuard)
    @Get('analytics/geographic')
    async getGeographicDistribution(
        @Req() req: Request & { client: Client },
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('limit') limit?: number
    ) {
        return this.communityReportService.getGeographicDistribution(
            req.client.id,
            { startDate, endDate, limit }
        );
    }

    @ApiOperation({ summary: 'Get response time metrics' })
    @ApiQuery({
        name: 'startDate',
        required: false,
        type: String,
        description: 'Start date (YYYY-MM-DD)'
    })
    @ApiQuery({
        name: 'endDate',
        required: false,
        type: String,
        description: 'End date (YYYY-MM-DD)'
    })
    @ApiQuery({
        name: 'category',
        required: false,
        type: String,
        description: 'Filter by category'
    })
    @ApiResponse({
        status: 200,
        description: 'Returns response time metrics'
    })
    @UseGuards(ClientAuthGuard)
    @Get('analytics/response-time')
    async getResponseTimeMetrics(
        @Req() req: Request & { client: Client },
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('category') category?: string
    ) {
        return this.communityReportService.getResponseTimeMetrics(
            req.client.id,
            { startDate, endDate, category }
        );
    }

    @ApiOperation({ summary: 'Get user engagement metrics' })
    @ApiQuery({
        name: 'startDate',
        required: false,
        type: String,
        description: 'Start date (YYYY-MM-DD)'
    })
    @ApiQuery({
        name: 'endDate',
        required: false,
        type: String,
        description: 'End date (YYYY-MM-DD)'
    })
    @ApiResponse({
        status: 200,
        description: 'Returns user engagement metrics'
    })
    @UseGuards(ClientAuthGuard)
    @Get('analytics/user-engagement')
    async getUserEngagementMetrics(
        @Req() req: Request & { client: Client },
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string
    ) {
        return this.communityReportService.getUserEngagementMetrics(
            req.client.id,
            { startDate, endDate }
        );
    }

    @ApiOperation({ summary: 'Get comparative analysis' })
    @ApiQuery({
        name: 'startDate',
        required: false,
        type: String,
        description: 'Start date for current period (YYYY-MM-DD)'
    })
    @ApiQuery({
        name: 'endDate',
        required: false,
        type: String,
        description: 'End date for current period (YYYY-MM-DD)'
    })
    @ApiResponse({
        status: 200,
        description: 'Returns comparative analysis'
    })
    @UseGuards(ClientAuthGuard)
    @Get('analytics/comparative')
    async getComparativeAnalysis(
        @Req() req: Request & { client: Client },
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string
    ) {
        return this.communityReportService.getComparativeAnalysis(
            req.client.id,
            { startDate, endDate }
        );
    }

    @ApiOperation({ summary: 'Get trending keywords' })
    @ApiQuery({
        name: 'startDate',
        required: false,
        type: String,
        description: 'Start date (YYYY-MM-DD)'
    })
    @ApiQuery({
        name: 'endDate',
        required: false,
        type: String,
        description: 'End date (YYYY-MM-DD)'
    })
    @ApiQuery({
        name: 'limit',
        required: false,
        type: Number,
        description: 'Number of keywords to return (default: 10)'
    })
    @ApiResponse({
        status: 200,
        description: 'Returns trending keywords'
    })
    @UseGuards(ClientAuthGuard)
    @Get('analytics/keywords')
    async getTrendingKeywords(
        @Req() req: Request & { client: Client },
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('limit') limit?: number
    ) {
        return this.communityReportService.getTrendingKeywords(
            req.client.id,
            { startDate, endDate, limit }
        );
    }
}