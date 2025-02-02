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
    IsInt, Min, IsNumber
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

export enum SortOrder {
    ASC = 'asc',
    DESC = 'desc'
}

export class ListMemberDto {
    @ApiPropertyOptional({ default: 1 })
    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({ default: 10 })
    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    @Min(1)
    limit?: number;

    @ApiPropertyOptional({ description: 'Search term for firstName, lastName, email, or code' })
    @IsString()
    @IsOptional()
    search?: string;

    @ApiPropertyOptional({ description: 'Field to sort by', default: 'createdAt' })
    @IsString()
    @IsOptional()
    sortBy?: string;

    @ApiPropertyOptional({
        enum: SortOrder,
        default: SortOrder.DESC,
        description: 'Sort order (asc or desc)'
    })
    @IsEnum(SortOrder)
    @IsOptional()
    sortOrder?: SortOrder;
}