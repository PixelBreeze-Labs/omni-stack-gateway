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
    UseGuards
} from '@nestjs/common';
import {
    LinkFamilyAccountDto,
    ListFamilyAccountDto,
    UpdateFamilyAccountDto
} from '../dtos/family-account.dto';
import { Client } from '../schemas/client.schema';
import { FamilyAccountService } from '../services/family-account.service';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiBody,
    ApiParam,
    ApiQuery
} from '@nestjs/swagger';

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

    @ApiOperation({ summary: 'Get family account by id' })
    @ApiParam({ name: 'id', description: 'Account ID' })
    @ApiResponse({ status: 200, description: 'Return family account' })
    @Get(':id')
    async findOne(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.familyAccountService.findOne(id, req.client.id);
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
}