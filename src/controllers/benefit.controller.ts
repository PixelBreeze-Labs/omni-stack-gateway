// src/controllers/benefit.controller.ts
import { Controller, Get, Post, Put, Body, Param, UseGuards, Req, Delete, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BenefitService } from '../services/benefit.service';
import { CreateBenefitDto, UpdateBenefitDto } from '../dtos/benefit.dto';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';

@ApiTags('Benefits')
@Controller('benefits')
@UseGuards(ClientAuthGuard)
export class BenefitController {
    constructor(private readonly benefitService: BenefitService) {}

    @Get()
    @ApiOperation({ summary: 'Get all benefits' })
    async findAll(
        @Req() req: Request & { client: Client },
        @Query('tier') tier?: string
    ) {
        return this.benefitService.findAll(req.client.id, tier);
    }

    @Post()
    @ApiOperation({ summary: 'Create benefit' })
    async create(
        @Body() createBenefitDto: CreateBenefitDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.benefitService.create(createBenefitDto, req.client.id);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update benefit' })
    async update(
        @Param('id') id: string,
        @Body() updateBenefitDto: UpdateBenefitDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.benefitService.update(id, updateBenefitDto, req.client.id);
    }

    @Put(':id/toggle')
    @ApiOperation({ summary: 'Toggle benefit active status' })
    async toggle(
        @Param('id') id: string,
        @Body('isActive') isActive: boolean,
        @Req() req: Request & { client: Client }
    ) {
        return this.benefitService.toggleActive(id, isActive, req.client.id);
    }

    @Put(':id/tier/:tierId')
    @ApiOperation({ summary: 'Assign benefit to tier' })
    async assignToTier(
        @Param('id') id: string,
        @Param('tierId') tierId: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.benefitService.assignToTier(id, tierId, req.client.id);
    }

    @Delete(':id/tier/:tierId')
    @ApiOperation({ summary: 'Remove benefit from tier' })
    async removeFromTier(
        @Param('id') id: string,
        @Param('tierId') tierId: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.benefitService.removeFromTier(id, tierId, req.client.id);
    }
}