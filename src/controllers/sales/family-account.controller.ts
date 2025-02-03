// src/controllers/sales/family-account.controller.ts
import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    UseGuards,
    Req,
    Query,
    BadRequestException,
    NotFoundException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';
import { SalesAssociateGuard } from '../../guards/sales-associate.guard';
import { FamilyAccountService } from '../../services/family-account.service';
import { CustomerService } from '../../services/customer.service';
import {
    AddFamilyMemberDto,
    LinkFamilyAccountDto,
    ListFamilyAccountDto
} from '../../dtos/family-account.dto';

@ApiTags('Sales - Family Accounts')
@ApiBearerAuth()
@Controller('sales/family-accounts')
@UseGuards(SalesAssociateGuard)
export class SalesFamilyAccountController {
    constructor(
        private readonly familyAccountService: FamilyAccountService,
        private readonly customerService: CustomerService
    ) {}

    @ApiOperation({ summary: 'List all family accounts' })
    @ApiQuery({ name: 'search', required: false, description: 'Search by customer name or email' })
    @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'INACTIVE', 'ALL'] })
    @Get()
    async listFamilyAccounts(
        @Query() query: ListFamilyAccountDto,
        @Req() req: Request & { user: { client_ids: string[] } }
    ) {
        // Assuming we're using the first client ID from the sales associate's list
        const clientId = req.user.client_ids[0];
        if (!clientId) {
            throw new BadRequestException('No client access');
        }

        return this.familyAccountService.findAll({
            ...query,
            clientId,
            limit: 100 // Mobile-friendly pagination
        });
    }

    @ApiOperation({ summary: 'Get family account details' })
    @ApiParam({ name: 'id', description: 'Family Account ID' })
    @Get(':id')
    async getFamilyDetails(
        @Param('id') id: string,
        @Req() req: Request & { user: { client_ids: string[] } }
    ) {
        const clientId = req.user.client_ids[0];
        if (!clientId) {
            throw new BadRequestException('No client access');
        }

        const account = await this.familyAccountService.findOne(id, clientId);
        if (!account) {
            throw new NotFoundException('Family account not found');
        }

        return account;
    }

    @ApiOperation({ summary: 'Search for available customers to add to family' })
    @ApiQuery({ name: 'query', description: 'Search term for customer name or email' })
    @Get('customers/search')
    async searchAvailableCustomers(
        @Query('query') query: string,
        @Req() req: Request & { user: { client_ids: string[] } }
    ) {
        const clientId = req.user.client_ids[0];
        if (!clientId || !query) {
            throw new BadRequestException('Invalid request');
        }

        return this.familyAccountService.searchCustomers(query, clientId);
    }

    @ApiOperation({ summary: 'Create new family account' })
    @ApiBody({ type: LinkFamilyAccountDto })
    @Post()
    async createFamilyAccount(
        @Body() createDto: LinkFamilyAccountDto,
        @Req() req: Request & { user: { client_ids: string[] } }
    ) {
        const clientId = req.user.client_ids[0];
        if (!clientId) {
            throw new BadRequestException('No client access');
        }

        return this.familyAccountService.link({
            ...createDto,
            clientId
        });
    }

    @ApiOperation({ summary: 'Remove member from family' })
    @ApiParam({ name: 'id', description: 'Family Account ID' })
    @ApiParam({ name: 'memberId', description: 'Member ID to remove' })
    @Delete(':id/members/:memberId')
    async removeMember(
        @Param('id') id: string,
        @Param('memberId') memberId: string,
        @Req() req: Request & { user: { client_ids: string[] } }
    ) {
        const clientId = req.user.client_ids[0];
        if (!clientId) {
            throw new BadRequestException('No client access');
        }

        return this.familyAccountService.unlink(id, memberId, clientId);
    }

    @ApiOperation({ summary: 'Add new member to family account' })
    @ApiParam({ name: 'id', description: 'Family Account ID' })
    @ApiBody({ type: AddFamilyMemberDto })
    @ApiResponse({ status: 201, description: 'Member added successfully' })
    @ApiResponse({ status: 400, description: 'Member already exists in a family' })
    @ApiResponse({ status: 404, description: 'Family account not found' })
    @Post(':id/members')
    async addMember(
        @Param('id') id: string,
        @Body() memberDto: AddFamilyMemberDto,
        @Req() req: Request & { user: { client_ids: string[] } }
    ) {
        const clientId = req.user.client_ids[0];
        if (!clientId) {
            throw new BadRequestException('No client access');
        }

        // First verify the customer exists
        const customer = await this.customerService.findOne(memberDto.customerId, clientId);

        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        // Use the existing update method with the new member
        return this.familyAccountService.update(id, clientId, {
            members: [{
                customerId: memberDto.customerId,
                relationship: memberDto.relationship
            }]
        });
    }
}

