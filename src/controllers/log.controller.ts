import { Controller, Get, Post, Body, Query, UseGuards, Req, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiQuery } from '@nestjs/swagger';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { LogService } from '../services/log.service';
import { CreateLogDto, ListLogsDto } from '../dtos/log.dto';
import { Client } from '../schemas/client.schema';

@ApiTags('Logs')
@ApiBearerAuth()
@Controller('logs')
@UseGuards(ClientAuthGuard)
export class LogController {
    constructor(private logService: LogService) {}

    @ApiOperation({ summary: 'Create a new log entry' })
    @ApiResponse({ status: 201, description: 'Log created successfully' })
    @ApiBody({ type: CreateLogDto })
    @Post()
    async create(
        @Req() req: Request & { client: Client },
        @Body() createLogDto: CreateLogDto,
    ) {
        // Always use client ID from authenticated request
        return this.logService.create({
            ...createLogDto,
            clientId: req.client.id
        });
    }

    @ApiOperation({ summary: 'Get all logs' })
    @ApiQuery({ type: ListLogsDto })
    @ApiResponse({ status: 200, description: 'Return all logs' })
    @Get()
    async findAll(
        @Query() query: ListLogsDto,
        @Req() req: Request & { client: Client }
    ) {
        // Always filter by client ID from authenticated request
        return this.logService.findAll({
            ...query,
            clientId: req.client.id
        });
    }

    @ApiOperation({ summary: 'Get logs by session ID' })
    @ApiResponse({ status: 200, description: 'Return logs for the session' })
    @Get('session/:sessionId')
    async getLogsBySession(
        @Param('sessionId') sessionId: string,
        @Req() req: Request & { client: Client }
    ) {
        // The service method will filter by session ID, but we'll need to ensure
        // we only return logs for the authenticated client
        const logs = await this.logService.getLogsBySessionId(sessionId);
        return logs.filter(log => !log.clientId || log.clientId.toString() === req.client.id);
    }

    @ApiOperation({ summary: 'Get log statistics' })
    @ApiResponse({ status: 200, description: 'Return log statistics' })
    @Get('stats')
    async getStats(
        @Req() req: Request & { client: Client }
    ) {
        return this.logService.getLogStats(req.client.id);
    }
}