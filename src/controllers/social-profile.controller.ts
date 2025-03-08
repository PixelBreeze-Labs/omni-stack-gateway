// src/controllers/social-profile.controller.ts
import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { SocialProfileService } from '../services/social-profile.service';
import { CreateSocialProfileDto, ListSocialProfileDto, UpdateSocialProfileDto } from '../dtos/social-profile.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { SocialProfile } from "../schemas/social-profile.schema";

@ApiTags('Social Profiles')
@Controller('social-profiles')
export class SocialProfileController {
    constructor(private readonly socialProfileService: SocialProfileService) {}

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Post()
    @ApiOperation({ summary: 'Create new social profile' })
    @ApiResponse({ status: 201, description: 'Social profile created successfully' })
    async create(@Body() createSocialProfileDto: CreateSocialProfileDto) {
        return this.socialProfileService.create(createSocialProfileDto);
    }

    @ApiOperation({ summary: 'Get all social profiles' })
    @ApiQuery({ type: ListSocialProfileDto })
    @ApiResponse({ status: 200, description: 'List of social profiles' })
    @Get()
    async findAll(@Query() query: ListSocialProfileDto): Promise<{
        items: SocialProfile[];
        total: number;
        pages: number;
        page: number;
        limit: number;
    }> {
        return this.socialProfileService.findAll(query);
    }

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Get(':id')
    @ApiOperation({ summary: 'Get social profile by ID' })
    @ApiParam({ name: 'id', description: 'Social Profile ID' })
    @ApiResponse({ status: 200, description: 'Social profile details' })
    async findOne(@Param('id') id: string) {
        return this.socialProfileService.findOne(id);
    }

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Put(':id')
    @ApiOperation({ summary: 'Update social profile' })
    @ApiParam({ name: 'id', description: 'Social Profile ID' })
    @ApiResponse({ status: 200, description: 'Social profile updated' })
    async update(@Param('id') id: string, @Body() updateSocialProfileDto: UpdateSocialProfileDto) {
        return this.socialProfileService.update(id, updateSocialProfileDto);
    }

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Delete(':id')
    @ApiOperation({ summary: 'Delete social profile' })
    @ApiParam({ name: 'id', description: 'Social Profile ID' })
    @ApiResponse({ status: 200, description: 'Social profile deleted' })
    async remove(@Param('id') id: string) {
        return this.socialProfileService.remove(id);
    }
}