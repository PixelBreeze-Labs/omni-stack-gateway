// src/controllers/report-tag.controller.ts
import { Controller, Post, Get, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { ReportTagService } from '../services/report-tag.service';
import { CreateReportTagDto, UpdateReportTagDto, ListReportTagDto } from '../dtos/report-tag.dto';
import { Client } from '../schemas/client.schema';

@ApiTags('Report Tags')
@Controller('report-tags')
@UseGuards(ClientAuthGuard)
@ApiBearerAuth()
export class ReportTagController {
    constructor(private readonly reportTagService: ReportTagService) {}

    @Post()
    @ApiOperation({ summary: 'Create a new report tag' })
    @ApiResponse({ status: 201, description: 'Report tag created successfully' })
    async create(
        @Body() createReportTagDto: CreateReportTagDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.reportTagService.create({
            ...createReportTagDto,
            clientId: req.client.id
        });
    }

    @Get()
    @ApiOperation({ summary: 'Get all report tags for a client' })
    @ApiQuery({ type: ListReportTagDto })
    @ApiResponse({ status: 200, description: 'List of report tags' })
    async findAll(
        @Query() query: ListReportTagDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.reportTagService.findAll({
            ...query,
            clientId: req.client.id
        });
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a report tag by ID' })
    @ApiParam({ name: 'id', description: 'Report tag ID' })
    @ApiResponse({ status: 200, description: 'Report tag details' })
    async findOne(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.reportTagService.findOne(id, req.client.id);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update a report tag' })
    @ApiParam({ name: 'id', description: 'Report tag ID' })
    @ApiResponse({ status: 200, description: 'Report tag updated' })
    async update(
        @Param('id') id: string,
        @Body() updateReportTagDto: UpdateReportTagDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.reportTagService.update(id, req.client.id, updateReportTagDto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a report tag' })
    @ApiParam({ name: 'id', description: 'Report tag ID' })
    @ApiResponse({ status: 200, description: 'Report tag deleted' })
    async remove(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.reportTagService.remove(id, req.client.id);
    }
}