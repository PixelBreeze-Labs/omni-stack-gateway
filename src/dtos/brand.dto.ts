import {IsNotEmpty, IsObject, IsOptional, IsString} from "class-validator";
import { ApiProperty } from '@nestjs/swagger';

export class CreateBrandApiConfigDto {
    @ApiProperty({ description: 'API key for brand integration' })
    @IsString()
    @IsNotEmpty()
    apiKey: string;

    @ApiProperty({ description: 'Base URL for brand API' })
    @IsString()
    @IsNotEmpty()
    baseUrl: string;

    @ApiProperty({ description: 'API endpoints mapping' })
    @IsObject()
    endpoints: Record<string, string>;

    @ApiProperty({ description: 'Custom headers for API requests' })
    @IsObject()
    headers: Record<string, string>;

    @ApiProperty({ description: 'Refresh token for OAuth', required: false })
    @IsString()
    @IsOptional()
    refreshToken?: string;
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

    @ApiProperty({ description: 'Client ID' })
    @IsString()
    @IsNotEmpty()
    clientId: string;

    @ApiProperty({ description: 'Brand description' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({ description: 'API Configuration', required: false })
    @IsOptional()
    apiConfig?: CreateBrandApiConfigDto;
}

export class UpdateBrandApiConfigDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    apiKey?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    baseUrl?: string;

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
        description: 'Filter by client ID',
        required: false
    })
    @IsString()
    @IsOptional()
    clientId?: string;
}