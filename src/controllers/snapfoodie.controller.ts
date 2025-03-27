// src/controllers/snapfood-sync.controller.ts
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

@ApiTags('SnapFoodie')
@ApiBearerAuth()
@Controller('snapfoodie')
@UseGuards(ClientAuthGuard)
export class SnapfoodSyncController {
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
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'search', required: false, type: String })
    async syncUsers(
        @Req() req: Request & { client: Client },
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
        @Query('search') search?: string
    ) {
        return this.snapfoodieService.syncUsers(req.client.id, {
            page,
            limit,
            search
        });
    }

}