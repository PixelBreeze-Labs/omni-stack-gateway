// src/controllers/social-profile.controller.ts
import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, Query, Req } from '@nestjs/common';
import { SocialProfileService } from '../services/social-profile.service';
import { CreateSocialProfileDto, ListSocialProfileDto, UpdateSocialProfileDto } from '../dtos/social-profile.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { SocialProfile } from "../schemas/social-profile.schema";
import { Client } from '../schemas/client.schema';

@ApiTags('Social Profiles')
@Controller('social-profiles')
export class SocialProfileController {
    constructor(private readonly socialProfileService: SocialProfileService) {}

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Post()
    @ApiOperation({ summary: 'Create new social profile' })
    @ApiResponse({ status: 201, description: 'Social profile created successfully' })
    async create(
        @Body() createSocialProfileDto: CreateSocialProfileDto,
        @Req() req: Request & { client: Client }
    ) {
        // Add clientId from authenticated request
        return this.socialProfileService.create({
            ...createSocialProfileDto,
            clientId: req.client.id
        });
    }

    @UseGuards(ClientAuthGuard)
    @Get()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all social profiles' })
    @ApiQuery({ type: ListSocialProfileDto })
    @ApiResponse({ status: 200, description: 'List of social profiles' })
    async findAll(
        @Query() query: ListSocialProfileDto,
        @Req() req: Request & { client: Client }
    ): Promise<{
        items: SocialProfile[];
        total: number;
        pages: number;
        page: number;
        limit: number;
    }> {
        // Filter by client ID from auth
        return this.socialProfileService.findAll({
            ...query,
            clientId: req.client.id
        });
    }

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Get(':id')
    @ApiOperation({ summary: 'Get social profile by ID' })
    @ApiParam({ name: 'id', description: 'Social Profile ID' })
    @ApiResponse({ status: 200, description: 'Social profile details' })
    async findOne(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.socialProfileService.findOne(id, req.client.id);
    }

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Put(':id')
    @ApiOperation({ summary: 'Update social profile' })
    @ApiParam({ name: 'id', description: 'Social Profile ID' })
    @ApiResponse({ status: 200, description: 'Social profile updated' })
    async update(
        @Param('id') id: string,
        @Body() updateSocialProfileDto: UpdateSocialProfileDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.socialProfileService.update(id, updateSocialProfileDto, req.client.id);
    }

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Delete(':id')
    @ApiOperation({ summary: 'Delete social profile' })
    @ApiParam({ name: 'id', description: 'Social Profile ID' })
    @ApiResponse({ status: 200, description: 'Social profile deleted' })
    async remove(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.socialProfileService.remove(id, req.client.id);
    }
}