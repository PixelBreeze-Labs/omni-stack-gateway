import {IsNotEmpty, IsObject, IsOptional, IsString, IsNumber, Min, IsBoolean} from "class-validator";
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBrandApiConfigDto {
    @ApiProperty({ description: 'API key for brand integration' })
    @IsString()
    @IsNotEmpty()
    apiKey: string;

    @ApiProperty({ description: 'API secret for brand integration', required: false })
    @IsString()
    @IsOptional()
    apiSecret?: string;

    @ApiProperty({ description: 'API endpoint URL' })
    @IsString()
    @IsNotEmpty()
    endpoint: string;

    @ApiProperty({ description: 'API endpoints mapping', required: false })
    @IsObject()
    @IsOptional()
    endpoints?: Record<string, string>;

    @ApiProperty({ description: 'Custom headers for API requests', required: false })
    @IsObject()
    @IsOptional()
    headers?: Record<string, string>;

    @ApiProperty({ description: 'Refresh token for OAuth', required: false })
    @IsString()
    @IsOptional()
    refreshToken?: string;

    @ApiProperty({ description: 'Enable automatic synchronization', required: false })
    @IsBoolean()
    @IsOptional()
    isAutoSyncEnabled?: boolean;
}

export class UpdateBrandApiConfigDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    apiKey?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    apiSecret?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    endpoint?: string;

    @ApiProperty({ required: false })
    @IsObject()
    @IsOptional()
    endpoints?: Record<string, string>;

    @ApiProperty({ required: false })
    @IsObject()
    @IsOptional()
    headers?: Record<string, string>;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    refreshToken?: string;

    @ApiProperty({ required: false })
    @IsBoolean()
    @IsOptional()
    isAutoSyncEnabled?: boolean;
}

export class CreateBrandDto {
    @ApiProperty({ description: 'Brand name' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ description: 'Unique brand code' })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({ description: 'Brand description' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({ description: 'API Configuration', required: false })
    @IsOptional()
    apiConfig?: CreateBrandApiConfigDto;
}


export class ListBrandDto {
    @ApiProperty({
        description: 'Search term for filtering brands',
        required: false
    })
    @IsString()
    @IsOptional()
    search?: string;

    @ApiProperty({
        description: 'Page number',
        required: false,
        default: 1,
        type: Number
    })
    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    @Min(1)
    page?: number;

    @ApiProperty({
        description: 'Number of items per page',
        required: false,
        default: 10,
        type: Number
    })
    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    @Min(1)
    limit?: number;

    @ApiProperty({
        description: 'Status filter',
        required: false,
        enum: ['ACTIVE', 'INACTIVE', 'ALL']
    })
    @IsString()
    @IsOptional()
    status?: string;
}