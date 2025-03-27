// src/controllers/snapfoodie.controller.ts
import {
    Controller,
    Get,
    Post,
    Param,
    UseGuards,
    Req,
    Query,
    DefaultValuePipe,
    ParseIntPipe,
    Body
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { SnapfoodieService } from '../services/snapfoodie.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';

// Define a DTO for the sync options
class SyncUsersDto {
    page?: number = 1;
    limit?: number = 200;
    search?: string;
}

@ApiTags('SnapFoodie')
@ApiBearerAuth()
@Controller('snapfoodie')
@UseGuards(ClientAuthGuard)
export class SnapfoodieController {
    constructor(
        private readonly snapfoodieService: SnapfoodieService
    ) {}

    /**
     * Sync SnapFood users to our system
     */
    @Post('users/sync')
    @ApiOperation({ summary: 'Sync SnapFood users to our system' })
    @ApiResponse({
        status: 200,
        description: 'Users synced successfully'
    })
    async syncUsers(
        @Req() req: Request & { client: Client },
        @Body() syncOptions: SyncUsersDto
    ) {
        // Ensure default values if not provided
        const options = {
            page: syncOptions.page || 1,
            limit: syncOptions.limit || 200,
            search: syncOptions.search
        };

        return this.snapfoodieService.syncUsers(req.client.id, options);
    }

    /**
     * Get all users registered via SnapFood
     */
    @Get('users')
    @ApiOperation({ summary: 'Get all users registered via SnapFood' })
    @ApiResponse({
        status: 200,
        description: 'Returns a list of users registered via SnapFood'
    })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'search', required: false, type: String })
    @ApiQuery({ name: 'sort', required: false, type: String })
    async getSnapfoodUsers(
        @Req() req: Request & { client: Client },
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
        @Query('sort') sort?: string
    ) {
        return this.snapfoodieService.getSnapfoodUsers(req.client.id, {
            page,
            limit,
            search,
            sort
        });
    }
}