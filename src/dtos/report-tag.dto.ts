// src/dtos/report-tag.dto.ts
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { SortOrder } from './member.dto'; // Reuse the SortOrder enum

export class CreateReportTagDto {
    @ApiProperty({ description: 'Tag name' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiPropertyOptional({ description: 'Tag description' })
    @IsOptional()
    @IsString()
    description?: string;
}

export class UpdateReportTagDto {
    @ApiPropertyOptional({ description: 'Tag name' })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    name?: string;

    @ApiPropertyOptional({ description: 'Tag description' })
    @IsOptional()
    @IsString()
    description?: string;
}

export class ListReportTagDto {
    @ApiPropertyOptional({ default: 1 })
    @Type(() => Number)
    @IsOptional()
    page?: number;

    @ApiPropertyOptional({ default: 20 })
    @Type(() => Number)
    @IsOptional()
    limit?: number;

    @ApiPropertyOptional({ description: 'Search term for tag name' })
    @IsString()
    @IsOptional()
    search?: string;

    @ApiPropertyOptional({ description: 'Field to sort by', default: 'name' })
    @IsString()
    @IsOptional()
    sortBy?: string;

    @ApiPropertyOptional({
        enum: SortOrder,
        default: SortOrder.ASC,
        description: 'Sort order (asc or desc)'
    })
    @IsOptional()
    sortOrder?: SortOrder;
}