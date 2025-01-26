// src/dto/inventory-adjustment.dto.ts
import {IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min} from "class-validator";
import {Type} from "class-transformer";
import {ApiProperty} from "@nestjs/swagger";

export class CreateAdjustmentDto {
    @ApiProperty({ description: 'Product identifier' })
    @IsString()
    @IsNotEmpty()
    productId: string;

    @ApiProperty({ description: 'Warehouse identifier' })
    @IsString()
    @IsNotEmpty()
    warehouseId: string;

    @ApiProperty({ description: 'Adjustment quantity', minimum: 0 })
    @IsNumber()
    @Min(0)
    quantity: number;

    @ApiProperty({
        enum: ['INCREASE', 'DECREASE', 'SET'],
        description: 'Adjustment type'
    })
    @IsEnum(['INCREASE', 'DECREASE', 'SET'])
    type: string;

    @ApiProperty({ description: 'Adjustment reason' })
    @IsString()
    @IsNotEmpty()
    reason: string;

    @ApiProperty({ description: 'Adjustment category' })
    @IsString()
    @IsNotEmpty()
    category: string;

    @ApiProperty({ description: 'User who initiated adjustment' })
    @IsString()
    initiatedBy: string;
}

export class ListAdjustmentsDto {
    @ApiProperty({
        enum: ['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED'],
        required: false
    })
    @IsOptional()
    @IsEnum(['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED'])
    status?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    warehouseId?: string;

    @ApiProperty({ minimum: 1, required: false })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    page?: number;

    @ApiProperty({ minimum: 1, required: false })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    limit?: number;
}
