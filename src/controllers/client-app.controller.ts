// src/controllers/client-app.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ClientAppService } from '../services/client-app.service';
import { CreateClientAppDto, UpdateClientAppDto, ListClientAppDto, ClientAppBrandColorsDto } from '../dtos/client-app.dto';
import { ApiKeyAuthGuard } from '../guards/api-key-auth.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiSecurity } from '@nestjs/swagger';
import { ClientAuthGuard } from 'src/guards/client-auth.guard';

@ApiTags('Client Apps')
@Controller('client-apps')
export class ClientAppController {
    constructor(private clientAppService: ClientAppService) {}

    @ApiOperation({ summary: 'Get all client apps' })
    @ApiQuery({ type: ListClientAppDto })
    @ApiResponse({ status: 200, description: 'List of client apps' })
    @Get()
    async findAll(@Query() query: ListClientAppDto) {
        // If page is provided, convert to skip
        if (query.page !== undefined && query.limit !== undefined) {
            query.skip = (query.page - 1) * query.limit;
        }
        return this.clientAppService.findAll(query);
    }


    @Get('dashboard')
@ApiOperation({ summary: 'Get dashboard data' })
@ApiResponse({ status: 200, description: 'Dashboard data' })
async getDashboardData() {
  try {
    return await this.clientAppService.getDashboardData();
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    throw new InternalServerErrorException('Error fetching dashboard data');
  }
}

    @ApiOperation({ summary: 'Get client app by ID' })
    @ApiParam({ name: 'id', description: 'Client App ID' })
    @ApiResponse({ status: 200, description: 'Client app details' })
    // @ApiSecurity('api-key')
    @Get(':id')
    @UseGuards(ClientAuthGuard)
    async findOne(@Param('id') id: string) {
        return this.clientAppService.findOne(id);
    }

    @ApiOperation({ summary: 'Create new client app' })
    @ApiResponse({ status: 201, description: 'Client app created' })
    @Post()
    async create(@Body() createClientAppDto: CreateClientAppDto) {
        // Validate domain is an array
        if (!Array.isArray(createClientAppDto.domain) || createClientAppDto.domain.length === 0) {
            throw new BadRequestException('domain must be a non-empty array');
        }
        return this.clientAppService.create(createClientAppDto);
    }

    @ApiOperation({ summary: 'Update client app' })
    @ApiParam({ name: 'id', description: 'Client App ID' })
    @ApiResponse({ status: 200, description: 'Client app updated' })
    // @ApiSecurity('api-key')
    @Put(':id')
    @UseGuards(ClientAuthGuard)
    async update(
        @Param('id') id: string,
        @Body() updateClientAppDto: UpdateClientAppDto
    ) {
        // If domain is provided, ensure it's an array
        if (updateClientAppDto.domain !== undefined) {
            if (!Array.isArray(updateClientAppDto.domain) || updateClientAppDto.domain.length === 0) {
                throw new BadRequestException('domain must be a non-empty array');
            }
        }
        return this.clientAppService.update(id, updateClientAppDto);
    }

    @ApiOperation({ summary: 'Delete client app' })
    @ApiParam({ name: 'id', description: 'Client App ID' })
    @ApiResponse({ status: 200, description: 'Client app deleted' })
    // @ApiSecurity('api-key')
    @Delete(':id')
    @UseGuards(ClientAuthGuard)
    async remove(@Param('id') id: string) {
        return this.clientAppService.remove(id);
    }

    @ApiOperation({ summary: 'Update client app brand colors' })
    @ApiParam({ name: 'id', description: 'Client App ID' })
    @ApiResponse({ status: 200, description: 'Brand colors updated' })
    @Put(':id/brand-colors')
    @UseGuards(ClientAuthGuard)
    async updateBrandColors(
        @Param('id') id: string,
        @Body() brandColorsDto: ClientAppBrandColorsDto
    ) {
        return this.clientAppService.updateBrandColors(id, brandColorsDto);
    }

    
}