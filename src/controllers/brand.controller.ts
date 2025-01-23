// src/controllers/brand.controller.ts
import {ClientAuthGuard} from "../guards/client-auth.guard";
import {Body, Controller, Get, Param, Post, Put, Req, UseGuards, Query} from "@nestjs/common";
import {CreateBrandApiConfigDto, CreateBrandDto, ListBrandDto, UpdateBrandApiConfigDto} from "../dtos/brand.dto";
import {Client} from "../schemas/client.schema";
import {BrandService} from "../services/brand.service";

@Controller('brands')
@UseGuards(ClientAuthGuard)
export class BrandController {
    constructor(private brandService: BrandService) {}

    @Post()
    async create(
        @Req() req: Request & { client: Client },
        @Body() createBrandDto: CreateBrandDto,
        @Body('apiConfig') apiConfig?: CreateBrandApiConfigDto,

    ) {
        return this.brandService.createWithConfig(
            { ...createBrandDto, clientId: req.client.id },
            apiConfig
        );
    }

    @Get()
    async findAll(@Query() query: ListBrandDto, @Req() req: Request & { client: Client }) {
        return this.brandService.findAll({ ...query, clientId: req.client.id });
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.brandService.findOne(id);
    }

    @Put(':id/api-config')
    async updateApiConfig(
        @Param('id') id: string,
        @Body() updateConfigDto: UpdateBrandApiConfigDto
    ) {
        return this.brandService.updateApiConfig(id, updateConfigDto);
    }
}

