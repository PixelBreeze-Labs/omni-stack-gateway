// src/dtos/member.dto.ts
import {
    IsString,
    IsEmail,
    IsOptional,
    IsObject,
    IsArray,
    IsBoolean,
    IsDateString,
    IsEnum,
    IsInt, Min
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {Type} from "class-transformer";

export class CreateMemberDto {
    @ApiProperty({ required: false, description: "User ID reference" })
    @IsOptional()
    @IsString()
    userId?: string;

    @ApiProperty()
    @IsString()
    firstName: string;

    @ApiProperty()
    @IsString()
    lastName: string;

    @ApiProperty()
    @IsEmail()
    email: string;

    @ApiPropertyOptional({ default: '-' })
    @IsOptional()
    @IsString()
    phoneNumber?: string;

    @ApiPropertyOptional({ description: "Birthday in ISO8601 format" })
    @IsOptional()
    @IsDateString()
    birthday?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    city?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    address?: string;

    @ApiPropertyOptional({ description: "Unique code for the member" })
    @IsOptional()
    @IsString()
    code?: string

    @ApiPropertyOptional({ description: "Accepted at date in ISO8601 format", default: null })
    @IsOptional()
    @IsDateString()
    acceptedAt?: string;

    @ApiPropertyOptional({ default: false })
    @IsOptional()
    @IsBoolean()
    isRejected?: boolean;

    @ApiPropertyOptional({ description: "Rejected at date in ISO8601 format", default: null })
    @IsOptional()
    @IsDateString()
    rejectedAt?: string;

    @ApiPropertyOptional({ description: "Metadata key-value pairs" })
    @IsOptional()
    @IsObject()
    metadata?: Record<string, any>;
}

export class UpdateMemberDto {
    @ApiPropertyOptional({ description: "User ID reference" })
    @IsOptional()
    @IsString()
    userId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    firstName?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    lastName?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsEmail()
    email?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    phoneNumber?: string;

    @ApiPropertyOptional({ description: "Birthday in ISO8601 format" })
    @IsOptional()
    @IsDateString()
    birthday?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    city?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    address?: string;

    @ApiPropertyOptional({ description: "Unique code for the member" })
    @IsOptional()
    @IsString()
    code?: string;

    @ApiPropertyOptional({ description: "Accepted at date in ISO8601 format" })
    @IsOptional()
    @IsDateString()
    acceptedAt?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    isRejected?: boolean;

    @ApiPropertyOptional({ description: "Rejected at date in ISO8601 format" })
    @IsOptional()
    @IsDateString()
    rejectedAt?: string;

    @ApiPropertyOptional({ description: "Metadata key-value pairs" })
    @IsOptional()
    @IsObject()
    metadata?: Record<string, any>;
}

export class ListMemberDto {
    @ApiPropertyOptional({ description: 'Page number', default: 1 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @IsOptional()
    page?: number;

    @ApiPropertyOptional({ description: 'Number of items per page', default: 10 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @IsOptional()
    limit?: number;

    @ApiPropertyOptional({ description: 'Search term' })
    @IsString()
    @IsOptional()
    search?: string;

    @ApiPropertyOptional({ description: 'Member status (ACTIVE, PENDING, REJECTED)' })
    @IsEnum(['ACTIVE', 'PENDING', 'REJECTED', 'ALL'], { message: 'Invalid status' })
    @IsOptional()
    status?: string;

    @ApiPropertyOptional({ description: 'Sort by field', default: 'createdAt' })
    @IsString()
    @IsOptional()
    sortBy?: string;

    @ApiPropertyOptional({ description: 'Sort order (asc/desc)', default: 'desc' })
    @IsEnum(['asc', 'desc'], { message: 'Sort order must be either asc or desc' })
    @IsOptional()
    sortOrder?: 'asc' | 'desc';
}