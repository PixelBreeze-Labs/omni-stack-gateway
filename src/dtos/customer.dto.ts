// src/dtos/customer.dto.ts
import {
    IsNotEmpty,
    IsString,
    IsEmail,
    IsOptional,
    IsEnum,
    IsArray,
    IsObject,
    IsNumber,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCustomerDto {
    @ApiProperty({ required: false, description: "User ID reference" })
    @IsOptional()
    @IsString()
    userId?: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    firstName: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    lastName: string;

    @ApiProperty()
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
    @IsEnum(['ACTIVE', 'INACTIVE'])
    status: string;

    @ApiProperty({ enum: ['REGULAR', 'VIP'] })
    @IsEnum(['REGULAR', 'VIP'])
    type: string;

    @ApiProperty({ required: false, description: "External IDs as key-value pairs" })
    @IsOptional()
    @IsObject()
    external_ids?: Record<string, any>;
}

export class UpdateCustomerDto {
    @ApiProperty({ required: false, description: "User ID reference" })
    @IsOptional()
    @IsString()
    userId?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    firstName?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    lastName?: string;

    @ApiProperty({ required: false })
    @IsEmail()
    @IsOptional()
    email?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiProperty({ required: false, enum: ['ACTIVE', 'INACTIVE'] })
    @IsEnum(['ACTIVE', 'INACTIVE'])
    @IsOptional()
    status?: string;

    @ApiProperty({ required: false, enum: ['REGULAR', 'VIP'] })
    @IsEnum(['REGULAR', 'VIP'])
    @IsOptional()
    type?: string;


    @ApiProperty({ required: false, description: "External IDs as key-value pairs" })
    @IsOptional()
    @IsObject()
    external_ids?: Record<string, any>;
}

export class ListCustomerDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    search?: string;

    @ApiProperty({ required: false, default: 1 })
    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    @Min(1)
    page?: number;

    @ApiProperty({ required: false, default: 10 })
    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    @Min(1)
    limit?: number;

    @ApiProperty({ required: false, enum: ['ACTIVE', 'INACTIVE', 'ALL'] })
    @IsString()
    @IsOptional()
    status?: string;

    @ApiProperty({ required: false, enum: ['REGULAR', 'VIP', 'ALL'] })
    @IsString()
    @IsOptional()
    type?: string;

}
