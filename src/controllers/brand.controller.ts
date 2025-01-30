// src/controllers/brand.controller.ts
import {ClientAuthGuard} from "../guards/client-auth.guard";
import {Body, Controller, Get, Param, Post, Put, Req, UseGuards, Query} from "@nestjs/common";
import {CreateBrandApiConfigDto, CreateBrandDto, ListBrandDto, UpdateBrandApiConfigDto} from "../dtos/brand.dto";
import {Client} from "../schemas/client.schema";
import {BrandService} from "../services/brand.service";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';

@ApiTags('Brands')
@ApiBearerAuth()
@Controller('brands')
@UseGuards(ClientAuthGuard)
export class BrandController {
    constructor(private brandService: BrandService) {}

    @ApiOperation({ summary: 'Create a new brand' })
    @ApiResponse({ status: 201, description: 'Brand created successfully' })
    @ApiBody({ type: CreateBrandDto })
    @Post()
    async create(
        @Req() req: Request & { client: Client },
        @Body() createBrandDto: CreateBrandDto,
    ) {
        const { apiConfig, ...brandData } = createBrandDto;
        return this.brandService.createWithConfig(
            { ...brandData, clientId: req.client.id },
            apiConfig
        );
    }

    @ApiOperation({ summary: 'Get all brands' })
    @ApiQuery({ type: ListBrandDto })
    @ApiResponse({ status: 200, description: 'Return all brands' })
    @Get()
    async findAll(@Query() query: ListBrandDto, @Req() req: Request & { client: Client }) {
        return this.brandService.findAll({ ...query, clientId: req.client.id });
    }

    @ApiOperation({ summary: 'Get brand by id' })
    @ApiParam({ name: 'id', description: 'Brand ID' })
    @ApiResponse({ status: 200, description: 'Return brand' })
    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.brandService.findOne(id);
    }

    @ApiOperation({ summary: 'Update brand API configuration' })
    @ApiParam({ name: 'id', description: 'Brand ID' })
    @ApiBody({ type: UpdateBrandApiConfigDto })
    @ApiResponse({ status: 200, description: 'API config updated successfully' })
    @Put(':id/api-config')
    async updateApiConfig(
        @Param('id') id: string,
        @Body() updateConfigDto: UpdateBrandApiConfigDto
    ) {
        return this.brandService.updateApiConfig(id, updateConfigDto);
    }
}