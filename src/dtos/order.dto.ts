// src/dtos/order.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class ListOrderDto {
    @ApiPropertyOptional({ example: 'ORD-123' })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ example: 10 })
    @IsOptional()
    @IsNumber()
    @Min(1)
    limit?: number;

    @ApiPropertyOptional({ example: 1 })
    @IsOptional()
    @IsNumber()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({ enum: ['PENDING', 'PAID', 'REFUNDED', 'CANCELLED', 'PARTIALLY_REFUNDED'] })
    @IsOptional()
    @IsEnum(['PENDING', 'PAID', 'REFUNDED', 'CANCELLED', 'PARTIALLY_REFUNDED'])
    status?: string;

    @ApiPropertyOptional({ example: '2024-01-01' })
    @IsOptional()
    @IsString()
    dateFrom?: string;

    @ApiPropertyOptional({ example: '2024-12-31' })
    @IsOptional()
    @IsString()
    dateTo?: string;
}

export class UpdateOrderStatusDto {
    @ApiProperty({ enum: ['PAID', 'REFUNDED', 'CANCELLED', 'PARTIALLY_REFUNDED'] })
    @IsEnum(['PAID', 'REFUNDED', 'CANCELLED', 'PARTIALLY_REFUNDED'])
    status: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    note?: string;
}

export class AddOrderNoteDto {
    @ApiProperty()
    @IsString()
    note: string;
}