// src/controllers/reports.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ReportsService } from '../services/reports.service';
import { Report } from '../interfaces/report.interface';

@Controller('api/reports')
export class ReportsController {
    constructor(private readonly reportsService: ReportsService) {}

    @Post()
    async createReport(@Body() report: Report) {
        return await this.reportsService.create(report);
    }

    @Get()
    async getAllReports(@Query() query: any) {
        return await this.reportsService.findAll(query);
    }

    @Get(':id')
    async getReport(@Param('id') id: string) {
        return await this.reportsService.findOne(id);
    }

    @Put(':id')
    async updateReport(@Param('id') id: string, @Body() report: Partial<Report>) {
        return await this.reportsService.update(id, report);
    }

    @Put(':id/status')
    async updateStatus(
        @Param('id') id: string,
        @Body('status') status: 'pending' | 'reviewed' | 'archived'
    ) {
        return await this.reportsService.updateStatus(id, status);
    }

    @Delete(':id')
    async deleteReport(@Param('id') id: string) {
        return await this.reportsService.delete(id);
    }
}