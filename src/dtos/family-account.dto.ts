// src/dtos/family-account.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// For link member request
export class LinkFamilyAccountDto {
    @ApiProperty({ description: 'Family member name' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ description: 'Family member email' })
    @IsString()
    @IsNotEmpty()
    email: string;

    @ApiProperty({ description: 'Relationship to family member' })
    @IsString()
    @IsNotEmpty()
    relationship: string;

    @ApiProperty({ description: 'Family member status', required: false })
    @IsString()
    @IsOptional()
    status?: string;
}

// For updating relationship/status
export class UpdateFamilyAccountDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    relationship?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    status?: string;
}

// For listing and filtering
export class ListFamilyAccountDto {
    @ApiProperty({
        description: 'Search term for filtering accounts',
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
        enum: ['Active', 'Inactive', 'Bronze']
    })
    @IsString()
    @IsOptional()
    status?: string;
}