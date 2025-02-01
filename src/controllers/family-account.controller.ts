// controllers/family-account.controller.ts
import { ClientAuthGuard } from '../guards/client-auth.guard';
import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Put,
    Delete,
    Req,
    Query,
    UseGuards, NotFoundException
} from '@nestjs/common';
import {
    LinkFamilyAccountDto,
    ListFamilyAccountDto,
    UpdateFamilyAccountDto
} from '../dtos/family-account.dto';
import { Client } from '../schemas/client.schema';
import { FamilyAccountService } from '../services/family-account.service';
import { Types } from 'mongoose';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiBody,
    ApiParam,
    ApiQuery
} from '@nestjs/swagger';
import {Benefit} from "../schemas/benefit.schema";

@ApiTags('Family Accounts')
@ApiBearerAuth()
@Controller('family-accounts')
@UseGuards(ClientAuthGuard)
export class FamilyAccountController {
    constructor(private familyAccountService: FamilyAccountService) {}

    @ApiOperation({ summary: 'Link a new family member' })
    @ApiResponse({ status: 201, description: 'Family member linked successfully' })
    @ApiBody({ type: LinkFamilyAccountDto })
    @Post()
    async link(
        @Req() req: Request & { client: Client },
        @Body() linkDto: LinkFamilyAccountDto,
    ) {
        return this.familyAccountService.link({
            ...linkDto,
            clientId: req.client.id
        });
    }

    @ApiOperation({ summary: 'Get all family accounts' })
    @ApiQuery({ type: ListFamilyAccountDto })
    @ApiResponse({ status: 200, description: 'Return all family accounts' })
    @Get()
    async findAll(
        @Query() query: ListFamilyAccountDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.familyAccountService.findAll({
            ...query,
            clientId: req.client.id
        });
    }

    @ApiOperation({ summary: 'Get family account by id with full details' })
    @ApiParam({ name: 'id', description: 'Account ID' })
    @ApiResponse({
        status: 200,
        description: 'Return family account with full details',
    })
    @Get(':id')
    async findOne(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        const family = await this.familyAccountService.findOne(id, req.client.id);
        if (!family) {
            throw new NotFoundException('Family account not found');
        }
        return family;
    }


    @ApiOperation({ summary: 'Update family account' })
    @ApiParam({ name: 'id', description: 'Account ID' })
    @ApiBody({ type: UpdateFamilyAccountDto })
    @ApiResponse({ status: 200, description: 'Family account updated successfully' })
    @Put(':id')
    async update(
        @Param('id') id: string,
        @Body() updateDto: UpdateFamilyAccountDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.familyAccountService.update(id, req.client.id, updateDto);
    }

    @ApiOperation({ summary: 'Unlink family member' })
    @ApiParam({ name: 'id', description: 'Account ID' })
    @ApiParam({ name: 'memberId', description: 'Member ID to unlink' })
    @ApiResponse({ status: 200, description: 'Family member unlinked successfully' })
    @Delete(':id/members/:memberId')
    async unlink(
        @Param('id') id: string,
        @Param('memberId') memberId: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.familyAccountService.unlink(id, memberId, req.client.id);
    }

    @ApiOperation({ summary: 'Get family account statistics' })
    @ApiParam({ name: 'id', description: 'Account ID' })
    @ApiResponse({ status: 200, description: 'Return family account statistics' })
    @Get(':id/stats')
    async getFamilyStats(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        const family = await this.familyAccountService.findOne(id, req.client.id);
        if (!family) {
            throw new NotFoundException('Family account not found');
        }

        const stats = await this.familyAccountService.getFamilyStats(id, req.client.id);
        return stats;
    }

    @ApiOperation({ summary: 'Get family benefits' })
    @ApiParam({ name: 'id', description: 'Family Account ID' })
    @ApiResponse({
        status: 200,
        description: 'Returns all benefits available for the family',
        type: [Benefit] // You'll need to create this class with @ApiProperty decorators
    })
    @ApiResponse({ status: 404, description: 'Family account not found' })
    @Get(':id/benefits')
    async getFamilyBenefits(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.familyAccountService.getFamilyBenefits(id, req.client.id);
    }

    @ApiOperation({ summary: 'Get benefit usage statistics' })
    @ApiParam({ name: 'id', description: 'Family Account ID' })
    @ApiResponse({
        status: 200,
        description: 'Returns benefit usage statistics for the family',
        schema: {
            properties: {
                name: { type: 'string' },
                usageCount: { type: 'number' },
                savings: { type: 'number' },
                type: { type: 'string', enum: ['DISCOUNT', 'CASHBACK', 'POINTS', 'FREE_SHIPPING'] },
                benefitId: { type: 'string' }
            }
        }
    })
    @ApiResponse({ status: 404, description: 'Family account not found' })
    @Get(':id/benefits/usage')
    async getBenefitsUsage(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        const family = await this.familyAccountService.findOne(id, req.client.id);
        if (!family || !family.mainCustomerId) {
            throw new NotFoundException('Family account not found');
        }

        const memberIds = [
            new Types.ObjectId(family.mainCustomerId._id?.toString()),
            ...family.members
                .filter(m => m?.customerId?._id)
                .map(m => new Types.ObjectId(m.customerId._id.toString()))
        ].filter(Boolean);

        if (memberIds.length === 0) {
            return [];
        }

        return this.familyAccountService.getBenefitsUsage(memberIds, req.client.id);
    }
}