// src/dtos/sales/customer.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SalesListCustomerDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    search?: string;

    @ApiProperty({ required: false, default: 1 })
    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    @Min(1)
    page?: number = 1;

    @ApiProperty({ required: false, default: 20 })
    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    @Min(1)
    limit?: number = 20;
}

export class SalesCustomerResponse {
    id: string;
    fullName: string;
    avatarInitials: string;
    email: string;
    loyaltyLevel: string;
}