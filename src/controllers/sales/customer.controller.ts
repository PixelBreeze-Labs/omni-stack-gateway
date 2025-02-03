// src/controllers/sales/customer.controller.ts
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SalesAssociateGuard } from '../../guards/sales-associate.guard';
import { CustomerService } from '../../services/customer.service';
import { SalesListCustomerDto, SalesCustomerResponse } from '../../dtos/sales/customer.dto';

@ApiTags('Sales - Customers')
@ApiBearerAuth()
@Controller('sales/customers')
@UseGuards(SalesAssociateGuard)
export class SalesCustomerController {
    constructor(private readonly customerService: CustomerService) {}

    @ApiOperation({ summary: 'List customers with basic info' })
    @ApiResponse({
        status: 200,
        description: 'List of customers with basic information',
        type: [SalesCustomerResponse]
    })
    @Get()
    async listCustomers(
        @Query() query: SalesListCustomerDto,
        @Req() req: Request & { user: { client_ids: string[] } }
    ) {
        const clientId = req.user.client_ids[0];
        const result = await this.customerService.findAll({
            ...query,
            clientIds: [clientId],
            status: 'ACTIVE' // Only show active customers
        });

        return {
            items: result.items.map(customer => ({
                id: customer._id,
                fullName: `${customer.firstName} ${customer.lastName}`,
                avatarInitials: this.getInitials(customer.firstName, customer.lastName),
                email: customer.email,
                loyaltyLevel: 'BRONZE' // Hardcoded as requested
            })),
            total: result.total,
            pages: result.pages,
            page: result.page,
            limit: result.limit
        };
    }

    private getInitials(firstName: string, lastName: string): string {
        return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
}