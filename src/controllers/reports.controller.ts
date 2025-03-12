// src/controllers/reports.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ReportsService } from '../services/reports.service';
import { Report } from '../interfaces/report.interface';
import {ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags} from "@nestjs/swagger";

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
}