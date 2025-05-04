import { Controller, Get, Post, Body, Param, Delete, Query, UseGuards, Req, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { GeneratedImageService } from '../services/generated-image.service';
import { CreateGeneratedImageDto, ListGeneratedImagesDto } from '../dtos/generated-image.dto';
import { Client } from '../schemas/client.schema';

@ApiTags('Generated Images')
@ApiBearerAuth()
@Controller('generated-images')
@UseGuards(ClientAuthGuard)
export class GeneratedImageController {
    constructor(private imageService: GeneratedImageService) {}

    @ApiOperation({ summary: 'Create a new generated image record' })
    @ApiResponse({ status: 201, description: 'Image record created successfully' })
    @ApiBody({ type: CreateGeneratedImageDto })
    @Post()
    async create(
        @Req() req: Request & { client: Client },
        @Body() createDto: CreateGeneratedImageDto,
    ) {
        return this.imageService.create({
            ...createDto,
            clientId: req.client.id
        });
    }

    @ApiOperation({ summary: 'Get all generated images' })
    @ApiQuery({ type: ListGeneratedImagesDto })
    @ApiResponse({ status: 200, description: 'Return all generated images' })
    @Get()
    async findAll(
        @Query() query: ListGeneratedImagesDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.imageService.findAll({
            ...query,
            clientId: req.client.id
        });
    }

    @ApiOperation({ summary: 'Get generated image by id' })
    @ApiParam({ name: 'id', description: 'Generated Image ID' })
    @ApiResponse({ status: 200, description: 'Return generated image' })
    @Get(':id')
    async findOne(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.imageService.findOne(id, req.client.id);
    }

    @ApiOperation({ summary: 'Update image download time' })
    @ApiParam({ name: 'id', description: 'Generated Image ID' })
    @ApiResponse({ status: 200, description: 'Download time updated successfully' })
    @Put(':id/download')
    async updateDownloadTime(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.imageService.updateDownloadTime(id, req.client.id);
    }

    @ApiOperation({ summary: 'Delete generated image' })
    @ApiParam({ name: 'id', description: 'Generated Image ID' })
    @ApiResponse({ status: 200, description: 'Image deleted successfully' })
    @Delete(':id')
    async remove(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.imageService.remove(id, req.client.id);
    }

    @ApiOperation({ summary: 'Get image generation statistics' })
    @ApiResponse({ status: 200, description: 'Return image statistics' })
    @Get('stats')
    async getStats(
        @Req() req: Request & { client: Client }
    ) {
        return this.imageService.getImageStats(req.client.id);
    }
}