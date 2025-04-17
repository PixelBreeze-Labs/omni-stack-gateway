// src/controllers/reports.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ReportsService } from '../services/reports.service';
import { Report } from '../interfaces/report.interface';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";

@ApiTags('Reports')
@Controller('api/reports')
export class ReportsController {
    constructor(private readonly reportsService: ReportsService) {}

    @ApiOperation({ summary: 'Create new report' })
    @ApiResponse({ status: 201, description: 'Report created' })
    @Post()
    async createReport(@Body() report: Report) {
        return await this.reportsService.create(report);
    }

    @ApiOperation({ summary: 'Get all reports with pagination and filtering' })
    @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
    @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by status' })
    @ApiQuery({ name: 'clientAppId', required: false, type: String, description: 'Filter by client app ID' })
    @ApiQuery({ name: 'search', required: false, type: String, description: 'Search in content and sender info' })
    @ApiQuery({ name: 'fromDate', required: false, type: String, description: 'Filter by date range (start)' })
    @ApiQuery({ name: 'toDate', required: false, type: String, description: 'Filter by date range (end)' })
    @ApiQuery({ name: 'priority', required: false, type: String, description: 'Filter by priority' })
    @ApiQuery({ name: 'includeSummary', required: false, type: Boolean, description: 'Include summary data' })
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

    @ApiOperation({ summary: 'Get reports summary' })
    @ApiQuery({ name: 'clientAppId', required: false, type: String, description: 'Filter by client app ID' })
    @Get('summary')
    async getReportsSummary(@Query('clientAppId') clientAppId: string) {
        const summary = await this.reportsService.getReportsSummary(clientAppId);
        return {
            summary,
            message: 'Reports summary fetched successfully',
        };
    }

    @ApiOperation({ summary: 'Get WP Reports for client' })
    @ApiParam({ name: 'clientId', description: 'Client ID' })
    @Get('wp-reports/:clientId')
    async getWPReportsForClient(@Param('clientId') clientId: string) {
        const reportData = await this.reportsService.getWPReportsForClient(clientId);
        return {
            data: reportData,
            message: 'WP Reports data fetched successfully',
        };
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
                    enum: ['pending', 'in_progress', 'resolved', 'closed', 'archived']
                }
            }
        }
    })
    @Put(':id/status')
    async updateStatus(
        @Param('id') id: string,
        @Body('status') status: string
    ) {
        return await this.reportsService.updateStatus(id, status);
    }

    @ApiOperation({ summary: 'Delete report' })
    @ApiParam({ name: 'id' })
    @Delete(':id')
    async deleteReport(@Param('id') id: string) {
        return await this.reportsService.delete(id);
    }
}