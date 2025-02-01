import { Controller, Post, HttpCode } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ByBestSyncService } from '../services/bybest-sync.service';

@ApiTags('ByBestSync')
@Controller('api')
export class ByBestSyncController {
    constructor(private readonly byBestService: ByBestSyncService) {}

    @Post('bybest-users')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sync users and members from ByBest API' })
    @ApiResponse({ status: 200, description: 'Sync completed successfully' })
    async syncUsersFromBB() {
        return await this.byBestService.syncUsersFromBB();
    }
}
