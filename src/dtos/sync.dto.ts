// src/dtos/sync.dto.ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BaseSyncDto {
    @ApiProperty({
        description: 'Date to sync from',
        example: '2024-01-31'
    })
    @IsString()
    @IsNotEmpty()
    sync_date: string;
}

export class SyncPricesDto extends BaseSyncDto {}

export class SyncStocksDto extends BaseSyncDto {}

export class SyncProductsDto extends BaseSyncDto {}

export class SyncResponseDto {
    @ApiProperty({ example: 'success' })
    status: string;

    @ApiProperty({ example: 'Sync completed successfully' })
    message: string;

    @ApiProperty({
        example: {
            products_synced: 100,
            variants_synced: 150,
            sync_time: '2024-01-31 12:00:00'
        }
    })
    data: {
        products_synced: number;
        variants_synced?: number;
        sync_time: string;
        sync_id: string;
    };
}