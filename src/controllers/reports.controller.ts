// Extended ReportsController with community reporting features
import {
    Controller,
    Get,
    Post,
    Body,
    Put,
    Param,
    Delete,
    Query,
    UseInterceptors,
    UploadedFiles,
    Optional,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiQuery,
    ApiConsumes,
    ApiBody
} from '@nestjs/swagger';
import { ReportsService } from '../services/reports.service';
import { Report } from '../interfaces/report.interface';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { CreateReportDto } from '../modules/report/dtos/create-report.dto';
import { UpdateReportDto } from '../modules/report/dtos/update-report.dto';

@ApiTags('Reports')
@Controller('api/reports')
export class ReportsController {
    constructor(private readonly reportsService: ReportsService) {}

    // Existing endpoints
    @ApiOperation({ summary: 'Create new report' })
    @ApiResponse({ status: 201, description: 'Report created' })
    @Post()
    async createReport(@Body() report: Report) {
        return await this.reportsService.create(report);
    }

    @ApiOperation({ summary: 'Get all reports' })
    @ApiQuery({ type: Object, description: 'Query filters' })
    @Get()
    async getAllReports(@Query() query: any) {
        return await this.reportsService.findAll(query);
    }

    @ApiOperation({ summary: 'Get report by ID' })
    @ApiParam({ name: 'id', description: 'Report ID' })
    @Get(':id')
    async getReport(@Param('id') id: string) {
        return await this.reportsService.findOne(id);
    }

    @ApiOperation({ summary: 'Update report' })
    @ApiParam({ name: 'id' })
    @Put(':id')
    async updateReport(@Param('id') id: string, @Body() report: Partial<Report>) {
        return await this.reportsService.update(id, report);
    }

    @ApiOperation({ summary: 'Update report status' })
    @ApiParam({ name: 'id' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    enum: ['pending', 'reviewed', 'archived']
                }
            }
        }
    })
    @Put(':id/status')
    async updateStatus(
        @Param('id') id: string,
        @Body('status') status: 'pending' | 'reviewed' | 'archived'
    ) {
        return await this.reportsService.updateStatus(id, status);
    }

    @ApiOperation({ summary: 'Delete report' })
    @ApiParam({ name: 'id' })
    @Delete(':id')
    async deleteReport(@Param('id') id: string) {
        return await this.reportsService.delete(id);
    }

    // New community reporting endpoints
    @Post('community')
    @ApiConsumes('multipart/form-data')
    @UseInterceptors(
        FileFieldsInterceptor([
            { name: 'media', maxCount: 10 },
            { name: 'audio', maxCount: 1 }
        ])
    )
    @Optional() // Make auth optional
    @ApiOperation({ summary: 'Create a new community report' })
    @ApiResponse({
        status: 201,
        description: 'Community report has been successfully created',
        type: Report
    })
    @ApiResponse({ status: 400, description: 'Bad Request - Invalid input data' })
    async createCommunityReport(
        @Body() createReportDto: CreateReportDto,
        @UploadedFiles() files: {
            media?: Express.Multer.File[],
            audio?: Express.Multer.File[]
        }
    ) {
        // Parse location from string to object if it's a string
        if (typeof createReportDto.location === 'string') {
            createReportDto.location = JSON.parse(createReportDto.location);
        }

        return this.reportsService.createCommunityReport(
            createReportDto,
            files?.media || [],
            files?.audio?.[0]
        );
    }

    @Get('community')
    @ApiOperation({ summary: 'Get paginated and filtered community reports' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'category', required: false, type: String })
    @ApiQuery({ name: 'status', required: false, type: String })
    @ApiQuery({ name: 'sortBy', required: false, type: String })
    async findAllCommunityReports(
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('category') category?: string,
        @Query('status') status?: string,
        @Query('sortBy') sortBy?: string,
    ) {
        return this.reportsService.findAllCommunityReports({
            page,
            limit,
            category,
            status,
            sortBy
        });
    }

    @Get('community/featured')
    @ApiOperation({ summary: 'Get featured community reports' })
    @ApiResponse({
        status: 200,
        description: 'Returns array of featured reports',
        type: [Report]
    })
    getFeaturedReports() {
        return this.reportsService.getFeaturedCommunityReports();
    }

    @Get('community/map')
    @ApiOperation({ summary: 'Get community reports for map view' })
    @ApiResponse({
        status: 200,
        description: 'Returns array of reports for map display',
        type: Report
    })
    getMapReports() {
        return this.reportsService.getMapCommunityReports();
    }

    @Get('community/nearby')
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
    findNearbyCommunityReports(
        @Query('lat') lat: number,
        @Query('lng') lng: number,
        @Query('distance') distance?: number,
    ) {
        return this.reportsService.findNearbyCommunityReports(lat, lng, distance);
    }

    @Get('community/:id')
    @ApiOperation({ summary: 'Get a specific community report by ID' })
    @ApiParam({
        name: 'id',
        required: true,
        description: 'Report unique identifier'
    })
    findOneCommunityReport(@Param('id') id: string) {
        return this.reportsService.findOneCommunityReport(id);
    }

    @Put('community/:id')
    @ApiOperation({ summary: 'Update an existing community report' })
    @ApiParam({
        name: 'id',
        required: true,
        description: 'Report unique identifier'
    })
    updateCommunityReport(
        @Param('id') id: string,
        @Body() updateReportDto: UpdateReportDto,
    ) {
        return this.reportsService.updateCommunityReport(id, updateReportDto);
    }

    @Delete('community/:id')
    @ApiOperation({ summary: 'Delete a community report' })
    @ApiParam({
        name: 'id',
        required: true,
        description: 'Report unique identifier to delete'
    })
    removeCommunityReport(@Param('id') id: string) {
        return this.reportsService.removeCommunityReport(id);
    }
}