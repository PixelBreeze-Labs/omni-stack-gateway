// src/dtos/customer.dto.ts
import {
    IsNotEmpty,
    IsString,
    IsEmail,
    IsOptional,
    IsEnum,
    IsObject,
    IsNumber,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CustomerStatus, CustomerType, FilterStatus, FilterType } from '../types/customer.types';

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

    @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'], enumName: 'CustomerStatus' })
    @IsEnum(['ACTIVE', 'INACTIVE'])
    @IsNotEmpty()
    status: CustomerStatus;

    @ApiProperty({ enum: ['REGULAR', 'VIP'], enumName: 'CustomerType' })
    @IsEnum(['REGULAR', 'VIP'])
    @IsNotEmpty()
    type: CustomerType;

    @ApiProperty({
        required: false,
        description: "External IDs as key-value pairs",
        example: { "erp_id": "123", "pos_id": "456" }
    })
    @IsOptional()
    @IsObject()
    external_ids?: Record<string, any>;

    @ApiProperty({ required: false, readOnly: true })
    @IsOptional()
    clientId?: string;
}

// Using PartialType from @nestjs/swagger automatically makes all fields optional
export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    override userId?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    override firstName?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    override lastName?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsEmail()
    override email?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    override phone?: string;

    @ApiProperty({ required: false, enum: ['ACTIVE', 'INACTIVE'] })
    @IsOptional()
    @IsEnum(['ACTIVE', 'INACTIVE'])
    override status?: CustomerStatus;

    @ApiProperty({ required: false, enum: ['REGULAR', 'VIP'] })
    @IsOptional()
    @IsEnum(['REGULAR', 'VIP'])
    override type?: CustomerType;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsObject()
    override external_ids?: Record<string, any>;
}

export class ListCustomerDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    search?: string;

    @ApiProperty({ required: false, default: 1, minimum: 1 })
    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    @Min(1)
    page?: number = 1;

    @ApiProperty({ required: false, default: 10, minimum: 1 })
    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    @Min(1)
    limit?: number = 10;

    @ApiProperty({
        required: false,
        enum: ['ACTIVE', 'INACTIVE', 'ALL'],
        default: 'ALL'
    })
    @IsOptional()
    @IsEnum(['ACTIVE', 'INACTIVE', 'ALL'])
    status?: FilterStatus = 'ALL';

    @ApiProperty({
        required: false,
        enum: ['REGULAR', 'VIP', 'ALL'],
        default: 'ALL'
    })
    @IsOptional()
    @IsEnum(['REGULAR', 'VIP', 'ALL'])
    type?: FilterType = 'ALL';

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString({ each: true })
    clientIds?: string[];

    @ApiProperty({
        required: false,
        enum: ['firstName', 'lastName', 'email', 'createdAt', 'updatedAt']
    })
    @IsOptional()
    @IsString()
    sortBy?: string;

    @ApiProperty({ required: false, enum: ['asc', 'desc'], default: 'desc' })
    @IsOptional()
    @IsEnum(['asc', 'desc'])
    sortOrder?: 'asc' | 'desc' = 'desc';
}

// No need for separate PartialUpdateCustomerDto since UpdateCustomerDto is already partial
export { UpdateCustomerDto as PartialUpdateCustomerDto };