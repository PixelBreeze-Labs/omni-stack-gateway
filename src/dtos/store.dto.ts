// src/dtos/store.dto.ts
import { IsNotEmpty, IsObject, IsOptional, IsString, IsNumber, Min, IsBoolean, IsMongoId } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStoreDto {
    @ApiProperty({ description: 'Store name' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ description: 'Unique store code' })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({ description: 'Address ID', required: false })
    @IsMongoId()
    @IsOptional()
    addressId?: string;

    @ApiProperty({ description: 'External IDs', required: false })
    @IsObject()
    @IsOptional()
    externalIds?: Record<string, string>;
}

export class UpdateStoreDto {
    @ApiProperty({ description: 'Store name', required: false })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiProperty({ description: 'Store code', required: false })
    @IsString()
    @IsOptional()
    code?: string;

    @ApiProperty({ description: 'Address ID', required: false })
    @IsMongoId()
    @IsOptional()
    addressId?: string;

    @ApiProperty({ description: 'External IDs', required: false })
    @IsObject()
    @IsOptional()
    externalIds?: Record<string, string>;

    @ApiProperty({ description: 'Active status', required: false })
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}

export class ListStoreDto {
    @ApiProperty({
        description: 'Search term for filtering stores',
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