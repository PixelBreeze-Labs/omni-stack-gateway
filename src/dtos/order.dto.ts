// src/dtos/order.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsNumber, Min, IsObject, IsArray } from 'class-validator';

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

export class SourceDto {
    @ApiProperty()
    @IsString()
    type: string;

    @ApiProperty()
    @IsString()
    platform: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    url?: string;

    @ApiProperty()
    @IsString()
    externalOrderId: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    externalCustomerId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    externalCustomerEmail?: string;
}

export class OrderItemDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    productId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    externalProductId?: string;

    @ApiProperty()
    @IsString()
    name: string;

    @ApiProperty()
    @IsNumber()
    quantity: number;

    @ApiProperty()
    @IsNumber()
    price: number;

    @ApiProperty()
    @IsNumber()
    total: number;
}

export class CreateOrderDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    orderNumber?: string;

    @ApiProperty()
    @IsObject()
    source: SourceDto;

    @ApiProperty()
    @IsString()
    status: string;

    @ApiProperty()
    @IsString()
    paymentMethod: string;

    @ApiProperty()
    @IsNumber()
    subtotal: number;

    @ApiProperty()
    @IsNumber()
    total: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    discount?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    currency?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    exchangeRate?: number;

    @ApiProperty({ type: [OrderItemDto] })
    @IsArray()
    items: OrderItemDto[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsObject()
    metadata?: Record<string, any>;
}