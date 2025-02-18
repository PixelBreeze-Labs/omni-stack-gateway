import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { SnapfoodService } from '../services/snapfood.service';
// import { ClientAuthGuard } from '../guards/client-auth.guard';

@ApiTags('SnapFood')
@ApiBearerAuth()
@Controller('sf')
// @UseGuards(ClientAuthGuard)
export class SnapFoodController {
    constructor(private readonly snapfoodService: SnapfoodService) {}

    @Get('customers')
    @ApiOperation({ summary: 'List customers' })
    @ApiResponse({ status: 200, description: 'Returns customers list with pagination' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'per_page', required: false })
    @ApiQuery({ name: 'search', required: false })
    async listCustomers(
        @Query('page') page?: number,
        @Query('per_page') perPage?: number,
        @Query('search') search?: string,
    ) {
        return await this.snapfoodService.listCustomers({
            page,
            per_page: perPage,
            search
        });
    }
}