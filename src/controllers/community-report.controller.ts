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
    Optional,
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
}